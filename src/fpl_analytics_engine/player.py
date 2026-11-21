"""Build a single player's detail view: per-gameweek form and season history.

Rolling form is point-in-time, like the rest of the engine: at each gameweek
the rolling figures use only that gameweek and the ``window - 1`` before it.
Players are tracked across seasons by their stable ``code``, since the FPL
``element`` id is reassigned every season.
"""

import polars as pl

from fpl_analytics_engine.domain import (
    PARTIAL_EXPECTED_STAT_SEASON,
    PARTIAL_EXPECTED_STAT_START_GW,
)

DEFAULT_ROLLING_WINDOW = 5


def _has_expected_stats() -> pl.Expr:
    """Return whether a row belongs to a gameweek with expected stats."""
    return (pl.col("season") != PARTIAL_EXPECTED_STAT_SEASON) | (
        pl.col("round") >= PARTIAL_EXPECTED_STAT_START_GW
    )


def player_gameweeks(season_history: pl.DataFrame, window: int) -> pl.DataFrame:
    """Per-gameweek detail for one player within a single season.

    Args:
        season_history: One player's rows for a single season.
        window: Number of gameweeks in the rolling window, including all
            double-gameweek fixtures without backfilling blank gameweeks.

    Returns:
        The rows sorted by gameweek, with a ``price`` column, rolling expected
        attacking output per 90, and the rolling mean defensive-contribution
        count over the trailing ``window`` gameweeks. Every fixture in a
        double gameweek shares the same end-of-gameweek rolling figures.
    """
    sort_columns = ["round"]
    if "kickoff_time" in season_history.columns:
        sort_columns.append("kickoff_time")

    has_expected_stats = _has_expected_stats()
    return (
        season_history.sort(sort_columns)
        .with_columns(
            (pl.col("value") / 10).alias("price"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_goals"))
            .otherwise(None)
            .alias("expected_goals"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_assists"))
            .otherwise(None)
            .alias("expected_assists"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_goal_involvements"))
            .otherwise(None)
            .alias("expected_goal_involvements"),
            pl.when(has_expected_stats)
            .then(pl.col("minutes"))
            .otherwise(0)
            .alias("_expected_minutes"),
            # Exclude 0-minute rows from rolling DefCon averages while keeping
            # the raw per-gameweek defensive_contribution column intact.
            pl.when(pl.col("minutes") > 0)
            .then(pl.col("defensive_contribution").cast(pl.Float64))
            .otherwise(None)
            .alias("_appeared_defcon"),
        )
        .with_columns(
            pl.col("expected_goals")
            .rolling_sum_by("round", window_size=f"{window}i", min_samples=1)
            .alias("_rolling_xg"),
            pl.col("expected_assists")
            .rolling_sum_by("round", window_size=f"{window}i", min_samples=1)
            .alias("_rolling_xa"),
            pl.col("expected_goal_involvements")
            .rolling_sum_by("round", window_size=f"{window}i", min_samples=1)
            .alias("_rolling_xgi"),
            pl.col("_expected_minutes")
            .rolling_sum_by("round", window_size=f"{window}i", min_samples=1)
            .alias("_rolling_expected_min"),
            # Mean defensive-contribution count per appearance - a continuous
            # trend that stays informative below the points threshold, unlike a
            # hit-rate that is flat at 0 for most attacking players.
            pl.col("_appeared_defcon")
            .rolling_mean_by("round", window_size=f"{window}i", min_samples=1)
            .alias("rolling_defcon"),
        )
        .with_columns(
            pl.when(pl.col("_rolling_expected_min") > 0)
            .then(pl.col("_rolling_xg") / pl.col("_rolling_expected_min") * 90)
            .otherwise(None)
            .alias("rolling_xg90"),
            pl.when(pl.col("_rolling_expected_min") > 0)
            .then(pl.col("_rolling_xa") / pl.col("_rolling_expected_min") * 90)
            .otherwise(None)
            .alias("rolling_xa90"),
            pl.when(pl.col("_rolling_expected_min") > 0)
            .then(pl.col("_rolling_xgi") / pl.col("_rolling_expected_min") * 90)
            .otherwise(None)
            .alias("rolling_xgi90"),
        )
        .drop(
            "_expected_minutes",
            "_appeared_defcon",
            "_rolling_xg",
            "_rolling_xa",
            "_rolling_xgi",
            "_rolling_expected_min",
        )
    )


def season_summaries(player_history: pl.DataFrame) -> pl.DataFrame:
    """Per-season aggregates for one player across every archived season.

    Args:
        player_history: All of a single player's rows, across seasons.

    Returns:
        One row per season with full-season games, minutes, points, points per
        million, expected attacking output per 90, and DefCon hit-rate (null
        where DefCon data does not exist), sorted by season. Expected-stat rates
        for 2022-23 use only GW16 onward because the archive has no expected
        stats before then.
    """
    has_expected_stats = _has_expected_stats()
    return (
        player_history.group_by("season")
        .agg(
            pl.len().alias("games"),
            pl.col("minutes").sum().alias("minutes"),
            pl.col("total_points").sum().alias("points"),
            pl.when(has_expected_stats)
            .then(pl.col("minutes"))
            .otherwise(0)
            .sum()
            .alias("_expected_minutes"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_goals"))
            .otherwise(0)
            .sum()
            .alias("_xg"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_assists"))
            .otherwise(0)
            .sum()
            .alias("_xa"),
            pl.when(has_expected_stats)
            .then(pl.col("expected_goal_involvements"))
            .otherwise(0)
            .sum()
            .alias("_xgi"),
            (pl.col("value").sort_by("round").last() / 10).alias("_price"),
            pl.col("defcon_hit")
            .filter(pl.col("minutes") > 0)
            .sum()
            .alias("_defcon_hits"),
            pl.col("defcon_hit")
            .filter(pl.col("minutes") > 0)
            .count()
            .alias("_defcon_games"),
        )
        .with_columns(
            pl.when(pl.col("_expected_minutes") > 0)
            .then(pl.col("_xg") / pl.col("_expected_minutes") * 90)
            .otherwise(None)
            .alias("xg90"),
            pl.when(pl.col("_expected_minutes") > 0)
            .then(pl.col("_xa") / pl.col("_expected_minutes") * 90)
            .otherwise(None)
            .alias("xa90"),
            pl.when(pl.col("_expected_minutes") > 0)
            .then(pl.col("_xgi") / pl.col("_expected_minutes") * 90)
            .otherwise(None)
            .alias("xgi90"),
            pl.when(pl.col("_price") > 0)
            .then(pl.col("points") / pl.col("_price"))
            .otherwise(None)
            .alias("points_per_million"),
            pl.when(pl.col("_defcon_games") > 0)
            .then(pl.col("_defcon_hits") / pl.col("_defcon_games"))
            .otherwise(None)
            .alias("defcon_hit_rate"),
        )
        .sort("season")
        .drop(
            "_expected_minutes",
            "_xg",
            "_xa",
            "_xgi",
            "_price",
            "_defcon_hits",
            "_defcon_games",
        )
    )

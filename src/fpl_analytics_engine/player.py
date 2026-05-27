"""Build a single player's detail view: per-gameweek form and season history.

Rolling form is point-in-time, like the rest of the engine: at each gameweek
the rolling figures use only that gameweek and the ``window - 1`` before it.
Players are tracked across seasons by their stable ``code``, since the FPL
``element`` id is reassigned every season.
"""

import polars as pl

DEFAULT_ROLLING_WINDOW = 5


def player_gameweeks(season_history: pl.DataFrame, window: int) -> pl.DataFrame:
    """Per-gameweek detail for one player within a single season.

    Args:
        season_history: One player's rows for a single season.
        window: Number of most-recent games in the rolling window.

    Returns:
        The rows sorted by gameweek, with a ``price`` column, rolling expected
        attacking output per 90, and the rolling mean defensive-contribution
        count over the trailing ``window`` games.
    """
    sort_columns = ["round"]
    if "kickoff_time" in season_history.columns:
        sort_columns.append("kickoff_time")

    return (
        season_history.sort(sort_columns)
        .with_columns(
            (pl.col("value") / 10).alias("price"),
            pl.col("expected_goals")
            .rolling_sum(window, min_samples=1)
            .alias("_rolling_xg"),
            pl.col("expected_assists")
            .rolling_sum(window, min_samples=1)
            .alias("_rolling_xa"),
            pl.col("expected_goal_involvements")
            .rolling_sum(window, min_samples=1)
            .alias("_rolling_xgi"),
            pl.col("minutes").rolling_sum(window, min_samples=1).alias("_rolling_min"),
            # Mean defensive-contribution count per game - a continuous trend
            # that stays informative below the points threshold, unlike a
            # hit-rate that is flat at 0 for most attacking players.
            pl.col("defensive_contribution")
            .cast(pl.Float64)
            .rolling_mean(window, min_samples=1)
            .alias("rolling_defcon"),
        )
        .with_columns(
            pl.when(pl.col("_rolling_min") > 0)
            .then(pl.col("_rolling_xg") / pl.col("_rolling_min") * 90)
            .otherwise(None)
            .alias("rolling_xg90"),
            pl.when(pl.col("_rolling_min") > 0)
            .then(pl.col("_rolling_xa") / pl.col("_rolling_min") * 90)
            .otherwise(None)
            .alias("rolling_xa90"),
            pl.when(pl.col("_rolling_min") > 0)
            .then(pl.col("_rolling_xgi") / pl.col("_rolling_min") * 90)
            .otherwise(None)
            .alias("rolling_xgi90"),
        )
        .drop("_rolling_xg", "_rolling_xa", "_rolling_xgi", "_rolling_min")
    )


def season_summaries(player_history: pl.DataFrame) -> pl.DataFrame:
    """Per-season aggregates for one player across every archived season.

    Args:
        player_history: All of a single player's rows, across seasons.

    Returns:
        One row per season with games, minutes, expected attacking output per
        90, points, points per million, and DefCon hit-rate (null where DefCon
        data does not exist), sorted by season.
    """
    return (
        player_history.group_by("season")
        .agg(
            pl.len().alias("games"),
            pl.col("minutes").sum().alias("minutes"),
            pl.col("total_points").sum().alias("points"),
            pl.col("expected_goals").sum().alias("_xg"),
            pl.col("expected_assists").sum().alias("_xa"),
            pl.col("expected_goal_involvements").sum().alias("_xgi"),
            (pl.col("value").sort_by("round").last() / 10).alias("_price"),
            pl.col("defcon_hit").sum().alias("_defcon_hits"),
            pl.col("defcon_hit").drop_nulls().len().alias("_defcon_games"),
        )
        .with_columns(
            pl.when(pl.col("minutes") > 0)
            .then(pl.col("_xg") / pl.col("minutes") * 90)
            .otherwise(None)
            .alias("xg90"),
            pl.when(pl.col("minutes") > 0)
            .then(pl.col("_xa") / pl.col("minutes") * 90)
            .otherwise(None)
            .alias("xa90"),
            pl.when(pl.col("minutes") > 0)
            .then(pl.col("_xgi") / pl.col("minutes") * 90)
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
        .drop("_xg", "_xa", "_xgi", "_price", "_defcon_hits", "_defcon_games")
    )

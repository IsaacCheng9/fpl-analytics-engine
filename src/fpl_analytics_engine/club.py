"""Compute point-in-time club form from player and fixture history."""

from typing import cast

import polars as pl

DEFAULT_WINDOW = 5


def _per_match(total: str, matches: str) -> pl.Expr:
    """Build a per-match rate expression, guarding against zero matches.

    Args:
        total: Name of the column holding the summed stat.
        matches: Name of the column holding the match count.

    Returns:
        An expression yielding the per-match rate, or null when matches are
        zero.
    """
    return (
        pl.when(pl.col(matches) > 0)
        .then(pl.col(total) / pl.col(matches))
        .otherwise(None)
    )


def _compute_club_fixtures(history: pl.DataFrame) -> pl.DataFrame:
    """Aggregate player gameweek history to one row per club per fixture.

    Team attacking output is summed from player xG. Goals for and against come
    from the fixture score carried on each player row. Team xGC is taken from
    the maximum player xGC in the fixture, because FPL stores each player's
    on-pitch xGC rather than a team row. Summing player xGC would multiply the
    same team chance-concession context across the XI.

    Args:
        history: Enriched current-season per-gameweek player history.

    Returns:
        One row per club per fixture.

    Raises:
        ValueError: If the history is missing columns needed for club
            aggregation.
    """
    required = {
        "fixture",
        "team",
        "team_name",
        "round",
        "kickoff_time",
        "was_home",
        "team_h_score",
        "team_a_score",
        "minutes",
        "expected_goals",
        "expected_goals_conceded",
    }
    missing = sorted(required - set(history.columns))
    if missing:
        raise ValueError(f"Missing club-form columns: {', '.join(missing)}")

    return (
        history.with_columns(
            pl.when(pl.col("was_home"))
            .then(pl.col("team_h_score"))
            .otherwise(pl.col("team_a_score"))
            .alias("_goals_for"),
            pl.when(pl.col("was_home"))
            .then(pl.col("team_a_score"))
            .otherwise(pl.col("team_h_score"))
            .alias("_goals_against"),
        )
        .group_by("team", "fixture")
        .agg(
            pl.col("team_name").last(),
            pl.col("round").max(),
            pl.col("kickoff_time").max(),
            pl.col("_goals_for").max().alias("goals_for"),
            pl.col("_goals_against").max().alias("goals_against"),
            pl.col("expected_goals").sum().alias("xg"),
            pl.col("expected_goals_conceded")
            .filter(pl.col("minutes") > 0)
            .max()
            .alias("xgc"),
        )
    )


def compute_club_gameweeks(history: pl.DataFrame) -> pl.DataFrame:
    """Aggregate player gameweek history to one row per club per gameweek.

    Args:
        history: Enriched current-season per-gameweek player history.

    Returns:
        One row per club per gameweek, with double gameweeks collapsed by
        summing the club's fixtures in that gameweek.
    """
    return (
        _compute_club_fixtures(history)
        .group_by("team", "team_name", "round")
        .agg(
            pl.len().alias("matches"),
            pl.col("kickoff_time").max(),
            pl.col("goals_for").sum(),
            pl.col("goals_against").sum(),
            pl.col("xg").sum(),
            pl.col("xgc").sum(),
        )
        .sort("round", "team_name")
    )


def compute_club_form_table(
    history: pl.DataFrame, as_of_gw: int, window: int = DEFAULT_WINDOW
) -> pl.DataFrame:
    """Compute each club's recent form versus its season-to-date baseline.

    Args:
        history: Enriched current-season per-gameweek player history.
        as_of_gw: Gameweek to evaluate as of; later gameweeks are ignored.
        window: Number of most-recent club matches to treat as the form window.

    Returns:
        One row per club with attacking and defensive per-match metrics for the
        recent window and season-to-date baseline.
    """
    point_in_time = _compute_club_fixtures(history).filter(pl.col("round") <= as_of_gw)
    recent = (
        point_in_time.sort("round", "kickoff_time")
        .group_by("team", maintain_order=True)
        .tail(window)
    )

    window_agg = recent.group_by("team").agg(
        pl.col("team_name").last(),
        pl.len().alias("window_matches"),
        pl.col("goals_for").sum().alias("window_goals_for"),
        pl.col("goals_against").sum().alias("window_goals_against"),
        pl.col("xg").sum().alias("window_xg"),
        pl.col("xgc").sum().alias("window_xgc"),
    )
    season_agg = point_in_time.group_by("team").agg(
        pl.len().alias("season_matches"),
        pl.col("goals_for").sum().alias("season_goals_for"),
        pl.col("goals_against").sum().alias("season_goals_against"),
        pl.col("xg").sum().alias("season_xg"),
        pl.col("xgc").sum().alias("season_xgc"),
    )

    return (
        window_agg.join(season_agg, on="team")
        .with_columns(
            window_xg_per_match=_per_match("window_xg", "window_matches"),
            season_xg_per_match=_per_match("season_xg", "season_matches"),
            window_goals_for_per_match=_per_match("window_goals_for", "window_matches"),
            season_goals_for_per_match=_per_match("season_goals_for", "season_matches"),
            window_xgc_per_match=_per_match("window_xgc", "window_matches"),
            season_xgc_per_match=_per_match("season_xgc", "season_matches"),
            window_goals_against_per_match=_per_match(
                "window_goals_against", "window_matches"
            ),
            season_goals_against_per_match=_per_match(
                "season_goals_against", "season_matches"
            ),
        )
        .with_columns(
            (pl.col("window_xg_per_match") - pl.col("season_xg_per_match")).alias(
                "delta_xg_per_match"
            ),
            (
                pl.col("window_goals_for_per_match")
                - pl.col("season_goals_for_per_match")
            ).alias("delta_goals_for_per_match"),
            (pl.col("window_xgc_per_match") - pl.col("season_xgc_per_match")).alias(
                "delta_xgc_per_match"
            ),
            (
                pl.col("window_goals_against_per_match")
                - pl.col("season_goals_against_per_match")
            ).alias("delta_goals_against_per_match"),
            (
                pl.col("window_goals_for_per_match") - pl.col("window_xg_per_match")
            ).alias("window_finishing_delta"),
            (
                pl.col("window_goals_against_per_match")
                - pl.col("window_xgc_per_match")
            ).alias("window_concession_delta"),
            pl.lit(as_of_gw).alias("as_of_gw"),
        )
        .with_columns(
            pl.col("delta_xg_per_match").alias("attack_form"),
            (-pl.col("delta_xgc_per_match")).alias("defence_form"),
        )
        .sort("attack_form", descending=True, nulls_last=True)
    )


def flag_clubs(
    club_table: pl.DataFrame,
    min_attack_delta: float = 0.0,
    min_defence_delta: float = 0.0,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Filter clubs whose recent form has improved against their baseline.

    Args:
        club_table: Output of :func:`compute_club_form_table`.
        min_attack_delta: Minimum recent xG per match improvement.
        min_defence_delta: Minimum recent xGC per match improvement, expressed
            as a positive defensive score.
        top_k: Optional cap on the number of clubs returned.

    Returns:
        Clubs matching at least one form threshold, sorted by combined form.
    """
    flagged = club_table.filter(
        (pl.col("attack_form") >= min_attack_delta)
        | (pl.col("defence_form") >= min_defence_delta)
    ).with_columns(
        (pl.col("attack_form") + pl.col("defence_form")).alias("_form_score")
    )
    flagged = flagged.sort("_form_score", descending=True, nulls_last=True).drop(
        "_form_score"
    )
    if top_k is not None:
        flagged = flagged.head(top_k)
    return flagged


def latest_gameweek(history: pl.DataFrame) -> int:
    """Return the latest gameweek in the club history."""
    return cast(int, history["round"].max())

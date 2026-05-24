"""Compute point-in-time player form and backtest which players are flagged.

All form metrics are strictly point-in-time: as of a given gameweek, only data
from that gameweek and earlier is used, for both the recent window and the
season-to-date baseline. This is what lets :func:`backtest_flags` replay each
gameweek without leaking future information.
"""

from typing import cast

import polars as pl

DEFAULT_WINDOW = 5


def _per_90(total: str, minutes: str) -> pl.Expr:
    """Build a per-90 rate expression, guarding against zero minutes.

    Args:
        total: Name of the column holding the summed stat.
        minutes: Name of the column holding the summed minutes.

    Returns:
        An expression yielding the per-90 rate, or null when minutes are zero.
    """
    return (
        pl.when(pl.col(minutes) > 0)
        .then(pl.col(total) / pl.col(minutes) * 90)
        .otherwise(None)
    )


def compute_form_table(
    history: pl.DataFrame, as_of_gw: int, window: int = DEFAULT_WINDOW
) -> pl.DataFrame:
    """Compute each player's recent-window form versus season-to-date form.

    Only games up to and including ``as_of_gw`` are used, so the result is the
    exact view that would have been available at that point in the season. Both
    the window and the season-to-date baseline respect this cut-off, so there
    is no look-ahead.

    Args:
        history: Enriched per-gameweek history from
            :func:`fpl_analytics_engine.data.prepare_history`.
        as_of_gw: Gameweek to evaluate as of; later gameweeks are ignored.
        window: Number of most-recent games to treat as the form window.

    Returns:
        One row per player with window and season-to-date per-90 expected
        stats, their deltas, the window DefCon hit-rate, and ``as_of_gw``.
    """
    point_in_time = history.filter(pl.col("round") <= as_of_gw)
    recent = (
        point_in_time.sort("kickoff_time")
        .group_by("element", maintain_order=True)
        .tail(window)
    )

    window_agg = recent.group_by("element").agg(
        pl.len().alias("window_games"),
        pl.col("minutes").sum().alias("window_minutes"),
        pl.col("expected_goals").sum().alias("window_xg"),
        pl.col("expected_assists").sum().alias("window_xa"),
        pl.col("expected_goal_involvements").sum().alias("window_xgi"),
        pl.col("expected_goals_conceded").sum().alias("window_xgc"),
        pl.col("total_points").sum().alias("window_points"),
        pl.col("defcon_hit").sum().alias("window_defcon_hits"),
        pl.col("defcon_hit").count().alias("window_defcon_games"),
    )
    season_agg = point_in_time.group_by("element").agg(
        pl.col("minutes").sum().alias("season_minutes"),
        pl.col("expected_goals").sum().alias("season_xg"),
        pl.col("expected_assists").sum().alias("season_xa"),
        pl.col("expected_goal_involvements").sum().alias("season_xgi"),
        pl.col("expected_goals_conceded").sum().alias("season_xgc"),
        pl.col("total_points").sum().alias("season_points"),
    )
    # Static metadata plus point-in-time price (the value at the latest game).
    meta = (
        point_in_time.sort("kickoff_time")
        .group_by("element")
        .agg(
            pl.col("web_name").last(),
            pl.col("position").last(),
            pl.col("team_name").last(),
            (pl.col("value").last() / 10).alias("price"),
        )
    )

    return (
        meta.join(window_agg, on="element")
        .join(season_agg, on="element")
        .with_columns(
            window_xg90=_per_90("window_xg", "window_minutes"),
            window_xa90=_per_90("window_xa", "window_minutes"),
            window_xgi90=_per_90("window_xgi", "window_minutes"),
            window_xgc90=_per_90("window_xgc", "window_minutes"),
            season_xg90=_per_90("season_xg", "season_minutes"),
            season_xa90=_per_90("season_xa", "season_minutes"),
            season_xgi90=_per_90("season_xgi", "season_minutes"),
            season_xgc90=_per_90("season_xgc", "season_minutes"),
        )
        .with_columns(
            (pl.col("window_xg90") - pl.col("season_xg90")).alias("delta_xg90"),
            (pl.col("window_xa90") - pl.col("season_xa90")).alias("delta_xa90"),
            (pl.col("window_xgi90") - pl.col("season_xgi90")).alias("delta_xgi90"),
            pl.when(pl.col("window_defcon_games") > 0)
            .then(pl.col("window_defcon_hits") / pl.col("window_defcon_games"))
            .otherwise(None)
            .alias("window_defcon_hit_rate"),
            pl.lit(as_of_gw).alias("as_of_gw"),
        )
    )


def flag_players(
    form_table: pl.DataFrame,
    min_window_minutes: int = 0,
    min_delta_xgi90: float = 0.0,
    position: str | None = None,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Filter and rank a form table to the players worth a look.

    Args:
        form_table: Output of :func:`compute_form_table`.
        min_window_minutes: Minimum minutes in the window to qualify, to drop
            small-sample noise.
        min_delta_xgi90: Minimum xGI90 improvement over the season baseline.
        position: Optional position filter ('GK', 'DEF', 'MID', 'FWD').
        top_k: Optional cap on the number of players returned.

    Returns:
        The qualifying players sorted by ``delta_xgi90`` descending. Players
        with a null delta (no minutes) are dropped by the delta filter.
    """
    flagged = form_table.filter(
        pl.col("window_minutes") >= min_window_minutes,
        pl.col("delta_xgi90") >= min_delta_xgi90,
    )
    if position is not None:
        flagged = flagged.filter(pl.col("position") == position)
    flagged = flagged.sort("delta_xgi90", descending=True, nulls_last=True)
    if top_k is not None:
        flagged = flagged.head(top_k)
    return flagged


def backtest_flags(
    history: pl.DataFrame,
    window: int = DEFAULT_WINDOW,
    gw_range: range | None = None,
    *,
    min_window_minutes: int = 0,
    min_delta_xgi90: float = 0.0,
    position: str | None = None,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Replay the flagging logic point-in-time across a range of gameweeks.

    For each gameweek the form table is built from only the data available then
    and :func:`flag_players` is applied, so the result shows exactly which
    players would have been flagged after each gameweek.

    Args:
        history: Enriched per-gameweek history.
        window: Form-window size passed to :func:`compute_form_table`.
        gw_range: Gameweeks to evaluate; defaults to ``window`` through the last
            gameweek present in the data.
        min_window_minutes: Forwarded to :func:`flag_players`.
        min_delta_xgi90: Forwarded to :func:`flag_players`.
        position: Forwarded to :func:`flag_players`.
        top_k: Forwarded to :func:`flag_players`.

    Returns:
        The flagged players across all evaluated gameweeks, tagged with
        ``as_of_gw``.
    """
    if gw_range is None:
        max_round = cast(int, history["round"].max())
        gw_range = range(window, max_round + 1)
    frames = [
        flag_players(
            compute_form_table(history, as_of_gw, window),
            min_window_minutes=min_window_minutes,
            min_delta_xgi90=min_delta_xgi90,
            position=position,
            top_k=top_k,
        )
        for as_of_gw in gw_range
    ]
    return pl.concat(frames, how="vertical") if frames else pl.DataFrame()


def evaluate_flags(history: pl.DataFrame, flags: pl.DataFrame) -> pl.DataFrame:
    """Attach each flagged player's points in the following gameweek.

    This is the backtest's outcome step and is deliberately separate from the
    point-in-time flagging - it is the only place future data is used, and only
    to score how the flags performed.

    Args:
        history: Enriched per-gameweek history.
        flags: Output of :func:`backtest_flags` (must include ``as_of_gw``).

    Returns:
        The flags with a ``next_gw_points`` column for gameweek ``as_of_gw + 1``
        (null where there is no following gameweek), summed across any double
        gameweek.
    """
    next_points = history.group_by("element", "round").agg(
        pl.col("total_points").sum().alias("next_gw_points")
    )
    return (
        flags.with_columns((pl.col("as_of_gw") + 1).alias("_next_gw"))
        .join(
            next_points,
            left_on=["element", "_next_gw"],
            right_on=["element", "round"],
            how="left",
        )
        .drop("_next_gw")
    )

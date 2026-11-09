"""Compute point-in-time player form and backtest which players are flagged.

All form metrics are strictly point-in-time: as of a given gameweek, only data
from that gameweek and earlier is used, for both the recent window and the
season-to-date baseline. This is what lets :func:`backtest_flags` replay each
gameweek without leaking future information.
"""

from typing import cast

import polars as pl

from fpl_analytics_engine.domain import (
    PARTIAL_EXPECTED_STAT_SEASON,
    PARTIAL_EXPECTED_STAT_START_GW,
)

DEFAULT_WINDOW = 5
# Last season's per-90 rate counts as this many extra minutes when estimating a
# player's underlying rate. Backtests over 2022-23 to 2025-26 found 900-1,350
# minutes best; shrinking players without a prior towards a positional mean
# made rankings worse, so they keep their season-to-date rate.
PRIOR_WEIGHT_MINUTES = 900
PRIOR_MIN_MINUTES = 900
# Weight on recent minutes per gameweek when projecting playing time. An even
# blend with the season rate minimised minutes forecast error in backtests.
PROJECTED_MINUTES_WINDOW_WEIGHT = 0.5
PRIOR_METRICS = ("xg", "xa", "xgi")
EXPECTED_STATS = {
    "xg": "expected_goals",
    "xa": "expected_assists",
    "xgi": "expected_goal_involvements",
    "xgc": "expected_goals_conceded",
}


def _expected_aggregates(prefix: str, covered: pl.Expr) -> list[pl.Expr]:
    """Sum each expected stat with only its matching observed minutes."""
    expressions = []
    for metric, column in EXPECTED_STATS.items():
        available = covered & pl.col(column).is_not_null()
        expressions.extend(
            (
                pl.col(column).filter(available).sum().alias(f"{prefix}_{metric}"),
                pl.col("minutes")
                .filter(available)
                .sum()
                .alias(f"_{prefix}_{metric}_minutes"),
            )
        )
    return expressions


def _covered(history: pl.DataFrame) -> pl.Expr:
    """Mark rows inside expected-stat coverage (GW16 onwards in 2022-23)."""
    if "season" not in history.columns:
        return pl.lit(True)
    return (pl.col("season") != PARTIAL_EXPECTED_STAT_SEASON) | (
        pl.col("round") >= PARTIAL_EXPECTED_STAT_START_GW
    )


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


def prior_season_rates(history: pl.DataFrame) -> pl.DataFrame:
    """Summarise a completed season into per-player per-90 expected rates.

    Args:
        history: Enriched history for the previous season, with the stable
            cross-season player ``code``.

    Returns:
        One row per ``code`` with ``prior_{metric}90`` and the covered minutes
        behind it as ``prior_{metric}_minutes``, for xG, xA and xGI.
    """
    if history.is_empty() or "code" not in history.columns:
        return pl.DataFrame(schema={"code": pl.Int64})
    return (
        history.group_by("code")
        .agg(*_expected_aggregates("prior", _covered(history)))
        .select(
            "code",
            *(
                _per_90(f"prior_{metric}", f"_prior_{metric}_minutes").alias(
                    f"prior_{metric}90"
                )
                for metric in PRIOR_METRICS
            ),
            *(
                pl.col(f"_prior_{metric}_minutes").alias(f"prior_{metric}_minutes")
                for metric in PRIOR_METRICS
            ),
        )
    )


def _estimate_per_90(metric: str) -> pl.Expr:
    """Shrink a season-to-date per-90 rate towards last season's rate.

    Last season's rate is added as ``PRIOR_WEIGHT_MINUTES`` of extra minutes,
    so it dominates early in the season and fades as this season's minutes
    accumulate. Players without ``PRIOR_MIN_MINUTES`` last season keep their
    season-to-date rate.
    """
    minutes = pl.col(f"_season_{metric}_minutes")
    shrunk = (
        (
            pl.col(f"season_{metric}")
            + pl.col(f"prior_{metric}90") * PRIOR_WEIGHT_MINUTES / 90
        )
        / (minutes + PRIOR_WEIGHT_MINUTES)
        * 90
    )
    return (
        pl.when(pl.col(f"prior_{metric}_minutes") >= PRIOR_MIN_MINUTES)
        .then(shrunk)
        .otherwise(pl.col(f"season_{metric}90"))
    )


def compute_form_table(
    history: pl.DataFrame,
    as_of_gw: int,
    window: int = DEFAULT_WINDOW,
    prior: pl.DataFrame | None = None,
) -> pl.DataFrame:
    """Compute each player's recent-window form versus season-to-date form.

    Only games up to and including ``as_of_gw`` are used, so the result is the
    exact view that would have been available at that point in the season. Both
    the window and the season-to-date baseline respect this cut-off, so there
    is no look-ahead. Expected-stat rates exclude minutes outside coverage
    (GW1-15 in 2022-23) or with a missing stat. Minutes and points totals still
    cover the full selected period.

    Args:
        history: Enriched single-season history. Include the ``season`` label
            for historical coverage rules; unlabelled live history is treated
            as fully covered apart from null stats.
        as_of_gw: Gameweek to evaluate as of; later gameweeks are ignored.
        window: Number of gameweeks ending at ``as_of_gw``. Include every
            fixture in that range; do not backfill blanks with older games.
        prior: Output of :func:`prior_season_rates` for the previous season.
            Without it (or without a ``code`` column in ``history``), the
            estimated rates equal the season-to-date rates.

    Returns:
        One row per player with window and season-to-date per-90 expected
        stats, their deltas, estimated underlying rates, window and season
        minutes per gameweek since the player joined, projected minutes and xGI
        per gameweek, the window DefCon hit-rate, and ``as_of_gw``.
    """
    # The per-gameweek start flag is absent from older canonical snapshots; when
    # missing, the start rate is reported null rather than a misleading zero.
    has_starts = "starts" in history.columns
    if not has_starts:
        history = history.with_columns(pl.lit(None, dtype=pl.Int64).alias("starts"))

    # DefCon counts only exist from 2025-26; guard so the mean is null elsewhere.
    if "defensive_contribution" not in history.columns:
        history = history.with_columns(
            pl.lit(None, dtype=pl.Int64).alias("defensive_contribution")
        )

    point_in_time = history.filter(pl.col("round") <= as_of_gw)
    recent = point_in_time.filter(pl.col("round") > as_of_gw - window)
    covered = _covered(history)
    has_code = "code" in history.columns
    if prior is None or not has_code or "prior_xgi90" not in prior.columns:
        prior = pl.DataFrame(
            schema={
                "code": pl.Int64,
                **{f"prior_{metric}90": pl.Float64 for metric in PRIOR_METRICS},
                **{f"prior_{metric}_minutes": pl.Int64 for metric in PRIOR_METRICS},
            }
        )

    window_agg = recent.group_by("element").agg(
        pl.len().alias("window_games"),
        pl.col("minutes").sum().alias("window_minutes"),
        *_expected_aggregates("window", covered),
        pl.col("total_points").sum().alias("window_points"),
        pl.col("starts").sum().alias("window_starts"),
        # Appearances exclude 0-minute games, so a cameo counts but an unused
        # substitute does not.
        (pl.col("minutes") > 0).sum().alias("window_appearances"),
        pl.col("defcon_hit").sum().alias("window_defcon_hits"),
        pl.col("defcon_hit").count().alias("window_defcon_games"),
        # Mean defensive-contribution count per window game - how close the
        # player runs to the threshold, regardless of whether they clear it.
        pl.col("defensive_contribution").mean().alias("window_defcon"),
    )
    season_agg = point_in_time.group_by("element").agg(
        pl.col("minutes").sum().alias("season_minutes"),
        *_expected_aggregates("season", covered),
        pl.col("total_points").sum().alias("season_points"),
        pl.col("round").min().alias("_first_round"),
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
            (pl.col("code") if has_code else pl.lit(None, dtype=pl.Int64))
            .last()
            .alias("code"),
        )
    )
    return (
        meta.join(window_agg, on="element", how="left")
        .join(season_agg, on="element")
        .join(prior, on="code", how="left")
        .with_columns(
            pl.col(window_agg.drop("element", "window_defcon").columns).fill_null(0)
        )
        .with_columns(
            _per_90(f"{period}_{metric}", f"_{period}_{metric}_minutes").alias(
                f"{period}_{metric}90"
            )
            for period in ("window", "season")
            for metric in EXPECTED_STATS
        )
        .with_columns(
            (pl.col("window_xg90") - pl.col("season_xg90")).alias("delta_xg90"),
            (pl.col("window_xa90") - pl.col("season_xa90")).alias("delta_xa90"),
            (pl.col("window_xgi90") - pl.col("season_xgi90")).alias("delta_xgi90"),
            pl.when(pl.col("window_defcon_games") > 0)
            .then(pl.col("window_defcon_hits") / pl.col("window_defcon_games"))
            .otherwise(None)
            .alias("window_defcon_hit_rate"),
            # Value efficiency, point-in-time on the window's closing price.
            pl.when(pl.col("price") > 0)
            .then(pl.col("window_xg90") / pl.col("price"))
            .otherwise(None)
            .alias("window_xg90_per_million"),
            pl.when(pl.col("price") > 0)
            .then(pl.col("window_xa90") / pl.col("price"))
            .otherwise(None)
            .alias("window_xa90_per_million"),
            pl.when(pl.col("price") > 0)
            .then(pl.col("window_xgi90") / pl.col("price"))
            .otherwise(None)
            .alias("window_xgi90_per_million"),
            pl.when(pl.col("price") > 0)
            .then(pl.col("season_points") / pl.col("price"))
            .otherwise(None)
            .alias("season_points_per_million"),
            # Window start rate as a point-in-time rotation signal.
            pl.when(pl.lit(has_starts) & (pl.col("window_games") > 0))
            .then(pl.col("window_starts") / pl.col("window_games"))
            .otherwise(None)
            .alias("window_start_rate"),
            # Average minutes per appearance, point-in-time (0-minute games
            # excluded from the denominator).
            pl.when(pl.col("window_appearances") > 0)
            .then(pl.col("window_minutes") / pl.col("window_appearances"))
            .otherwise(None)
            .alias("window_mins_per_appearance"),
            pl.lit(as_of_gw).alias("as_of_gw"),
            *(
                _estimate_per_90(metric).alias(f"est_{metric}90")
                for metric in PRIOR_METRICS
            ),
            # A player's history starts when they join the game, so a
            # mid-season signing is averaged over their own gameweeks rather
            # than the season's, and the window can cover all of them early on.
            (pl.lit(as_of_gw) - pl.col("_first_round") + 1).alias("_player_gws"),
        )
        .with_columns(
            (
                pl.col("window_minutes")
                / pl.min_horizontal(pl.lit(window), pl.col("_player_gws"))
            ).alias("window_mpg"),
            (pl.col("season_minutes") / pl.col("_player_gws")).alias("season_mpg"),
        )
        .with_columns(
            (
                PROJECTED_MINUTES_WINDOW_WEIGHT * pl.col("window_mpg")
                + (1 - PROJECTED_MINUTES_WINDOW_WEIGHT) * pl.col("season_mpg")
            ).alias("projected_minutes"),
        )
        .with_columns(
            # Expected xGI per gameweek: underlying rate times expected
            # minutes.
            (pl.col("est_xgi90") * pl.col("projected_minutes") / 90).alias(
                "projected_xgi"
            )
        )
        .drop(
            "code",
            "_first_round",
            "_player_gws",
            *(f"prior_{metric}90" for metric in PRIOR_METRICS),
            *(f"prior_{metric}_minutes" for metric in PRIOR_METRICS),
            *(
                f"_{period}_{metric}_minutes"
                for period in ("window", "season")
                for metric in EXPECTED_STATS
            ),
        )
    )


def flag_players(
    form_table: pl.DataFrame,
    min_window_minutes: int = 0,
    min_delta_xgi90: float | None = None,
    position: str | None = None,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Filter and rank a form table to the players worth a look.

    Args:
        form_table: Output of :func:`compute_form_table`.
        min_window_minutes: Minimum minutes in the window to qualify, to drop
            small-sample noise.
        min_delta_xgi90: Optional minimum xGI90 swing over the season
            baseline. Off by default, because the swing does not persist; when
            set, players with a null delta (no window minutes) are dropped.
        position: Optional position filter ('GK', 'DEF', 'MID', 'FWD').
        top_k: Optional cap on the number of players returned.

    Returns:
        The qualifying players sorted by ``projected_xgi`` descending, because
        backtests found it ranks future xGI best while the delta does not
        persist.
    """
    flagged = form_table.filter(pl.col("window_minutes") >= min_window_minutes)
    if min_delta_xgi90 is not None:
        flagged = flagged.filter(pl.col("delta_xgi90") >= min_delta_xgi90)
    if position is not None:
        flagged = flagged.filter(pl.col("position") == position)
    # Break ties on the estimated rate, then element, so equal projections
    # still rank deterministically.
    flagged = flagged.sort(
        "projected_xgi",
        "est_xgi90",
        "element",
        descending=[True, True, False],
        nulls_last=True,
    )
    if top_k is not None:
        flagged = flagged.head(top_k)
    return flagged


def flag_defcon(
    form_table: pl.DataFrame,
    min_window_minutes: int = 0,
    min_hit_rate: float = 0.0,
    position: str | None = None,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Filter and rank players by recent DefCon hit-rate.

    Args:
        form_table: Output of :func:`compute_form_table`.
        min_window_minutes: Minimum minutes in the window to qualify.
        min_hit_rate: Minimum window DefCon hit-rate; this also drops ineligible
            positions (GK and managers), whose hit-rate is null.
        position: Optional position filter ('DEF', 'MID', 'FWD').
        top_k: Optional cap on the number of players returned.

    Returns:
        The qualifying players sorted by ``window_defcon_hit_rate`` descending.
    """
    flagged = form_table.filter(
        pl.col("window_minutes") >= min_window_minutes,
        pl.col("window_defcon_hit_rate") >= min_hit_rate,
    )
    if position is not None:
        flagged = flagged.filter(pl.col("position") == position)
    flagged = flagged.sort(
        "window_defcon_hit_rate",
        "window_defcon",
        "element",
        descending=[True, True, False],
        nulls_last=True,
    )
    if top_k is not None:
        flagged = flagged.head(top_k)
    return flagged


def backtest_flags(
    history: pl.DataFrame,
    window: int = DEFAULT_WINDOW,
    gw_range: range | None = None,
    *,
    prior: pl.DataFrame | None = None,
    min_window_minutes: int = 0,
    min_delta_xgi90: float | None = None,
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
        prior: Forwarded to :func:`compute_form_table`, so the replay ranks
            on the same estimated rates as the live view.
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
            compute_form_table(history, as_of_gw, window, prior),
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
        history: Complete, finalised single-season history, including unused
            players. Treat gameweeks present in it as completed; do not pass
            provisional or player-filtered history.
        flags: Output of :func:`backtest_flags` (must include ``as_of_gw``).

    Returns:
        The flags with a ``next_gw_points`` column for gameweek ``as_of_gw + 1``
        summed across double-gameweek fixtures. A missing player row in a
        completed gameweek counts as zero points. Entirely absent gameweeks
        and recorded results with missing points remain null, not zero.
    """
    next_points = history.group_by("element", "round").agg(
        pl.when(pl.col("total_points").count() == pl.len())
        .then(pl.col("total_points").sum())
        .otherwise(None)
        .alias("next_gw_points"),
        pl.lit(True).alias("_has_outcome"),
    )
    completed_rounds = history["round"].drop_nulls().unique()
    return (
        flags.with_columns((pl.col("as_of_gw") + 1).alias("_next_gw"))
        .join(
            next_points,
            left_on=["element", "_next_gw"],
            right_on=["element", "round"],
            how="left",
        )
        .with_columns(
            pl.when(
                pl.col("_has_outcome").is_null()
                & pl.col("_next_gw").is_in(completed_rounds.implode())
            )
            .then(0)
            .otherwise(pl.col("next_gw_points"))
            .alias("next_gw_points")
        )
        .drop("_next_gw", "_has_outcome")
    )

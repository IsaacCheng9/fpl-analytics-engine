"""Estimate point-in-time DefCon threshold-hit probabilities (empirical Bayes).

Each player's underlying hit rate is modelled as a Beta-Binomial: a Beta prior
centred on the player's position base rate, updated by their eligible
appearances. The posterior mean shrinks small-sample players toward the
position rate and lets established players approach their own rate, which is
more stable than a raw recent hit-rate. Everything is point-in-time - only
games up to and including ``as_of_gw`` inform either the prior or the player.
"""

from typing import cast

import polars as pl

# Pseudo-count strength of the position prior, in units of games. Higher = more
# shrinkage toward the position base rate for players with few appearances.
DEFAULT_PRIOR_STRENGTH = 10.0


def defcon_probabilities(
    history: pl.DataFrame,
    as_of_gw: int,
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
    min_minutes: int = 1,
) -> pl.DataFrame:
    """Estimate each player's probability of hitting the DefCon threshold.

    Args:
        history: Enriched per-gameweek history from
            :func:`fpl_analytics_engine.data.prepare_history`.
        as_of_gw: Gameweek to evaluate as of; later gameweeks are ignored.
        prior_strength: Pseudo-count strength of the position prior.
        min_minutes: Minimum minutes for a game to count as an appearance.

    Returns:
        One row per eligible player with the empirical hit rate, the
        shrinkage-adjusted probability, its posterior standard deviation, and
        the supporting game counts.
    """
    eligible = history.filter(
        (pl.col("round") <= as_of_gw)
        & (pl.col("minutes") >= min_minutes)
        & pl.col("defcon_hit").is_not_null()
    )
    # Point-in-time position base rates feed the prior.
    position_rates = eligible.group_by("position").agg(
        (pl.col("defcon_hit").sum() / pl.len()).alias("position_rate")
    )
    per_player = eligible.group_by("element").agg(
        pl.col("web_name").last(),
        pl.col("position").last(),
        pl.col("team_name").last(),
        pl.col("defcon_hit").sum().alias("hits"),
        pl.len().alias("games"),
    )

    return (
        per_player.join(position_rates, on="position", how="left")
        .with_columns(
            alpha=pl.col("position_rate") * prior_strength + pl.col("hits"),
            beta=(1 - pl.col("position_rate")) * prior_strength
            + (pl.col("games") - pl.col("hits")),
        )
        .with_columns(
            (pl.col("hits") / pl.col("games")).alias("raw_rate"),
            (pl.col("alpha") / (pl.col("alpha") + pl.col("beta"))).alias("prob"),
            (
                (pl.col("alpha") * pl.col("beta"))
                / (
                    (pl.col("alpha") + pl.col("beta")).pow(2)
                    * (pl.col("alpha") + pl.col("beta") + 1)
                )
            )
            .sqrt()
            .alias("prob_std"),
            pl.lit(as_of_gw).alias("as_of_gw"),
        )
        .select(
            "element",
            "web_name",
            "position",
            "team_name",
            "games",
            "hits",
            "raw_rate",
            "prob",
            "prob_std",
            "as_of_gw",
        )
    )


def backtest_defcon_probabilities(
    history: pl.DataFrame,
    gw_range: range | None = None,
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
    min_minutes: int = 1,
) -> pl.DataFrame:
    """Score the model against the following gameweek's actual outcomes.

    For each gameweek it predicts every eligible player point-in-time, then
    attaches whether they hit the threshold in their next appearance. Rows
    where the player did not feature in the next gameweek are dropped, so the
    target is ``P(hit | plays)``.

    Args:
        history: Enriched per-gameweek history.
        gw_range: Gameweeks to evaluate; defaults to GW1 through the
            second-to-last (a following gameweek must exist).
        prior_strength: Forwarded to :func:`defcon_probabilities`.
        min_minutes: Forwarded to :func:`defcon_probabilities`.

    Returns:
        Per-prediction rows with ``prob``, the raw-rate baseline, and the
        realised ``hit`` (0.0 or 1.0).
    """
    max_round = cast(int, history["round"].max())
    if gw_range is None:
        gw_range = range(1, max_round)

    next_hit = (
        history.filter(
            (pl.col("minutes") >= min_minutes) & pl.col("defcon_hit").is_not_null()
        )
        .group_by("element", "round")
        .agg(pl.col("defcon_hit").max().alias("hit"))
    )

    frames = [
        defcon_probabilities(
            history, as_of_gw, prior_strength, min_minutes
        ).with_columns((pl.lit(as_of_gw) + 1).alias("next_round"))
        for as_of_gw in gw_range
    ]
    if not frames:
        return pl.DataFrame()

    return (
        pl.concat(frames, how="vertical")
        .join(
            next_hit,
            left_on=["element", "next_round"],
            right_on=["element", "round"],
            how="left",
        )
        .filter(pl.col("hit").is_not_null())
        .with_columns(pl.col("hit").cast(pl.Float64))
    )


def brier_score(scored: pl.DataFrame, prob_col: str = "prob") -> float:
    """Return the Brier score (mean squared error) of a prediction column.

    Args:
        scored: Output of :func:`backtest_defcon_probabilities`.
        prob_col: Name of the probability column to score.

    Returns:
        The mean squared difference between prediction and realised outcome;
        lower is better.
    """
    return scored.select((pl.col(prob_col) - pl.col("hit")).pow(2).mean()).item()


def calibration_table(
    scored: pl.DataFrame, prob_col: str = "prob", bins: int = 10
) -> pl.DataFrame:
    """Bin predictions and compare mean prediction to observed frequency.

    Args:
        scored: Output of :func:`backtest_defcon_probabilities`.
        prob_col: Name of the probability column to assess.
        bins: Number of equal-width probability bins.

    Returns:
        One row per occupied bin with the count, mean prediction, and observed
        hit rate; a well-calibrated model has the latter two roughly equal.
    """
    return (
        scored.with_columns(
            (pl.col(prob_col) * bins)
            .floor()
            .clip(0, bins - 1)
            .cast(pl.Int64)
            .alias("bin")
        )
        .group_by("bin")
        .agg(
            pl.len().alias("n"),
            pl.col(prob_col).mean().alias("mean_predicted"),
            pl.col("hit").mean().alias("observed_rate"),
        )
        .sort("bin")
    )

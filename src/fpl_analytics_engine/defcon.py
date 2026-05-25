"""Estimate point-in-time DefCon threshold-hit probabilities (empirical Bayes).

Each player's underlying hit rate is modelled as a Beta-Binomial: a Beta prior
per position, updated by their eligible appearances. The posterior mean shrinks
small-sample players toward the position rate and lets established players
approach their own rate, which is more stable than a raw recent hit-rate.

By default the prior's mean and concentration are estimated from the data per
position (empirical Bayes, method of moments) - the concentration follows the
between-player spread in hit rates, so positions where players differ a lot get
weaker shrinkage. A fixed fallback strength is used when the point-in-time
sample is too small to estimate the spread. Everything is point-in-time - only
games up to and including ``as_of_gw`` inform either the prior or the player.
"""

from typing import cast

import polars as pl

# Fallback prior strength (pseudo-count, in games) used when empirical Bayes is
# disabled or the point-in-time sample is too small to estimate the spread. The
# value barely matters on a single season - Brier/ECE are flat across ~4.5-7.
DEFAULT_PRIOR_STRENGTH = 5.0
# Concentration is clamped to this range to avoid degenerate priors.
MIN_CONCENTRATION = 1.0
MAX_CONCENTRATION = 100.0


def _estimate_position_priors(
    per_player: pl.DataFrame,
    min_games_for_prior: int,
    fallback_strength: float,
    empirical_bayes: bool,
) -> pl.DataFrame:
    """Estimate a Beta(alpha, beta) prior per position.

    With empirical Bayes the concentration is derived by moment-matching: the
    observed between-player variance in hit rates, minus the binomial sampling
    component, gives the overdispersion that sets the prior strength.

    Args:
        per_player: One row per player with ``position``, ``hits`` and
            ``games``.
        min_games_for_prior: Minimum games for a player to inform the variance
            estimate.
        fallback_strength: Concentration used when the spread cannot be
            estimated.
        empirical_bayes: Estimate the concentration from the data when True;
            otherwise use ``fallback_strength`` for every position.

    Returns:
        One row per position with ``alpha_prior`` and ``beta_prior``.
    """
    rows: list[dict[str, object]] = []
    for position in per_player["position"].unique().to_list():
        group = per_player.filter(pl.col("position") == position)
        total_games = int(group["games"].sum())
        if total_games == 0:
            continue
        mean = int(group["hits"].sum()) / total_games

        concentration = fallback_strength
        if empirical_bayes and 0.0 < mean < 1.0:
            rated = group.filter(pl.col("games") >= min_games_for_prior)
            if rated.height >= 2:
                rates = rated["hits"] / rated["games"]
                observed_var = rates.var()
                sampling_var = (mean * (1 - mean) / rated["games"]).mean()
                if observed_var is not None and sampling_var is not None:
                    between_var = cast(float, observed_var) - cast(float, sampling_var)
                    if between_var > 0:
                        estimate = mean * (1 - mean) / between_var - 1
                        concentration = min(
                            max(estimate, MIN_CONCENTRATION), MAX_CONCENTRATION
                        )

        rows.append(
            {
                "position": position,
                "alpha_prior": mean * concentration,
                "beta_prior": (1 - mean) * concentration,
            }
        )
    priors = pl.DataFrame(rows)
    if priors.height > 0:
        priors = priors.with_columns(
            pl.col("position").cast(per_player.schema["position"])
        )
    return priors


def defcon_probabilities(
    history: pl.DataFrame,
    as_of_gw: int,
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
    min_minutes: int = 1,
    empirical_bayes: bool = True,
    min_games_for_prior: int = 3,
) -> pl.DataFrame:
    """Estimate each player's probability of hitting the DefCon threshold.

    Args:
        history: Enriched per-gameweek history from
            :func:`fpl_analytics_engine.data.prepare_history`.
        as_of_gw: Gameweek to evaluate as of; later gameweeks are ignored.
        prior_strength: Fallback prior concentration (see module docstring).
        min_minutes: Minimum minutes for a game to count as an appearance.
        empirical_bayes: Estimate the prior concentration per position from the
            data; falls back to ``prior_strength`` for small samples.
        min_games_for_prior: Minimum games for a player to inform the prior.

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
    per_player = eligible.group_by("element").agg(
        pl.col("web_name").last(),
        pl.col("position").last(),
        pl.col("team_name").last(),
        pl.col("defcon_hit").sum().alias("hits"),
        pl.len().alias("games"),
    )
    priors = _estimate_position_priors(
        per_player, min_games_for_prior, prior_strength, empirical_bayes
    )

    return (
        per_player.join(priors, on="position", how="left")
        .with_columns(
            alpha=pl.col("alpha_prior") + pl.col("hits"),
            beta=pl.col("beta_prior") + (pl.col("games") - pl.col("hits")),
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


def flag_defcon_probabilities(
    probabilities: pl.DataFrame,
    min_games: int = 0,
    position: str | None = None,
    top_k: int | None = None,
) -> pl.DataFrame:
    """Filter and rank DefCon probabilities for display.

    Args:
        probabilities: Output of :func:`defcon_probabilities`.
        min_games: Minimum eligible appearances to include.
        position: Optional position filter ('DEF', 'MID', 'FWD').
        top_k: Optional cap on the number of players returned.

    Returns:
        The qualifying players sorted by ``prob`` descending.
    """
    ranked = probabilities.filter(pl.col("games") >= min_games)
    if position is not None:
        ranked = ranked.filter(pl.col("position") == position)
    ranked = ranked.sort("prob", descending=True, nulls_last=True)
    if top_k is not None:
        ranked = ranked.head(top_k)
    return ranked


def backtest_defcon_probabilities(
    history: pl.DataFrame,
    gw_range: range | None = None,
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
    min_minutes: int = 1,
    empirical_bayes: bool = True,
    min_games_for_prior: int = 3,
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
        empirical_bayes: Forwarded to :func:`defcon_probabilities`.
        min_games_for_prior: Forwarded to :func:`defcon_probabilities`.

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
            history,
            as_of_gw,
            prior_strength,
            min_minutes,
            empirical_bayes,
            min_games_for_prior,
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

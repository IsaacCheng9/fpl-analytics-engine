"""Compute point-in-time club form from player and fixture history."""

from typing import cast

import polars as pl

from fpl_analytics_engine import fixtures

DEFAULT_WINDOW = 5
DEFAULT_VALIDATION_MIN_TRAIN_ROWS = 40
RIDGE = 1e-9

VALIDATION_ROW_SCHEMA = {
    "as_of_gw": pl.Int64,
    "team": pl.Int64,
    "team_name": pl.String,
    "avg_fdr": pl.Float64,
    "upcoming_fixtures": pl.UInt32,
    "attack_form": pl.Float64,
    "defence_form": pl.Float64,
    "future_matches": pl.UInt32,
    "future_xg_per_match": pl.Float64,
    "future_xgc_per_match": pl.Float64,
}

VALIDATION_PREDICTION_SCHEMA = {
    "target": pl.String,
    "as_of_gw": pl.Int64,
    "team": pl.Int64,
    "team_name": pl.String,
    "avg_fdr": pl.Float64,
    "form_signal": pl.Float64,
    "actual": pl.Float64,
    "fdr_prediction": pl.Float64,
    "fdr_plus_form_prediction": pl.Float64,
}

VALIDATION_SUMMARY_SCHEMA = {
    "target": pl.String,
    "n_predictions": pl.UInt32,
    "fdr_mae": pl.Float64,
    "fdr_plus_form_mae": pl.Float64,
    "mae_improvement": pl.Float64,
    "mae_improvement_pct": pl.Float64,
    "fdr_rmse": pl.Float64,
    "fdr_plus_form_rmse": pl.Float64,
    "rmse_improvement": pl.Float64,
    "rmse_improvement_pct": pl.Float64,
}


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


def _future_club_outcomes(
    club_fixtures: pl.DataFrame,
    as_of_gw: int,
    horizon: int,
) -> pl.DataFrame:
    """Aggregate future club xG and xGC over the validation horizon.

    Args:
        club_fixtures: One row per club per fixture.
        as_of_gw: Gameweek the prediction is anchored at.
        horizon: Number of future gameweeks to score.

    Returns:
        One row per club with future per-match xG and xGC.
    """
    return (
        club_fixtures.filter(
            pl.col("round") > as_of_gw,
            pl.col("round") <= as_of_gw + horizon,
        )
        .group_by("team")
        .agg(
            pl.len().alias("future_matches"),
            pl.col("xg").sum().alias("future_xg"),
            pl.col("xgc").sum().alias("future_xgc"),
        )
        .with_columns(
            future_xg_per_match=_per_match("future_xg", "future_matches"),
            future_xgc_per_match=_per_match("future_xgc", "future_matches"),
        )
        .select(
            "team",
            "future_matches",
            "future_xg_per_match",
            "future_xgc_per_match",
        )
    )


def club_form_validation_rows(
    history: pl.DataFrame,
    fixtures_data: pl.DataFrame,
    window: int = DEFAULT_WINDOW,
    fdr_horizon: int = fixtures.DEFAULT_HORIZON,
    gw_range: range | None = None,
) -> pl.DataFrame:
    """Build point-in-time rows for validating club form plus FDR.

    Each row is one club at one ``as_of_gw``. Features come only from matches
    up to that gameweek, while the target is the club's realised xG and xGC per
    match over the next ``fdr_horizon`` gameweeks.

    Args:
        history: Enriched current-season per-gameweek player history.
        fixtures_data: Archived FPL fixtures feed.
        window: Number of recent club matches used for form.
        fdr_horizon: Number of future gameweeks used for both FDR and outcomes.
        gw_range: Gameweeks to evaluate; defaults to ``window`` through the
            second-to-last gameweek.

    Returns:
        Validation feature and target rows.
    """
    if fixtures_data.height == 0:
        return pl.DataFrame(schema=VALIDATION_ROW_SCHEMA)

    max_round = latest_gameweek(history)
    if gw_range is None:
        gw_range = range(window, max_round)

    club_fixtures = _compute_club_fixtures(history)
    frames = []
    for as_of_gw in gw_range:
        form_table = compute_club_form_table(history, as_of_gw, window)
        fdr = fixtures.team_fixture_difficulty(
            fixtures_data.to_dicts(), as_of_gw, fdr_horizon
        ).select(
            "team",
            pl.col("n_fixtures").alias("upcoming_fixtures"),
            pl.col("avg_difficulty").alias("avg_fdr"),
        )
        future = _future_club_outcomes(club_fixtures, as_of_gw, fdr_horizon)
        frame = (
            form_table.select("team", "team_name", "attack_form", "defence_form")
            .join(fdr, on="team", how="inner")
            .join(future, on="team", how="inner")
            .filter(
                pl.col("avg_fdr").is_not_null(),
                pl.col("future_xg_per_match").is_not_null(),
                pl.col("future_xgc_per_match").is_not_null(),
            )
            .with_columns(pl.lit(as_of_gw).alias("as_of_gw"))
            .select(list(VALIDATION_ROW_SCHEMA))
        )
        if frame.height > 0:
            frames.append(frame)

    return (
        pl.concat(frames, how="vertical_relaxed")
        if frames
        else pl.DataFrame(schema=VALIDATION_ROW_SCHEMA)
    )


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    """Solve a small dense linear system with Gaussian elimination.

    Args:
        matrix: Square coefficient matrix.
        vector: Right-hand-side vector.

    Returns:
        Solution vector.
    """
    size = len(vector)
    augmented = [row.copy() + [vector[i]] for i, row in enumerate(matrix)]
    for pivot_col in range(size):
        pivot_row = max(
            range(pivot_col, size), key=lambda row: abs(augmented[row][pivot_col])
        )
        augmented[pivot_col], augmented[pivot_row] = (
            augmented[pivot_row],
            augmented[pivot_col],
        )
        pivot = augmented[pivot_col][pivot_col]
        if abs(pivot) < RIDGE:
            pivot = RIDGE
            augmented[pivot_col][pivot_col] = pivot
        for col in range(pivot_col, size + 1):
            augmented[pivot_col][col] /= pivot
        for row in range(size):
            if row == pivot_col:
                continue
            factor = augmented[row][pivot_col]
            for col in range(pivot_col, size + 1):
                augmented[row][col] -= factor * augmented[pivot_col][col]
    return [augmented[row][size] for row in range(size)]


def _as_float(value: object) -> float | None:
    """Cast a nullable numeric value to float.

    Args:
        value: Raw value from a Polars row dictionary.

    Returns:
        Float value, or null when the source value is null.
    """
    if value is None:
        return None
    return float(cast(float, value))


def _fit_linear_model(
    rows: list[dict[str, object]],
    target: str,
    features: list[str],
) -> list[float]:
    """Fit a tiny ridge-stabilised linear model.

    Args:
        rows: Training rows.
        target: Target column name.
        features: Feature column names.

    Returns:
        Coefficients, with the intercept first.
    """
    width = len(features) + 1
    matrix = [[0.0 for _ in range(width)] for _ in range(width)]
    vector = [0.0 for _ in range(width)]
    for row in rows:
        y = _as_float(row[target])
        if y is None:
            continue
        x_values = [1.0]
        for feature in features:
            value = _as_float(row[feature])
            if value is None:
                break
            x_values.append(value)
        if len(x_values) != width:
            continue
        for i, x_i in enumerate(x_values):
            vector[i] += x_i * y
            for j, x_j in enumerate(x_values):
                matrix[i][j] += x_i * x_j

    for i in range(1, width):
        matrix[i][i] += RIDGE
    return _solve_linear_system(matrix, vector)


def _predict_linear(
    coefficients: list[float],
    row: dict[str, object],
    features: list[str],
) -> float | None:
    """Predict a row with fitted linear coefficients.

    Args:
        coefficients: Model coefficients, with the intercept first.
        row: Prediction row.
        features: Feature column names.

    Returns:
        Predicted value, or null when a feature is missing.
    """
    prediction = coefficients[0]
    for coefficient, feature in zip(coefficients[1:], features, strict=True):
        value = _as_float(row[feature])
        if value is None:
            return None
        prediction += coefficient * value
    return prediction


def _expanding_predictions(
    rows: pl.DataFrame,
    target: str,
    form_feature: str,
    min_train_rows: int,
) -> list[dict[str, object]]:
    """Fit FDR-only and FDR-plus-form models on prior rows only.

    Args:
        rows: Validation feature and target rows.
        target: Target column to predict.
        form_feature: Club-form signal paired with FDR.
        min_train_rows: Minimum historical rows before a gameweek is scored.

    Returns:
        Per-club prediction rows.
    """
    predictions = []
    for as_of_gw in sorted(rows["as_of_gw"].unique().to_list()):
        train = rows.filter(pl.col("as_of_gw") < as_of_gw).drop_nulls(
            ["avg_fdr", form_feature, target]
        )
        test = rows.filter(pl.col("as_of_gw") == as_of_gw).drop_nulls(
            ["avg_fdr", form_feature, target]
        )
        if train.height < min_train_rows or test.height == 0:
            continue

        train_rows = train.to_dicts()
        fdr_coefficients = _fit_linear_model(train_rows, target, ["avg_fdr"])
        combined_coefficients = _fit_linear_model(
            train_rows, target, ["avg_fdr", form_feature]
        )
        for row in test.to_dicts():
            fdr_prediction = _predict_linear(fdr_coefficients, row, ["avg_fdr"])
            combined_prediction = _predict_linear(
                combined_coefficients, row, ["avg_fdr", form_feature]
            )
            if fdr_prediction is None or combined_prediction is None:
                continue
            predictions.append(
                {
                    "target": target,
                    "as_of_gw": row["as_of_gw"],
                    "team": row["team"],
                    "team_name": row["team_name"],
                    "avg_fdr": row["avg_fdr"],
                    "form_signal": row[form_feature],
                    "actual": row[target],
                    "fdr_prediction": fdr_prediction,
                    "fdr_plus_form_prediction": combined_prediction,
                }
            )
    return predictions


def backtest_club_form_signals(
    history: pl.DataFrame,
    fixtures_data: pl.DataFrame,
    window: int = DEFAULT_WINDOW,
    fdr_horizon: int = fixtures.DEFAULT_HORIZON,
    min_train_rows: int = DEFAULT_VALIDATION_MIN_TRAIN_ROWS,
    gw_range: range | None = None,
) -> pl.DataFrame:
    """Backtest whether club form improves an FDR-only baseline.

    For each gameweek, the FDR-only model and FDR-plus-form model are trained
    only on earlier validation rows, then scored against the next horizon's
    realised xG and xGC per match. This checks whether the club-form signal adds
    information beyond raw FDR without leaking future outcomes.

    Args:
        history: Enriched current-season per-gameweek player history.
        fixtures_data: Archived FPL fixtures feed.
        window: Number of recent club matches used for form.
        fdr_horizon: Number of future gameweeks used for FDR and outcomes.
        min_train_rows: Minimum historical rows needed before scoring a
            gameweek.
        gw_range: Gameweeks to evaluate.

    Returns:
        One row per scored club/gameweek/target with both predictions and the
        realised target.
    """
    rows = club_form_validation_rows(
        history, fixtures_data, window, fdr_horizon, gw_range
    )
    if rows.height == 0:
        return pl.DataFrame(schema=VALIDATION_PREDICTION_SCHEMA)

    predictions = [
        *_expanding_predictions(
            rows,
            "future_xg_per_match",
            "attack_form",
            min_train_rows,
        ),
        *_expanding_predictions(
            rows,
            "future_xgc_per_match",
            "defence_form",
            min_train_rows,
        ),
    ]
    return (
        pl.DataFrame(predictions, schema=VALIDATION_PREDICTION_SCHEMA)
        if predictions
        else pl.DataFrame(schema=VALIDATION_PREDICTION_SCHEMA)
    )


def summarise_club_form_validation(scored: pl.DataFrame) -> pl.DataFrame:
    """Summarise FDR-only versus FDR-plus-club-form validation errors.

    Args:
        scored: Output of :func:`backtest_club_form_signals`.

    Returns:
        One row per target with MAE/RMSE for each model and the improvement of
        the FDR-plus-form model over the FDR-only baseline. Positive improvement
        means club form helped.
    """
    if scored.height == 0:
        return pl.DataFrame(schema=VALIDATION_SUMMARY_SCHEMA)

    return (
        scored.group_by("target")
        .agg(
            pl.len().alias("n_predictions"),
            (pl.col("fdr_prediction") - pl.col("actual")).abs().mean().alias("fdr_mae"),
            (pl.col("fdr_plus_form_prediction") - pl.col("actual"))
            .abs()
            .mean()
            .alias("fdr_plus_form_mae"),
            (pl.col("fdr_prediction") - pl.col("actual"))
            .pow(2)
            .mean()
            .sqrt()
            .alias("fdr_rmse"),
            (pl.col("fdr_plus_form_prediction") - pl.col("actual"))
            .pow(2)
            .mean()
            .sqrt()
            .alias("fdr_plus_form_rmse"),
        )
        .with_columns(
            (pl.col("fdr_mae") - pl.col("fdr_plus_form_mae")).alias("mae_improvement"),
            (pl.col("fdr_rmse") - pl.col("fdr_plus_form_rmse")).alias(
                "rmse_improvement"
            ),
        )
        .with_columns(
            pl.when(pl.col("fdr_mae") > 0)
            .then(pl.col("mae_improvement") / pl.col("fdr_mae"))
            .otherwise(None)
            .alias("mae_improvement_pct"),
            pl.when(pl.col("fdr_rmse") > 0)
            .then(pl.col("rmse_improvement") / pl.col("fdr_rmse"))
            .otherwise(None)
            .alias("rmse_improvement_pct"),
        )
        .select(list(VALIDATION_SUMMARY_SCHEMA))
        .sort("target")
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

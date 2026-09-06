"""FastAPI gateway exposing point-in-time form and DefCon player views."""

from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Annotated, cast

import polars as pl
import requests
from fastapi import Depends, FastAPI, HTTPException, Query

from fpl_analytics_engine import app as fpl_client
from fpl_analytics_engine import club, data, defcon, fixtures, form, player
from fpl_analytics_engine.domain import ELEMENT_TYPE_TO_POSITION, Position
from fpl_analytics_engine.schemas import (
    ApiMeta,
    ClubForm,
    ClubFormValidation,
    DefconCalibrationBin,
    DefconPlayer,
    DefconProbabilityPlayer,
    DefconProbabilityValidation,
    FormPlayer,
    FplTeam,
    FplTeamPick,
    PlayerDetail,
    PlayerGameweek,
    PlayerSeasonSummary,
)

DATA_ROOT = Path("data")
DEFAULT_FDR_HORIZON = 5
AS_OF_GW_DESCRIPTION = (
    "Evaluate the point-in-time view as of this gameweek (defaults to the "
    "latest). Current ownership is excluded from this - it is always the "
    "present-day snapshot and does not change with as_of_gw."
)

# Fixture difficulty and live-snapshot overlay, attached to every player view.
FIXTURE_CONTEXT_COLUMNS = [
    "upcoming_fixtures",
    "avg_fdr",
    "next_fixture_gw",
    "next_opponent_name",
    "next_was_home",
    "next_fdr",
    "current_ownership",
]
# Adds point-in-time value efficiency and playing time, for the form-derived
# tables.
CONTEXT_COLUMNS = [
    "window_xgi90_per_million",
    "season_points_per_million",
    "window_start_rate",
    "window_mins_per_appearance",
    *FIXTURE_CONTEXT_COLUMNS,
]
# Columns returned by each endpoint, matching the response models in schemas.
FORM_COLUMNS = [
    "element",
    "web_name",
    "position",
    "team_name",
    "price",
    "window_games",
    "window_minutes",
    "window_xg90",
    "window_xa90",
    "window_xgi90",
    "season_xg90",
    "season_xa90",
    "season_xgi90",
    "delta_xg90",
    "delta_xa90",
    "delta_xgi90",
    "window_xg90_per_million",
    "window_xa90_per_million",
    *CONTEXT_COLUMNS,
    "as_of_gw",
]
DEFCON_COLUMNS = [
    "element",
    "web_name",
    "position",
    "team_name",
    "price",
    "window_games",
    "window_minutes",
    "window_defcon_hits",
    "window_defcon_games",
    "window_defcon_hit_rate",
    "window_defcon",
    *CONTEXT_COLUMNS,
    "as_of_gw",
]
DEFCON_PROBABILITY_COLUMNS = [
    "element",
    "web_name",
    "position",
    "team_name",
    "price",
    "window_minutes",
    "window_defcon",
    "games",
    "hits",
    "raw_rate",
    "prob",
    "prob_std",
    *CONTEXT_COLUMNS,
    "as_of_gw",
]
CLUB_FORM_COLUMNS = [
    "team",
    "team_name",
    "window_matches",
    "season_matches",
    "window_xg_per_match",
    "season_xg_per_match",
    "delta_xg_per_match",
    "window_goals_for_per_match",
    "season_goals_for_per_match",
    "delta_goals_for_per_match",
    "window_xgc_per_match",
    "season_xgc_per_match",
    "delta_xgc_per_match",
    "window_goals_against_per_match",
    "season_goals_against_per_match",
    "delta_goals_against_per_match",
    "window_finishing_delta",
    "window_concession_delta",
    "attack_form",
    "defence_form",
    "upcoming_fixtures",
    "avg_fdr",
    "as_of_gw",
]
CLUB_FORM_VALIDATION_COLUMNS = [
    "target",
    "n_predictions",
    "baseline_mae",
    "baseline_plus_form_mae",
    "mae_improvement",
    "mae_improvement_pct",
    "baseline_rmse",
    "baseline_plus_form_rmse",
    "rmse_improvement",
    "rmse_improvement_pct",
]
# Price and playing-time / value context joined onto the probability table by
# element, so it matches the DefCon form view.
PROBABILITY_CONTEXT_COLUMNS = [
    "element",
    "price",
    "window_minutes",
    "window_defcon",
    "window_xgi90_per_million",
    "season_points_per_million",
    "window_start_rate",
    "window_mins_per_appearance",
]
DEFAULT_CALIBRATION_BINS = 10
DEFAULT_DEFCON_PROBABILITY_MIN_MINUTES = 60
EntryPicksFetcher = Callable[[int, int], dict]


@lru_cache
def _current_season() -> str:
    """Return the latest live-archived season available to serve."""
    return data.latest_archived_season(DATA_ROOT)


def _current_data_dir() -> Path:
    """Return the data directory for the latest live-archived season."""
    return DATA_ROOT / _current_season()


@lru_cache
def _load_history() -> pl.DataFrame:
    """Load and cache current-season history when analytics are available."""
    path = _current_data_dir() / "enriched.parquet"
    if not path.exists():
        return pl.DataFrame()
    return pl.read_parquet(path)


@lru_cache
def _load_fixtures() -> pl.DataFrame:
    """Load and cache the archived fixtures (empty if not yet captured)."""
    return data.load_fixtures(_current_data_dir())


@lru_cache
def _load_teams() -> pl.DataFrame:
    """Load and cache the team metadata for the fixture-id-to-name bridge."""
    return data.load_teams(_current_data_dir())


@lru_cache
def _load_events() -> pl.DataFrame:
    """Load and cache the current gameweek metadata."""
    return data.load_events(_current_data_dir())


@lru_cache
def _load_players_snapshot() -> pl.DataFrame:
    """Load and cache the current player metadata for the live overlay."""
    return data.load_players(_current_data_dir())


@lru_cache
def _load_all_seasons() -> pl.DataFrame:
    """Load and cache every archived season's enriched snapshot."""
    return data.load_all_seasons(DATA_ROOT)


def get_history() -> pl.DataFrame:
    """Return the enriched history (dependency; overridden in tests)."""
    return _load_history()


def get_current_season() -> str:
    """Return the live archived season (dependency; overridden in tests)."""
    return _current_season()


def get_fixtures_data() -> pl.DataFrame:
    """Return the archived fixtures (dependency; overridden in tests)."""
    return _load_fixtures()


def get_teams() -> pl.DataFrame:
    """Return the team metadata (dependency; overridden in tests)."""
    return _load_teams()


def get_events() -> pl.DataFrame:
    """Return the gameweek metadata (dependency; overridden in tests)."""
    return _load_events()


def get_players_snapshot() -> pl.DataFrame:
    """Return the current player metadata (dependency; overridden in tests)."""
    return _load_players_snapshot()


def get_all_seasons() -> pl.DataFrame:
    """Return the cross-season enriched history (dependency; overridden in tests)."""
    return _load_all_seasons()


def get_entry_picks_fetcher() -> EntryPicksFetcher:
    """Return the FPL entry-picks fetcher (dependency; overridden in tests)."""
    return fpl_client.get_entry_event_picks


def _latest_gw(history: pl.DataFrame) -> int:
    """Return the most recent gameweek present in the data."""
    if history.is_empty() or "round" not in history.columns:
        return 0
    return cast(int, history["round"].max())


def _next_deadline(events: pl.DataFrame) -> str | None:
    """Return the next gameweek deadline from the current event snapshot."""
    required = {"deadline_time", "is_next"}
    if events.is_empty() or not required.issubset(events.columns):
        return None
    upcoming = events.filter(pl.col("is_next"))
    if upcoming.is_empty():
        return None
    return cast(str, upcoming["deadline_time"][0])


def _require_current_history(history: pl.DataFrame) -> None:
    """Reject analytical requests until current-season gameweek data exists."""
    if history.is_empty():
        raise HTTPException(
            status_code=409,
            detail="Current-season analytics are unavailable until GW1 completes.",
        )


def _resolve_as_of_gw(history: pl.DataFrame, as_of_gw: int | None) -> int:
    """Resolve and validate a point-in-time gameweek."""
    latest = _latest_gw(history)
    if as_of_gw is not None and as_of_gw > latest:
        raise HTTPException(
            status_code=422,
            detail=(
                f"as_of_gw {as_of_gw} is beyond the latest available "
                f"gameweek ({latest})."
            ),
        )
    return as_of_gw if as_of_gw is not None else latest


def _attach_overlay(table: pl.DataFrame, players: pl.DataFrame) -> pl.DataFrame:
    """Attach current ownership, always the present-day snapshot.

    Ownership has no per-gameweek history, so it is deliberately not made
    point-in-time: the same current value is attached regardless of ``as_of_gw``.
    """
    if players.height == 0:
        return table.with_columns(
            pl.lit(None, dtype=pl.Float64).alias("current_ownership"),
        )
    overlay = players.select(
        pl.col("id").alias("element"),
        pl.col("selected_by_percent").cast(pl.Float64).alias("current_ownership"),
    )
    return table.join(overlay, on="element", how="left")


def _attach_context(
    table: pl.DataFrame,
    fixtures_data: pl.DataFrame,
    teams: pl.DataFrame,
    players: pl.DataFrame,
    gw: int,
    horizon: int,
) -> pl.DataFrame:
    """Attach fixture difficulty and the current-ownership overlay to a table."""
    with_fdr = fixtures.attach_team_fdr(table, fixtures_data, teams, gw, horizon)
    return _attach_overlay(with_fdr, players)


def _attach_club_fdr(
    table: pl.DataFrame,
    fixtures_data: pl.DataFrame,
    gw: int,
    horizon: int,
) -> pl.DataFrame:
    """Attach upcoming fixture difficulty to a club table."""
    fdr = fixtures.team_fixture_difficulty(fixtures_data.to_dicts(), gw, horizon)
    context = fdr.select(
        "team",
        pl.col("n_fixtures").alias("upcoming_fixtures"),
        pl.col("avg_difficulty").alias("avg_fdr"),
    )
    return table.join(context, on="team", how="left")


def _brier_or_none(scored: pl.DataFrame, prob_col: str) -> float | None:
    """Return a Brier score when there are predictions to score."""
    if scored.is_empty():
        return None
    return defcon.brier_score(scored, prob_col)


def _relative_improvement(
    model_score: float | None, baseline_score: float | None
) -> float | None:
    """Return the relative error reduction of a model versus a baseline."""
    if model_score is None or baseline_score is None or baseline_score == 0:
        return None
    return (baseline_score - model_score) / baseline_score


def _calibration_bins(
    scored: pl.DataFrame, prob_col: str, bins: int
) -> tuple[list[DefconCalibrationBin], float | None]:
    """Build calibration buckets and their weighted absolute error."""
    if scored.is_empty():
        return [], None
    table = defcon.calibration_table(scored, prob_col=prob_col, bins=bins)
    ece = defcon.expected_calibration_error(table)
    table = table.with_columns(
        (pl.col("mean_predicted") - pl.col("observed_rate")).abs().alias("abs_error")
    )
    return [DefconCalibrationBin(**row) for row in table.to_dicts()], ece


def _player_snapshot_metadata(
    players: pl.DataFrame, teams: pl.DataFrame
) -> pl.DataFrame:
    """Return player labels from the current bootstrap snapshot."""
    schema = {
        "element": pl.Int64,
        "web_name": pl.String,
        "position": pl.String,
        "team_name": pl.String,
    }
    required_player_cols = {"id", "web_name", "element_type", "team"}
    required_team_cols = {"id", "name"}
    if (
        players.is_empty()
        or not required_player_cols <= set(players.columns)
        or not required_team_cols <= set(teams.columns)
    ):
        return pl.DataFrame(schema=schema)

    team_meta = teams.select(
        pl.col("id").alias("team"), pl.col("name").alias("team_name")
    )
    return (
        players.select("id", "web_name", "element_type", "team")
        .rename({"id": "element"})
        .join(team_meta, on="team", how="left")
        .with_columns(
            pl.col("element_type")
            .replace_strict(ELEMENT_TYPE_TO_POSITION, default=None)
            .cast(pl.String)
            .alias("position")
        )
        .select("element", "web_name", "position", "team_name")
    )


def _team_pick_frame(payload: dict) -> pl.DataFrame:
    """Normalise an FPL entry-picks payload into owned player rows."""
    picks = payload.get("picks")
    if not isinstance(picks, list):
        raise HTTPException(status_code=502, detail="FPL picks payload is invalid")

    records = []
    for pick in picks:
        if not isinstance(pick, dict) or "element" not in pick:
            continue
        squad_position = int(pick.get("position") or 0)
        records.append(
            {
                "element": int(pick["element"]),
                "squad_position": squad_position,
                "multiplier": int(pick.get("multiplier") or 0),
                "is_captain": bool(pick.get("is_captain", False)),
                "is_vice_captain": bool(pick.get("is_vice_captain", False)),
                "is_starting": 1 <= squad_position <= 11,
            }
        )
    return pl.DataFrame(
        records,
        schema={
            "element": pl.Int64,
            "squad_position": pl.Int64,
            "multiplier": pl.Int64,
            "is_captain": pl.Boolean,
            "is_vice_captain": pl.Boolean,
            "is_starting": pl.Boolean,
        },
    )


app = FastAPI(title="FPL Analytics Engine")


@app.get("/")
def root(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    events: Annotated[pl.DataFrame, Depends(get_events)],
    season: Annotated[str, Depends(get_current_season)],
) -> ApiMeta:
    """Report basic service metadata."""
    latest_gw = _latest_gw(history)
    return ApiMeta(
        name="fpl-analytics-engine",
        season=season,
        latest_gw=latest_gw,
        data_status="ready" if latest_gw else "preseason",
        next_deadline=_next_deadline(events),
    )


@app.get("/fpl-team/{entry_id}")
def fpl_team(
    entry_id: int,
    history: Annotated[pl.DataFrame, Depends(get_history)],
    players: Annotated[pl.DataFrame, Depends(get_players_snapshot)],
    teams: Annotated[pl.DataFrame, Depends(get_teams)],
    fetch_entry_picks: Annotated[EntryPicksFetcher, Depends(get_entry_picks_fetcher)],
    event: int | None = Query(None, ge=1),
) -> FplTeam:
    """Import the public picks for an FPL entry and visible gameweek."""
    _require_current_history(history)
    latest = _latest_gw(history)
    gw = event if event is not None else latest
    try:
        payload = fetch_entry_picks(entry_id, gw)
    except requests.HTTPError as exc:
        response = exc.response
        status_code = response.status_code if response is not None else None
        if status_code == 404:
            raise HTTPException(status_code=404, detail="FPL team not found") from exc
        raise HTTPException(status_code=502, detail="FPL API request failed") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="FPL API request failed") from exc

    picks = _team_pick_frame(payload)
    metadata = _player_snapshot_metadata(players, teams)
    picks = picks.join(metadata, on="element", how="left").sort("squad_position")
    pick_cols = list(FplTeamPick.model_fields)
    return FplTeam(
        entry_id=entry_id,
        as_of_gw=gw,
        owned_elements=picks["element"].to_list(),
        picks=[FplTeamPick(**row) for row in picks.select(pick_cols).to_dicts()],
    )


@app.get("/players/form")
def players_form(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    fixtures_data: Annotated[pl.DataFrame, Depends(get_fixtures_data)],
    teams: Annotated[pl.DataFrame, Depends(get_teams)],
    players: Annotated[pl.DataFrame, Depends(get_players_snapshot)],
    window: int = Query(form.DEFAULT_WINDOW, ge=1, le=20),
    position: Position | None = None,
    min_minutes: int = Query(0, ge=0),
    min_delta: float = 0.0,
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
) -> list[FormPlayer]:
    """Rank players by their recent-versus-season xGI90 form swing.

    Defaults to the latest gameweek in the data; pass ``as_of_gw`` to evaluate
    the point-in-time view as it would have looked after an earlier gameweek.
    """
    _require_current_history(history)
    gw = _resolve_as_of_gw(history, as_of_gw)
    table = form.compute_form_table(history, gw, window)
    flagged = form.flag_players(
        table,
        min_window_minutes=min_minutes,
        min_delta_xgi90=min_delta,
        position=position.value if position is not None else None,
        top_k=top_k,
    )
    flagged = _attach_context(flagged, fixtures_data, teams, players, gw, fdr_horizon)
    return [FormPlayer(**row) for row in flagged.select(FORM_COLUMNS).to_dicts()]


@app.get("/players/defcon")
def players_defcon(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    fixtures_data: Annotated[pl.DataFrame, Depends(get_fixtures_data)],
    teams: Annotated[pl.DataFrame, Depends(get_teams)],
    players: Annotated[pl.DataFrame, Depends(get_players_snapshot)],
    window: int = Query(form.DEFAULT_WINDOW, ge=1, le=20),
    position: Position | None = None,
    min_minutes: int = Query(0, ge=0),
    min_hit_rate: float = Query(0.0, ge=0.0, le=1.0),
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
) -> list[DefconPlayer]:
    """Rank players by their recent DefCon threshold hit-rate.

    Defaults to the latest gameweek in the data; pass ``as_of_gw`` to evaluate
    the point-in-time view as it would have looked after an earlier gameweek.
    """
    _require_current_history(history)
    gw = _resolve_as_of_gw(history, as_of_gw)
    table = form.compute_form_table(history, gw, window)
    flagged = form.flag_defcon(
        table,
        min_window_minutes=min_minutes,
        min_hit_rate=min_hit_rate,
        position=position.value if position is not None else None,
        top_k=top_k,
    )
    flagged = _attach_context(flagged, fixtures_data, teams, players, gw, fdr_horizon)
    return [DefconPlayer(**row) for row in flagged.select(DEFCON_COLUMNS).to_dicts()]


@app.get("/players/defcon-probability")
def players_defcon_probability(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    fixtures_data: Annotated[pl.DataFrame, Depends(get_fixtures_data)],
    teams: Annotated[pl.DataFrame, Depends(get_teams)],
    players: Annotated[pl.DataFrame, Depends(get_players_snapshot)],
    position: Position | None = None,
    min_games: int = Query(0, ge=0),
    min_minutes: int = Query(
        DEFAULT_DEFCON_PROBABILITY_MIN_MINUTES,
        ge=0,
        description=(
            "Minimum minutes for eligible appearances; probabilities are "
            "conditional on meeting this threshold."
        ),
    ),
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
) -> list[DefconProbabilityPlayer]:
    """Rank players by their calibrated DefCon probability given 60+ minutes.

    Uses a recalibrated contribution-count model over all eligible appearances
    up to ``as_of_gw`` (defaults to the latest gameweek). The probability is
    conditional on playing at least ``min_minutes`` (60 by default).
    """
    _require_current_history(history)
    gw = _resolve_as_of_gw(history, as_of_gw)
    probabilities = defcon.calibrated_defcon_count_probabilities(
        history, gw, min_minutes=min_minutes
    )
    ranked = defcon.flag_defcon_probabilities(
        probabilities,
        min_games=min_games,
        position=position.value if position is not None else None,
        top_k=top_k,
    )
    # Join the price and value/playing-time context (over the default window) so
    # the probability table matches the DefCon form columns.
    context = form.compute_form_table(history, gw, form.DEFAULT_WINDOW).select(
        PROBABILITY_CONTEXT_COLUMNS
    )
    ranked = ranked.join(context, on="element", how="left")
    ranked = _attach_context(ranked, fixtures_data, teams, players, gw, fdr_horizon)
    return [
        DefconProbabilityPlayer(**row)
        for row in ranked.select(DEFCON_PROBABILITY_COLUMNS).to_dicts()
    ]


@app.get("/players/defcon-probability-validation")
def players_defcon_probability_validation(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    bins: int = Query(DEFAULT_CALIBRATION_BINS, ge=2, le=20),
    min_minutes: int = Query(DEFAULT_DEFCON_PROBABILITY_MIN_MINUTES, ge=0),
) -> DefconProbabilityValidation:
    """Backtest the DefCon probability models against next-GW outcomes.

    The replay is point-in-time: each as-of gameweek predicts the following
    gameweek, then Brier score and calibration are computed from the realised
    DefCon threshold hit.
    """
    _require_current_history(history)
    scored = defcon.backtest_defcon_count_probabilities(
        history,
        min_minutes=min_minutes,
        calibration_bins=bins,
    )
    if scored.is_empty():
        return DefconProbabilityValidation(
            n_predictions=0,
            model_brier=None,
            binary_model_brier=None,
            count_model_brier=None,
            raw_rate_brier=None,
            constant_brier=None,
            model_ece=None,
            binary_model_ece=None,
            count_model_ece=None,
            raw_rate_ece=None,
            model_improvement_vs_raw=None,
            model_improvement_vs_binary=None,
            model_improvement_vs_count=None,
            model_improvement_vs_constant=None,
            calibration=[],
        )

    constant_rate = cast(float, scored["hit"].mean())
    scored = scored.with_columns(pl.lit(constant_rate).alias("constant_prob"))
    model_brier = _brier_or_none(scored, "prob")
    binary_model_brier = _brier_or_none(scored, "binary_prob")
    count_model_brier = _brier_or_none(scored, "count_prob")
    raw_rate_brier = _brier_or_none(scored, "raw_rate")
    constant_brier = _brier_or_none(scored, "constant_prob")
    calibration, model_ece = _calibration_bins(scored, "prob", bins)
    _, binary_model_ece = _calibration_bins(scored, "binary_prob", bins)
    _, count_model_ece = _calibration_bins(scored, "count_prob", bins)
    _, raw_rate_ece = _calibration_bins(scored, "raw_rate", bins)

    return DefconProbabilityValidation(
        n_predictions=scored.height,
        model_brier=model_brier,
        binary_model_brier=binary_model_brier,
        count_model_brier=count_model_brier,
        raw_rate_brier=raw_rate_brier,
        constant_brier=constant_brier,
        model_ece=model_ece,
        binary_model_ece=binary_model_ece,
        count_model_ece=count_model_ece,
        raw_rate_ece=raw_rate_ece,
        model_improvement_vs_raw=_relative_improvement(model_brier, raw_rate_brier),
        model_improvement_vs_binary=_relative_improvement(
            model_brier, binary_model_brier
        ),
        model_improvement_vs_count=_relative_improvement(
            model_brier, count_model_brier
        ),
        model_improvement_vs_constant=_relative_improvement(
            model_brier, constant_brier
        ),
        calibration=calibration,
    )


@app.get("/clubs/form")
def clubs_form(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    fixtures_data: Annotated[pl.DataFrame, Depends(get_fixtures_data)],
    window: int = Query(club.DEFAULT_WINDOW, ge=1, le=20),
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
) -> list[ClubForm]:
    """Rank clubs by recent attacking and defensive form.

    The table compares each club's recent per-match xG and xGC against its
    season-to-date baseline, then attaches upcoming fixture difficulty.
    """
    _require_current_history(history)
    gw = _resolve_as_of_gw(history, as_of_gw)
    table = club.compute_club_form_table(history, gw, window)
    if top_k is not None:
        table = table.head(top_k)
    table = _attach_club_fdr(table, fixtures_data, gw, fdr_horizon)
    return [ClubForm(**row) for row in table.select(CLUB_FORM_COLUMNS).to_dicts()]


@app.get("/clubs/form-validation")
def clubs_form_validation(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    window: int = Query(club.DEFAULT_WINDOW, ge=1, le=20),
    horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
    min_train_rows: int = Query(
        club.DEFAULT_VALIDATION_MIN_TRAIN_ROWS,
        ge=1,
        description="Minimum prior club/GW rows before an as-of GW is scored.",
    ),
) -> list[ClubFormValidation]:
    """Validate whether club form improves a season-to-date baseline.

    The backtest compares season-baseline and baseline-plus-form linear models.
    Training includes only rows whose complete future target horizon was known
    by the scored as-of gameweek. Historical FDR is excluded because the
    archive does not contain point-in-time FDR revisions.
    """
    _require_current_history(history)
    scored = club.backtest_club_form_signals(
        history,
        window=window,
        horizon=horizon,
        min_train_rows=min_train_rows,
    )
    summary = club.summarise_club_form_validation(scored)
    return [
        ClubFormValidation(**row)
        for row in summary.select(CLUB_FORM_VALIDATION_COLUMNS).to_dicts()
    ]


@app.get("/players/{element}")
def player_detail(
    element: int,
    all_seasons: Annotated[pl.DataFrame, Depends(get_all_seasons)],
    history: Annotated[pl.DataFrame, Depends(get_history)],
    current_season: Annotated[str, Depends(get_current_season)],
    players: Annotated[pl.DataFrame, Depends(get_players_snapshot)],
    window: int = Query(player.DEFAULT_ROLLING_WINDOW, ge=1, le=20),
    season: str | None = None,
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
) -> PlayerDetail:
    """Return a player's selected-season per-gameweek form and season history.

    ``element`` is the current-season FPL id; the player is tracked across
    seasons by their stable ``code``. Rolling figures use a trailing ``window``.
    Resolve the cutoff within the selected season, keeping the live-history
    limit for current-season requests.
    """
    selected_season = season or current_season
    if selected_season == current_season:
        _require_current_history(history)
    if all_seasons.is_empty():
        raise HTTPException(status_code=404, detail="Season not found for player")

    current_identity = (pl.col("season") == current_season) & (
        pl.col("element") == element
    )
    current = all_seasons.filter(current_identity)
    code = current.sort("round")["code"][-1] if not current.is_empty() else None
    if code is None:
        # Recover missing history identity from the live player snapshot.
        identity = (
            players.filter(pl.col("id") == element)
            if {"id", "code"}.issubset(players.columns)
            else pl.DataFrame()
        )
        if current.is_empty() and identity.is_empty():
            raise HTTPException(status_code=404, detail="Player not found")
        if not identity.is_empty():
            code = identity["code"][0]

    # Keep current rows by element even when their stable code is missing.
    player_history = (
        all_seasons.filter(
            ((pl.col("season") != current_season) & (pl.col("code") == code))
            | current_identity
        )
        if code is not None
        else current
    )
    available_seasons = sorted(
        (str(value) for value in player_history["season"].drop_nulls().unique()),
        key=data.season_sort_key,
    )
    selected_history = player_history.filter(pl.col("season") == selected_season)
    if selected_history.is_empty():
        raise HTTPException(status_code=404, detail="Season not found for player")
    cutoff_history = (
        history
        if selected_season == current_season
        else all_seasons.filter(pl.col("season") == selected_season)
    )
    gw = _resolve_as_of_gw(cutoff_history, as_of_gw)
    season_history = selected_history.filter(pl.col("round") <= gw)
    if season_history.is_empty():
        raise HTTPException(status_code=404, detail="Season not found for player")

    summary_history = player_history.filter(
        (pl.col("season") < selected_season)
        | ((pl.col("season") == selected_season) & (pl.col("round") <= gw))
    )
    seasons = player.season_summaries(summary_history)
    latest = season_history.sort("round", "kickoff_time").row(-1, named=True)
    gameweeks = player.player_gameweeks(season_history, window)
    gw_cols = list(PlayerGameweek.model_fields)
    season_cols = list(PlayerSeasonSummary.model_fields)
    return PlayerDetail(
        element=element,
        code=code,
        as_of_gw=gw,
        web_name=latest["web_name"],
        position=latest["position"],
        team_name=latest["team_name"],
        rolling_window=window,
        selected_season=selected_season,
        available_seasons=available_seasons,
        gameweeks=[
            PlayerGameweek(**row) for row in gameweeks.select(gw_cols).to_dicts()
        ],
        seasons=[
            PlayerSeasonSummary(**row) for row in seasons.select(season_cols).to_dicts()
        ],
    )

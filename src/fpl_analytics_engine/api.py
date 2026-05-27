"""FastAPI gateway exposing point-in-time form and DefCon player views."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, cast

import polars as pl
from fastapi import Depends, FastAPI, HTTPException, Query

from fpl_analytics_engine import club, data, defcon, fixtures, form, player
from fpl_analytics_engine.domain import Position
from fpl_analytics_engine.schemas import (
    ClubForm,
    ClubFormValidation,
    DefconPlayer,
    DefconProbabilityPlayer,
    FormPlayer,
    PlayerDetail,
    PlayerGameweek,
    PlayerSeasonSummary,
)

DATA_ROOT = Path("data")
DATA_DIR = DATA_ROOT / "2025-26"
CURRENT_SEASON = "2025-26"
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
    "fdr_mae",
    "fdr_plus_form_mae",
    "mae_improvement",
    "mae_improvement_pct",
    "fdr_rmse",
    "fdr_plus_form_rmse",
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


@lru_cache
def _load_history() -> pl.DataFrame:
    """Load and cache the enriched season history from the archive."""
    return data.prepare_history(DATA_DIR)


@lru_cache
def _load_fixtures() -> pl.DataFrame:
    """Load and cache the archived fixtures (empty if not yet captured)."""
    return data.load_fixtures(DATA_DIR)


@lru_cache
def _load_teams() -> pl.DataFrame:
    """Load and cache the team metadata for the fixture-id-to-name bridge."""
    return data.load_teams(DATA_DIR)


@lru_cache
def _load_players_snapshot() -> pl.DataFrame:
    """Load and cache the current player metadata for the live overlay."""
    return data.load_players(DATA_DIR)


@lru_cache
def _load_all_seasons() -> pl.DataFrame:
    """Load and cache every archived season's enriched snapshot."""
    return data.load_all_seasons(DATA_ROOT)


def get_history() -> pl.DataFrame:
    """Return the enriched history (dependency; overridden in tests)."""
    return _load_history()


def get_fixtures_data() -> pl.DataFrame:
    """Return the archived fixtures (dependency; overridden in tests)."""
    return _load_fixtures()


def get_teams() -> pl.DataFrame:
    """Return the team metadata (dependency; overridden in tests)."""
    return _load_teams()


def get_players_snapshot() -> pl.DataFrame:
    """Return the current player metadata (dependency; overridden in tests)."""
    return _load_players_snapshot()


def get_all_seasons() -> pl.DataFrame:
    """Return the cross-season enriched history (dependency; overridden in tests)."""
    return _load_all_seasons()


def _latest_gw(history: pl.DataFrame) -> int:
    """Return the most recent gameweek present in the data."""
    return cast(int, history["round"].max())


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


app = FastAPI(title="FPL Analytics Engine")


@app.get("/")
def root(history: Annotated[pl.DataFrame, Depends(get_history)]) -> dict:
    """Report basic service metadata."""
    return {"name": "fpl-analytics-engine", "latest_gw": _latest_gw(history)}


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
    latest = _latest_gw(history)
    gw = as_of_gw if as_of_gw is not None else latest
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
    latest = _latest_gw(history)
    gw = as_of_gw if as_of_gw is not None else latest
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
    min_minutes: int = Query(60, ge=0),
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1, description=AS_OF_GW_DESCRIPTION),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
) -> list[DefconProbabilityPlayer]:
    """Rank players by their modelled probability of hitting DefCon next GW.

    Uses an empirical-Bayes estimate over all eligible appearances up to
    ``as_of_gw`` (defaults to the latest gameweek).
    """
    latest = _latest_gw(history)
    gw = as_of_gw if as_of_gw is not None else latest
    probabilities = defcon.defcon_probabilities(history, gw, min_minutes=min_minutes)
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
    latest = _latest_gw(history)
    gw = as_of_gw if as_of_gw is not None else latest
    table = club.compute_club_form_table(history, gw, window)
    if top_k is not None:
        table = table.head(top_k)
    table = _attach_club_fdr(table, fixtures_data, gw, fdr_horizon)
    return [ClubForm(**row) for row in table.select(CLUB_FORM_COLUMNS).to_dicts()]


@app.get("/clubs/form-validation")
def clubs_form_validation(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    fixtures_data: Annotated[pl.DataFrame, Depends(get_fixtures_data)],
    window: int = Query(club.DEFAULT_WINDOW, ge=1, le=20),
    fdr_horizon: int = Query(DEFAULT_FDR_HORIZON, ge=1, le=10),
    min_train_rows: int = Query(
        club.DEFAULT_VALIDATION_MIN_TRAIN_ROWS,
        ge=1,
        description="Minimum prior club/GW rows before an as-of GW is scored.",
    ),
) -> list[ClubFormValidation]:
    """Validate whether club form improves an FDR-only baseline.

    The backtest trains FDR-only and FDR-plus-form linear baselines on earlier
    club/GW rows only, then scores the next horizon's realised xG and xGC per
    match. Positive improvement means the club-form signal reduced error.
    """
    scored = club.backtest_club_form_signals(
        history,
        fixtures_data,
        window=window,
        fdr_horizon=fdr_horizon,
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
    window: int = Query(player.DEFAULT_ROLLING_WINDOW, ge=1, le=20),
    season: str | None = None,
) -> PlayerDetail:
    """Return a player's selected-season per-gameweek form and season history.

    ``element`` is the current-season FPL id; the player is tracked across
    seasons by their stable ``code``. Rolling figures use a trailing ``window``.
    """
    current = all_seasons.filter(
        pl.col("season") == CURRENT_SEASON, pl.col("element") == element
    )
    if current.is_empty():
        raise HTTPException(status_code=404, detail="Player not found")

    latest = current.sort("round").row(-1, named=True)
    code = latest["code"]
    # Track the player across seasons by code; fall back to the current season
    # when the code is missing.
    history = (
        all_seasons.filter(pl.col("code") == code) if code is not None else current
    )
    seasons = player.season_summaries(history)
    selected_season = season or CURRENT_SEASON
    season_history = history.filter(pl.col("season") == selected_season)
    if season_history.is_empty():
        raise HTTPException(status_code=404, detail="Season not found for player")

    gameweeks = player.player_gameweeks(season_history, window)
    gw_cols = list(PlayerGameweek.model_fields)
    season_cols = list(PlayerSeasonSummary.model_fields)
    return PlayerDetail(
        element=element,
        code=code,
        web_name=latest["web_name"],
        position=latest["position"],
        team_name=latest["team_name"],
        rolling_window=window,
        selected_season=selected_season,
        gameweeks=[
            PlayerGameweek(**row) for row in gameweeks.select(gw_cols).to_dicts()
        ],
        seasons=[
            PlayerSeasonSummary(**row) for row in seasons.select(season_cols).to_dicts()
        ],
    )

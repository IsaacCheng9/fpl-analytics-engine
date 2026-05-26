"""FastAPI gateway exposing point-in-time form and DefCon player views."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, cast

import polars as pl
from fastapi import Depends, FastAPI, Query

from fpl_analytics_engine import data, defcon, fixtures, form
from fpl_analytics_engine.domain import Position
from fpl_analytics_engine.schemas import (
    DefconPlayer,
    DefconProbabilityPlayer,
    FormPlayer,
)

DATA_DIR = Path("data/2025-26")
DEFAULT_FDR_HORIZON = 5

# Fixture difficulty and live-snapshot overlay, attached to every player view.
FIXTURE_CONTEXT_COLUMNS = [
    "upcoming_fixtures",
    "avg_fdr",
    "current_ownership",
    "current_chance_of_playing",
]
# Adds point-in-time value efficiency, for the form-derived tables.
CONTEXT_COLUMNS = [
    "window_xgi90_per_million",
    "season_points_per_million",
    "window_start_rate",
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
    "season_xgi90",
    "delta_xgi90",
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
    *CONTEXT_COLUMNS,
    "as_of_gw",
]
DEFCON_PROBABILITY_COLUMNS = [
    "element",
    "web_name",
    "position",
    "team_name",
    "games",
    "hits",
    "raw_rate",
    "prob",
    "prob_std",
    *FIXTURE_CONTEXT_COLUMNS,
    "as_of_gw",
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


def _latest_gw(history: pl.DataFrame) -> int:
    """Return the most recent gameweek present in the data."""
    return cast(int, history["round"].max())


def _attach_overlay(
    table: pl.DataFrame, players: pl.DataFrame, gw: int, latest_gw: int
) -> pl.DataFrame:
    """Attach current ownership and availability, latest-GW view only.

    Ownership and the fitness flag are live-snapshot fields with no per-gameweek
    history, so attaching them to a historical ``as_of_gw`` would be
    anachronistic. They are joined only when the view is the latest gameweek;
    otherwise the columns are present but null to keep a stable schema.
    """
    if gw != latest_gw or players.height == 0:
        return table.with_columns(
            pl.lit(None, dtype=pl.Float64).alias("current_ownership"),
            pl.lit(None, dtype=pl.Float64).alias("current_chance_of_playing"),
        )
    overlay = players.select(
        pl.col("id").alias("element"),
        pl.col("selected_by_percent").cast(pl.Float64).alias("current_ownership"),
        pl.col("chance_of_playing_next_round")
        .cast(pl.Float64)
        .alias("current_chance_of_playing"),
    )
    return table.join(overlay, on="element", how="left")


def _attach_context(
    table: pl.DataFrame,
    fixtures_data: pl.DataFrame,
    teams: pl.DataFrame,
    players: pl.DataFrame,
    gw: int,
    latest_gw: int,
    horizon: int,
) -> pl.DataFrame:
    """Attach fixture difficulty and the live ownership overlay to a table."""
    with_fdr = fixtures.attach_team_fdr(table, fixtures_data, teams, gw, horizon)
    return _attach_overlay(with_fdr, players, gw, latest_gw)


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
    as_of_gw: int | None = Query(None, ge=1),
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
    flagged = _attach_context(
        flagged, fixtures_data, teams, players, gw, latest, fdr_horizon
    )
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
    as_of_gw: int | None = Query(None, ge=1),
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
    flagged = _attach_context(
        flagged, fixtures_data, teams, players, gw, latest, fdr_horizon
    )
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
    as_of_gw: int | None = Query(None, ge=1),
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
    ranked = _attach_context(
        ranked, fixtures_data, teams, players, gw, latest, fdr_horizon
    )
    return [
        DefconProbabilityPlayer(**row)
        for row in ranked.select(DEFCON_PROBABILITY_COLUMNS).to_dicts()
    ]

"""FastAPI gateway exposing point-in-time form and DefCon player views."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, cast

import polars as pl
from fastapi import Depends, FastAPI, Query

from fpl_analytics_engine import data, form
from fpl_analytics_engine.domain import Position
from fpl_analytics_engine.schemas import DefconPlayer, FormPlayer

DATA_DIR = Path("data/2025-26")

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
    "as_of_gw",
]


@lru_cache
def _load_history() -> pl.DataFrame:
    """Load and cache the enriched season history from the archive."""
    return data.prepare_history(DATA_DIR)


def get_history() -> pl.DataFrame:
    """Return the enriched history (dependency; overridden in tests)."""
    return _load_history()


def _latest_gw(history: pl.DataFrame) -> int:
    """Return the most recent gameweek present in the data."""
    return cast(int, history["round"].max())


app = FastAPI(title="FPL Analytics Engine")


@app.get("/")
def root(history: Annotated[pl.DataFrame, Depends(get_history)]) -> dict:
    """Report basic service metadata."""
    return {"name": "fpl-analytics-engine", "latest_gw": _latest_gw(history)}


@app.get("/players/form")
def players_form(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    window: int = Query(form.DEFAULT_WINDOW, ge=1, le=20),
    position: Position | None = None,
    min_minutes: int = Query(0, ge=0),
    min_delta: float = 0.0,
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1),
) -> list[FormPlayer]:
    """Rank players by their recent-versus-season xGI90 form swing.

    Defaults to the latest gameweek in the data; pass ``as_of_gw`` to evaluate
    the point-in-time view as it would have looked after an earlier gameweek.
    """
    gw = as_of_gw if as_of_gw is not None else _latest_gw(history)
    table = form.compute_form_table(history, gw, window)
    flagged = form.flag_players(
        table,
        min_window_minutes=min_minutes,
        min_delta_xgi90=min_delta,
        position=position.value if position is not None else None,
        top_k=top_k,
    )
    return [FormPlayer(**row) for row in flagged.select(FORM_COLUMNS).to_dicts()]


@app.get("/players/defcon")
def players_defcon(
    history: Annotated[pl.DataFrame, Depends(get_history)],
    window: int = Query(form.DEFAULT_WINDOW, ge=1, le=20),
    position: Position | None = None,
    min_minutes: int = Query(0, ge=0),
    min_hit_rate: float = Query(0.0, ge=0.0, le=1.0),
    top_k: int | None = Query(None, ge=1),
    as_of_gw: int | None = Query(None, ge=1),
) -> list[DefconPlayer]:
    """Rank players by their recent DefCon threshold hit-rate.

    Defaults to the latest gameweek in the data; pass ``as_of_gw`` to evaluate
    the point-in-time view as it would have looked after an earlier gameweek.
    """
    gw = as_of_gw if as_of_gw is not None else _latest_gw(history)
    table = form.compute_form_table(history, gw, window)
    flagged = form.flag_defcon(
        table,
        min_window_minutes=min_minutes,
        min_hit_rate=min_hit_rate,
        position=position.value if position is not None else None,
        top_k=top_k,
    )
    return [DefconPlayer(**row) for row in flagged.select(DEFCON_COLUMNS).to_dicts()]

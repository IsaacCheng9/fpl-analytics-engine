"""Pydantic response models for the API endpoints."""

from pydantic import BaseModel


class FormPlayer(BaseModel):
    """A player's recent attacking form versus their season-to-date baseline."""

    element: int
    web_name: str
    position: str | None
    team_name: str | None
    price: float
    window_games: int
    window_minutes: int
    window_xg90: float | None
    window_xa90: float | None
    window_xgi90: float | None
    season_xgi90: float | None
    delta_xgi90: float | None
    as_of_gw: int


class DefconPlayer(BaseModel):
    """A player's recent defensive-contribution form."""

    element: int
    web_name: str
    position: str | None
    team_name: str | None
    price: float
    window_games: int
    window_minutes: int
    window_defcon_hits: int | None
    window_defcon_games: int | None
    window_defcon_hit_rate: float | None
    as_of_gw: int

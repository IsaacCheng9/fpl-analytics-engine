"""Pydantic response models for the API endpoints."""

from pydantic import BaseModel, Field


class FixtureContext(BaseModel):
    """Fixture and live-snapshot context shared by every player view."""

    upcoming_fixtures: int | None
    avg_fdr: float | None
    current_ownership: float | None = Field(
        description=(
            "Live ownership percentage. Always the present-day snapshot - it is "
            "not point-in-time and does not change with as_of_gw, because the FPL "
            "API exposes no historical per-gameweek ownership."
        ),
    )


class PlayerContext(FixtureContext):
    """Adds point-in-time value efficiency and playing time to the context."""

    window_xgi90_per_million: float | None
    season_points_per_million: float | None
    window_start_rate: float | None
    window_mins_per_appearance: float | None


class FormPlayer(PlayerContext):
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
    season_xg90: float | None
    season_xa90: float | None
    season_xgi90: float | None
    delta_xg90: float | None
    delta_xa90: float | None
    delta_xgi90: float | None
    window_xg90_per_million: float | None
    window_xa90_per_million: float | None
    as_of_gw: int


class ClubForm(BaseModel):
    """A club's recent attacking and defensive form versus its baseline."""

    team: int
    team_name: str
    window_matches: int
    season_matches: int
    window_xg_per_match: float | None
    season_xg_per_match: float | None
    delta_xg_per_match: float | None
    window_goals_for_per_match: float | None
    season_goals_for_per_match: float | None
    delta_goals_for_per_match: float | None
    window_xgc_per_match: float | None
    season_xgc_per_match: float | None
    delta_xgc_per_match: float | None
    window_goals_against_per_match: float | None
    season_goals_against_per_match: float | None
    delta_goals_against_per_match: float | None
    window_finishing_delta: float | None
    window_concession_delta: float | None
    attack_form: float | None
    defence_form: float | None
    upcoming_fixtures: int | None
    avg_fdr: float | None
    as_of_gw: int


class DefconPlayer(PlayerContext):
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
    window_defcon: float | None
    as_of_gw: int


class PlayerGameweek(BaseModel):
    """One gameweek of a player's selected season, with rolling form."""

    round: int
    kickoff_time: str | None
    minutes: int
    total_points: int
    price: float | None
    expected_goals: float | None
    expected_assists: float | None
    expected_goal_involvements: float | None
    defensive_contribution: int | None
    defcon_hit: bool | None
    rolling_xg90: float | None
    rolling_xa90: float | None
    rolling_xgi90: float | None
    rolling_defcon: float | None


class PlayerSeasonSummary(BaseModel):
    """A player's aggregate output for one season.

    ``defcon_hit_rate`` is null where DefCon data does not exist (before
    2025-26); 2022-23 expected-stat rates are scoped to GW16-38 because the
    archive has no expected stats before then.
    """

    season: str
    games: int
    minutes: int
    points: int
    xg90: float | None
    xa90: float | None
    xgi90: float | None
    points_per_million: float | None
    defcon_hit_rate: float | None


class PlayerDetail(BaseModel):
    """A single player's per-gameweek form and cross-season history."""

    element: int
    code: int | None
    web_name: str
    position: str | None
    team_name: str | None
    rolling_window: int
    selected_season: str
    gameweeks: list[PlayerGameweek]
    seasons: list[PlayerSeasonSummary]


class DefconProbabilityPlayer(PlayerContext):
    """A player's modelled probability of hitting the DefCon threshold.

    Carries the same value and playing-time context as the DefCon form view, so
    the two tables present a consistent set of columns.
    """

    element: int
    web_name: str
    position: str | None
    team_name: str | None
    price: float | None
    window_minutes: int | None
    window_defcon: float | None
    games: int
    hits: int
    raw_rate: float | None
    prob: float | None
    prob_std: float | None
    as_of_gw: int

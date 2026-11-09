"""Pydantic response models for the API endpoints."""

from pydantic import BaseModel, Field


class ApiMeta(BaseModel):
    """Describe the live season and current analytical readiness."""

    name: str
    season: str
    latest_gw: int
    data_status: str
    next_deadline: str | None


class FixtureContext(BaseModel):
    """Fixture and live-snapshot context shared by every player view."""

    upcoming_fixtures: int | None
    avg_fdr: float | None
    next_fixture_gw: int | None = None
    next_opponent_name: str | None = None
    next_was_home: bool | None = None
    next_fdr: int | None = None
    current_ownership: float | None = Field(
        description=(
            "Live ownership percentage. Always the present-day snapshot - it is "
            "not point-in-time and does not change with as_of_gw, because the FPL "
            "API exposes no historical per-gameweek ownership."
        ),
    )


class CurrentPlayerContext(FixtureContext):
    """Describe current snapshot metadata and scheduled, unplayed fixtures."""

    element: int
    web_name: str | None
    position: str | None
    team_name: str | None
    price: float | None


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
    est_xg90: float | None
    est_xa90: float | None
    est_xgi90: float | None
    projected_minutes: float
    projected_xgi: float | None
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
    window_xgd_per_match: float | None
    season_xgd_per_match: float | None
    window_goals_against_per_match: float | None
    season_goals_against_per_match: float | None
    delta_goals_against_per_match: float | None
    window_finishing_delta: float | None
    season_finishing_delta: float | None
    window_concession_delta: float | None
    season_concession_delta: float | None
    window_finishing_delta_total: float | None
    season_finishing_delta_total: float | None
    window_concession_delta_total: float | None
    season_concession_delta_total: float | None
    window_goal_difference_delta: float | None
    season_goal_difference_delta: float | None
    window_goal_difference_delta_total: float | None
    season_goal_difference_delta_total: float | None
    attack_form: float | None
    defence_form: float | None
    upcoming_fixtures: int | None
    avg_fdr: float | None
    as_of_gw: int


class ClubFormValidation(BaseModel):
    """Validation metrics for season-baseline versus baseline-plus-form models."""

    target: str
    n_predictions: int
    baseline_mae: float | None
    baseline_plus_form_mae: float | None
    mae_improvement: float | None
    mae_improvement_pct: float | None
    baseline_rmse: float | None
    baseline_plus_form_rmse: float | None
    rmse_improvement: float | None
    rmse_improvement_pct: float | None


class DefconCalibrationBin(BaseModel):
    """One probability bucket from the DefCon calibration backtest."""

    bin: int
    n: int
    mean_predicted: float
    observed_rate: float
    abs_error: float


class DefconProbabilityValidation(BaseModel):
    """Backtest summary for the DefCon probability model."""

    n_predictions: int
    model_brier: float | None
    binary_model_brier: float | None
    count_model_brier: float | None
    raw_rate_brier: float | None
    constant_brier: float | None
    model_ece: float | None
    binary_model_ece: float | None
    count_model_ece: float | None
    raw_rate_ece: float | None
    model_improvement_vs_raw: float | None
    model_improvement_vs_binary: float | None
    model_improvement_vs_count: float | None
    model_improvement_vs_constant: float | None
    calibration: list[DefconCalibrationBin]


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
    as_of_gw: int
    web_name: str
    position: str | None
    team_name: str | None
    rolling_window: int
    selected_season: str
    available_seasons: list[str]
    gameweeks: list[PlayerGameweek]
    seasons: list[PlayerSeasonSummary]


class FplTeamPick(BaseModel):
    """One player from a public FPL entry's latest visible squad."""

    element: int
    web_name: str | None
    position: str | None
    team_name: str | None
    squad_position: int
    multiplier: int
    is_captain: bool
    is_vice_captain: bool
    is_starting: bool


class FplTeam(BaseModel):
    """A public FPL entry's imported squad for one visible gameweek."""

    entry_id: int
    as_of_gw: int
    owned_elements: list[int]
    picks: list[FplTeamPick]


class DefconProbabilityPlayer(PlayerContext):
    """A player's DefCon hit probability conditional on the minutes threshold.

    Carries the same value and playing-time context as the DefCon form view, so
    the two tables present a consistent set of columns. The endpoint defaults
    to appearances of at least 60 minutes.
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
    prob: float | None = Field(
        description=(
            "DefCon hit probability conditional on meeting the endpoint's "
            "minimum-minutes threshold (60 by default)."
        )
    )
    as_of_gw: int

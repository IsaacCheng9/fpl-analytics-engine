const API_BASE = "/api";

export type Position = "GK" | "DEF" | "MID" | "FWD" | "MNG";

export interface Meta {
	name: string;
	season: string;
	latest_gw: number;
	data_status: "preseason" | "ready";
	next_deadline: string | null;
}

export interface UpcomingFixture {
	gw: number;
	opponent_name: string;
	opponent_short_name: string;
	was_home: boolean;
	fdr: number;
}

// Fixture difficulty and the live ownership overlay shared by every player
// view. current_ownership is always the present-day snapshot, not point-in-time.
export interface FixtureContext {
	upcoming_fixtures: number | null;
	avg_fdr: number | null;
	next_fixture_gw: number | null;
	next_opponent_name: string | null;
	next_was_home: boolean | null;
	next_fdr: number | null;
	next_fixtures: UpcomingFixture[];
	current_ownership: number | null;
}

export interface CurrentPlayerContext extends FixtureContext {
	element: number;
	web_name: string | null;
	position: string | null;
	team_name: string | null;
	price: number | null;
}

// Adds point-in-time value efficiency and playing time, for the form tables.
export interface PlayerContext extends FixtureContext {
	window_xgi90_per_million: number | null;
	season_points_per_million: number | null;
	window_start_rate: number | null;
	window_mins_per_appearance: number | null;
}

export interface FormPlayer extends PlayerContext {
	element: number;
	web_name: string;
	position: string | null;
	team_name: string | null;
	price: number;
	window_games: number;
	window_minutes: number;
	window_xg90: number | null;
	window_xa90: number | null;
	window_xgi90: number | null;
	season_xg90: number | null;
	season_xa90: number | null;
	season_xgi90: number | null;
	delta_xg90: number | null;
	delta_xa90: number | null;
	delta_xgi90: number | null;
	est_xg90: number | null;
	est_xa90: number | null;
	est_xgi90: number | null;
	projected_minutes: number;
	projected_xgi: number | null;
	window_xg90_per_million: number | null;
	window_xa90_per_million: number | null;
	as_of_gw: number;
}

export interface ClubForm {
	team: number;
	team_name: string;
	window_matches: number;
	season_matches: number;
	window_xg_per_match: number | null;
	season_xg_per_match: number | null;
	delta_xg_per_match: number | null;
	window_goals_for_per_match: number | null;
	season_goals_for_per_match: number | null;
	delta_goals_for_per_match: number | null;
	window_xgc_per_match: number | null;
	season_xgc_per_match: number | null;
	delta_xgc_per_match: number | null;
	window_xgd_per_match: number | null;
	season_xgd_per_match: number | null;
	window_goals_against_per_match: number | null;
	season_goals_against_per_match: number | null;
	delta_goals_against_per_match: number | null;
	window_finishing_delta: number | null;
	season_finishing_delta: number | null;
	window_concession_delta: number | null;
	season_concession_delta: number | null;
	window_finishing_delta_total: number | null;
	season_finishing_delta_total: number | null;
	window_concession_delta_total: number | null;
	season_concession_delta_total: number | null;
	window_goal_difference_delta: number | null;
	season_goal_difference_delta: number | null;
	window_goal_difference_delta_total: number | null;
	season_goal_difference_delta_total: number | null;
	attack_form: number | null;
	defence_form: number | null;
	upcoming_fixtures: number | null;
	avg_fdr: number | null;
	next_fixtures: UpcomingFixture[];
	as_of_gw: number;
}

export interface FormSignalValidation {
	signal: string;
	mean_rank_correlation: number | null;
	top_future_xgi: number | null;
	top_future_points: number | null;
}

export interface MinutesForecastValidation {
	forecast: string;
	mean_absolute_error: number | null;
}

export interface FormValidation {
	window: number;
	horizon: number;
	top_k: number;
	n_predictions: number;
	n_gameweeks: number;
	swing_persistence: number | null;
	swing_persistence_low: number | null;
	swing_persistence_high: number | null;
	minutes_persistence: number | null;
	minutes_forecast: MinutesForecastValidation[];
	signals: FormSignalValidation[];
}

export interface ClubFormValidation {
	target: string;
	n_predictions: number;
	baseline_mae: number | null;
	baseline_plus_form_mae: number | null;
	mae_improvement: number | null;
	mae_improvement_pct: number | null;
	baseline_rmse: number | null;
	baseline_plus_form_rmse: number | null;
	rmse_improvement: number | null;
	rmse_improvement_pct: number | null;
}

export interface DefconCalibrationBin {
	bin: number;
	n: number;
	mean_predicted: number;
	observed_rate: number;
	abs_error: number;
}

export interface DefconProbabilityValidation {
	n_predictions: number;
	model_brier: number | null;
	binary_model_brier: number | null;
	count_model_brier: number | null;
	raw_rate_brier: number | null;
	constant_brier: number | null;
	model_ece: number | null;
	binary_model_ece: number | null;
	count_model_ece: number | null;
	raw_rate_ece: number | null;
	model_improvement_vs_raw: number | null;
	model_improvement_vs_binary: number | null;
	model_improvement_vs_count: number | null;
	model_improvement_vs_constant: number | null;
	calibration: DefconCalibrationBin[];
}

export interface DefconPlayer extends PlayerContext {
	element: number;
	web_name: string;
	position: string | null;
	team_name: string | null;
	price: number;
	window_games: number;
	window_minutes: number;
	window_defcon_hits: number | null;
	window_defcon_games: number | null;
	window_defcon_hit_rate: number | null;
	window_defcon: number | null;
	as_of_gw: number;
}

export interface DefconProbabilityPlayer extends PlayerContext {
	element: number;
	web_name: string;
	position: string | null;
	team_name: string | null;
	price: number | null;
	window_minutes: number | null;
	window_defcon: number | null;
	games: number;
	hits: number;
	raw_rate: number | null;
	prob: number | null;
	as_of_gw: number;
}

export interface PlayerGameweek {
	round: number;
	kickoff_time: string | null;
	opponent_name: string | null;
	opponent_short_name: string | null;
	was_home: boolean | null;
	minutes: number;
	total_points: number;
	goals_scored: number | null;
	assists: number | null;
	bonus: number | null;
	price: number | null;
	expected_goals: number | null;
	expected_assists: number | null;
	expected_goal_involvements: number | null;
	defensive_contribution: number | null;
	defcon_hit: boolean | null;
	rolling_xg90: number | null;
	rolling_xa90: number | null;
	rolling_xgi90: number | null;
	rolling_defcon: number | null;
}

export interface PlayerSeasonSummary {
	season: string;
	games: number;
	minutes: number;
	points: number;
	xg90: number | null;
	xa90: number | null;
	xgi90: number | null;
	points_per_million: number | null;
	defcon_hit_rate: number | null;
}

export interface PlayerDetail {
	element: number;
	code: number | null;
	as_of_gw: number;
	web_name: string;
	position: string | null;
	team_name: string | null;
	rolling_window: number;
	selected_season: string;
	available_seasons: string[];
	next_fixtures: UpcomingFixture[];
	gameweeks: PlayerGameweek[];
	seasons: PlayerSeasonSummary[];
}

export interface FplTeamPick {
	element: number;
	web_name: string | null;
	position: string | null;
	team_name: string | null;
	squad_position: number;
	multiplier: number;
	is_captain: boolean;
	is_vice_captain: boolean;
	is_starting: boolean;
}

export interface FplTeam {
	entry_id: number;
	as_of_gw: number;
	owned_elements: number[];
	picks: FplTeamPick[];
}

interface BaseParams {
	window: number;
	position: Position | "";
	minMinutes: number;
	asOfGw: number | null;
}

export interface FormParams extends BaseParams {
	minDelta?: number;
}

export interface DefconParams extends BaseParams {
	minHitRate: number;
}

export interface DefconProbabilityParams {
	position: Position | "";
	minGames: number;
	asOfGw: number | null;
}

export interface ClubFormParams {
	window: number;
	asOfGw: number | null;
}

export interface FormValidationParams {
	window?: number;
	horizon?: number;
	season?: string;
}

export interface ClubFormValidationParams {
	window?: number;
	horizon?: number;
	minTrainRows?: number;
	season?: string;
}

export interface DefconProbabilityValidationParams {
	bins?: number;
	minMinutes?: number;
	season?: string;
}

export class ApiError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`Request failed with status ${status}`);
		this.name = "ApiError";
		this.status = status;
	}
}

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`);
	if (!response.ok) {
		throw new ApiError(response.status);
	}
	return (await response.json()) as T;
}

function baseSearchParams(params: BaseParams): URLSearchParams {
	const search = new URLSearchParams();
	search.set("window", String(params.window));
	search.set("min_minutes", String(params.minMinutes));
	if (params.position) {
		search.set("position", params.position);
	}
	if (params.asOfGw !== null) {
		search.set("as_of_gw", String(params.asOfGw));
	}
	return search;
}

export function fetchMeta(): Promise<Meta> {
	return getJson<Meta>("/");
}

export function fetchForm(params: FormParams): Promise<FormPlayer[]> {
	const search = baseSearchParams(params);
	if (params.minDelta !== undefined) {
		search.set("min_delta", String(params.minDelta));
	}
	return getJson<FormPlayer[]>(`/players/form?${search.toString()}`);
}

export function fetchCurrentPlayerContext(): Promise<CurrentPlayerContext[]> {
	return getJson<CurrentPlayerContext[]>("/players/current-context");
}

export function fetchDefcon(params: DefconParams): Promise<DefconPlayer[]> {
	const search = baseSearchParams(params);
	search.set("min_hit_rate", String(params.minHitRate));
	return getJson<DefconPlayer[]>(`/players/defcon?${search.toString()}`);
}

export function fetchDefconProbability(
	params: DefconProbabilityParams,
): Promise<DefconProbabilityPlayer[]> {
	const search = new URLSearchParams();
	search.set("min_games", String(params.minGames));
	if (params.position) {
		search.set("position", params.position);
	}
	if (params.asOfGw !== null) {
		search.set("as_of_gw", String(params.asOfGw));
	}
	return getJson<DefconProbabilityPlayer[]>(
		`/players/defcon-probability?${search.toString()}`,
	);
}

export function fetchClubForm(params: ClubFormParams): Promise<ClubForm[]> {
	const search = new URLSearchParams();
	search.set("window", String(params.window));
	if (params.asOfGw !== null) {
		search.set("as_of_gw", String(params.asOfGw));
	}
	return getJson<ClubForm[]>(`/clubs/form?${search.toString()}`);
}

export function fetchFormValidation(
	params: FormValidationParams = {},
): Promise<FormValidation> {
	const search = new URLSearchParams();
	if (params.window !== undefined) {
		search.set("window", String(params.window));
	}
	if (params.horizon !== undefined) {
		search.set("horizon", String(params.horizon));
	}
	if (params.season !== undefined) {
		search.set("season", params.season);
	}
	const query = search.toString();
	return getJson<FormValidation>(
		`/players/form-validation${query ? `?${query}` : ""}`,
	);
}

export function fetchClubFormValidation(
	params: ClubFormValidationParams = {},
): Promise<ClubFormValidation[]> {
	const search = new URLSearchParams();
	if (params.window !== undefined) {
		search.set("window", String(params.window));
	}
	if (params.horizon !== undefined) {
		search.set("horizon", String(params.horizon));
	}
	if (params.minTrainRows !== undefined) {
		search.set("min_train_rows", String(params.minTrainRows));
	}
	if (params.season) {
		search.set("season", params.season);
	}
	const query = search.toString();
	return getJson<ClubFormValidation[]>(
		`/clubs/form-validation${query ? `?${query}` : ""}`,
	);
}

export function fetchDefconProbabilityValidation(
	params: DefconProbabilityValidationParams = {},
): Promise<DefconProbabilityValidation> {
	const search = new URLSearchParams();
	if (params.bins !== undefined) {
		search.set("bins", String(params.bins));
	}
	if (params.minMinutes !== undefined) {
		search.set("min_minutes", String(params.minMinutes));
	}
	if (params.season) {
		search.set("season", params.season);
	}
	const query = search.toString();
	return getJson<DefconProbabilityValidation>(
		`/players/defcon-probability-validation${query ? `?${query}` : ""}`,
	);
}

export function fetchPlayerDetail(
	element: number,
	window: number,
	season?: string | null,
	asOfGw?: number | null,
): Promise<PlayerDetail> {
	const params = new URLSearchParams({ window: String(window) });
	if (season) {
		params.set("season", season);
	}
	if (asOfGw !== null && asOfGw !== undefined) {
		params.set("as_of_gw", String(asOfGw));
	}
	return getJson<PlayerDetail>(`/players/${element}?${params}`);
}

export function fetchFplTeam(
	entryId: number,
	event: number | null = null,
): Promise<FplTeam> {
	const params = new URLSearchParams();
	if (event !== null) {
		params.set("event", String(event));
	}
	const query = params.toString();
	return getJson<FplTeam>(`/fpl-team/${entryId}${query ? `?${query}` : ""}`);
}

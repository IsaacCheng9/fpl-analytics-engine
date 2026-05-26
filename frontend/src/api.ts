const API_BASE = "/api";

export type Position = "GK" | "DEF" | "MID" | "FWD" | "MNG";

export interface Meta {
	name: string;
	latest_gw: number;
}

// Fixture difficulty and live-snapshot overlay shared by every player view.
// The current_* fields are populated only on the latest-GW view.
export interface FixtureContext {
	upcoming_fixtures: number | null;
	avg_fdr: number | null;
	current_ownership: number | null;
	current_chance_of_playing: number | null;
}

// Adds point-in-time value efficiency, for the form-derived tables.
export interface PlayerContext extends FixtureContext {
	window_xgi90_per_million: number | null;
	season_points_per_million: number | null;
	window_start_rate: number | null;
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
	season_xgi90: number | null;
	delta_xgi90: number | null;
	as_of_gw: number;
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
	as_of_gw: number;
}

export interface DefconProbabilityPlayer extends FixtureContext {
	element: number;
	web_name: string;
	position: string | null;
	team_name: string | null;
	games: number;
	hits: number;
	raw_rate: number | null;
	prob: number | null;
	prob_std: number | null;
	as_of_gw: number;
}

interface BaseParams {
	window: number;
	position: Position | "";
	minMinutes: number;
	asOfGw: number | null;
}

export interface FormParams extends BaseParams {
	minDelta: number;
}

export interface DefconParams extends BaseParams {
	minHitRate: number;
}

export interface DefconProbabilityParams {
	position: Position | "";
	minGames: number;
	asOfGw: number | null;
}

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`);
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
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
	search.set("min_delta", String(params.minDelta));
	return getJson<FormPlayer[]>(`/players/form?${search.toString()}`);
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

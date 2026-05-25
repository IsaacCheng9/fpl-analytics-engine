const API_BASE = "/api";

export type Position = "GK" | "DEF" | "MID" | "FWD" | "MNG";

export interface Meta {
	name: string;
	latest_gw: number;
}

export interface FormPlayer {
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

export interface DefconPlayer {
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

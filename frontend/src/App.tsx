import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Cell, CellContext, ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import {
	type ClubForm,
	type DefconPlayer,
	type DefconProbabilityPlayer,
	type FormPlayer,
	fetchClubForm,
	fetchDefcon,
	fetchDefconProbability,
	fetchForm,
	fetchMeta,
	type Position,
} from "./api";
import { DataTable } from "./components/DataTable";
import { FormScatter } from "./components/FormScatter";
import { InfoTooltip } from "./components/InfoTooltip";
import { PlayerPanel } from "./components/PlayerPanel";
import { fmtDelta, fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "./lib/format";

type Tab = "form" | "defcon" | "defconProb" | "clubs";
type AttackingMetric = "xg" | "xa" | "xgi";
type AttackingMetricVisibility = Record<AttackingMetric, boolean>;
type AttackingMetricColumn = "window" | "season" | "delta" | "value";
type AttackingThreatPeriod = "window" | "season";
type AttackingThreatFilters = Record<
	AttackingMetric,
	Record<AttackingThreatPeriod, number | null>
>;
type ClubActualMetric = "goals" | "ga";
type ClubActualMetricVisibility = Record<ClubActualMetric, boolean>;
type TransferFilters = {
	maxPrice: number | null;
	maxFdr: number | null;
	minStartPct: number | null;
	minMinsPerAppearance: number | null;
	minOwnership: number | null;
	maxOwnership: number | null;
};
type TransferFilterRow = {
	price?: number | null;
	avg_fdr?: number | null;
	window_start_rate?: number | null;
	window_mins_per_appearance?: number | null;
	current_ownership?: number | null;
};
type ShortlistablePlayer = {
	element: number;
	web_name: string;
};
type ActiveFilterChip = {
	id: string;
	label: string;
	onClear: () => void;
};
type FilterPreset = "nailed" | "value" | "differential" | "fixture";
type HeatCellOptions = {
	lowerIsBetter?: boolean;
	format?: (value: number | null) => string;
};

const TAB_LABELS: Record<Tab, string> = {
	form: "Attacking Form",
	defcon: "DefCon Form",
	defconProb: "DefCon Probability",
	clubs: "Club Form",
};
const TABS: Tab[] = ["form", "defcon", "defconProb", "clubs"];
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const WINDOW_MIN = 2;
const WINDOW_MAX = 20;
const DEFAULT_TAB: Tab = "form";
const DEFAULT_PLAYER_SEARCH = "";
const DEFAULT_TEAM_FILTER = "";
const DEFAULT_WINDOW_SIZE = 5;
const DEFAULT_POSITION: Position | "" = "";
const DEFAULT_MIN_MINUTES = 180;
const DEFAULT_MIN_HIT_RATE = 0;
const DEFAULT_MIN_GAMES = 5;
const FORM_MIN_DELTA_FLOOR = -1000;
const DEFAULT_AS_OF_GW: number | null = null;
const DEFAULT_SELECTED_ELEMENT: number | null = null;
const DEFAULT_PLAYER_WINDOW = 5;
const DEFAULT_PLAYER_SEASON: string | null = null;
const DEFAULT_TRANSFER_FILTERS: TransferFilters = {
	maxPrice: null,
	maxFdr: null,
	minStartPct: null,
	minMinsPerAppearance: null,
	minOwnership: null,
	maxOwnership: null,
};
const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];
const ATTACKING_METRICS: AttackingMetric[] = ["xgi", "xg", "xa"];
const ATTACKING_METRIC_COLUMN_ORDER: AttackingMetric[] = ["xgi", "xg", "xa"];
const ATTACKING_THREAT_PERIODS: AttackingThreatPeriod[] = ["window", "season"];
const ATTACKING_METRIC_GROUP_LABELS: Record<AttackingMetricColumn, string> = {
	window: "Window",
	season: "Season",
	delta: "Delta",
	value: "",
};
const ATTACKING_METRIC_LABELS: Record<AttackingMetric, string> = {
	xg: "xG",
	xa: "xA",
	xgi: "xGI",
};
const ATTACKING_METRIC_KEYS: Record<
	AttackingMetric,
	Record<AttackingMetricColumn, keyof FormPlayer & string>
> = {
	xg: {
		window: "window_xg90",
		season: "season_xg90",
		delta: "delta_xg90",
		value: "window_xg90_per_million",
	},
	xa: {
		window: "window_xa90",
		season: "season_xa90",
		delta: "delta_xa90",
		value: "window_xa90_per_million",
	},
	xgi: {
		window: "window_xgi90",
		season: "season_xgi90",
		delta: "delta_xgi90",
		value: "window_xgi90_per_million",
	},
};
const ATTACKING_THREAT_FILTER_KEYS: Record<
	AttackingMetric,
	Record<AttackingThreatPeriod, keyof FormPlayer & string>
> = {
	xg: {
		window: "window_xg90",
		season: "season_xg90",
	},
	xa: {
		window: "window_xa90",
		season: "season_xa90",
	},
	xgi: {
		window: "window_xgi90",
		season: "season_xgi90",
	},
};
const ATTACKING_THREAT_QUERY_KEYS: Record<
	AttackingMetric,
	Record<AttackingThreatPeriod, string>
> = {
	xg: {
		window: "min_window_xg90",
		season: "min_season_xg90",
	},
	xa: {
		window: "min_window_xa90",
		season: "min_season_xa90",
	},
	xgi: {
		window: "min_window_xgi90",
		season: "min_season_xgi90",
	},
};
const ATTACKING_THREAT_PERIOD_LABELS: Record<AttackingThreatPeriod, string> = {
	window: "Window",
	season: "Season",
};
const ATTACKING_METRIC_NOUNS: Record<AttackingMetric, string> = {
	xg: "goals",
	xa: "assists",
	xgi: "goal involvements",
};
const ATTACKING_METRIC_STYLES: Record<AttackingMetric, { header: string }> = {
	xg: {
		header: "bg-emerald-100/80",
	},
	xa: {
		header: "bg-amber-100/80",
	},
	xgi: {
		header: "bg-indigo-100/80",
	},
};
const DEFAULT_ATTACKING_METRICS: AttackingMetricVisibility = {
	xg: true,
	xa: false,
	xgi: true,
};
const DEFAULT_ATTACKING_THREAT_FILTERS: AttackingThreatFilters = {
	xg: { window: null, season: null },
	xa: { window: null, season: null },
	xgi: { window: null, season: null },
};
const CLUB_ACTUAL_METRICS: ClubActualMetric[] = ["goals", "ga"];
const CLUB_ACTUAL_METRIC_LABELS: Record<ClubActualMetric, string> = {
	goals: "Goals",
	ga: "Goals Conceded",
};
const DEFAULT_CLUB_ACTUAL_METRICS: ClubActualMetricVisibility = {
	goals: false,
	ga: false,
};
const FILTER_PRESETS: Array<{ id: FilterPreset; label: string }> = [
	{ id: "nailed", label: "Nailed Starters" },
	{ id: "value", label: "Value Attack" },
	{ id: "differential", label: "Differentials" },
	{ id: "fixture", label: "Fixture Swing" },
];
const TAB_QUERY_VALUES: Record<Tab, string> = {
	form: "form",
	defcon: "defcon",
	defconProb: "defcon-prob",
	clubs: "clubs",
};
const QUERY_VALUE_TABS: Record<string, Tab> = {
	form: "form",
	defcon: "defcon",
	defconProb: "defconProb",
	"defcon-prob": "defconProb",
	clubs: "clubs",
};

type UrlState = {
	tab: Tab;
	playerSearch: string;
	teamFilter: string;
	windowSize: number;
	position: Position | "";
	minMinutes: number;
	minHitRate: number;
	minGames: number;
	asOfGw: number | null;
	selectedElement: number | null;
	playerWindow: number;
	playerSeason: string | null;
	attackingMetrics: AttackingMetricVisibility;
	attackingThreatFilters: AttackingThreatFilters;
	clubActualMetrics: ClubActualMetricVisibility;
	transferFilters: TransferFilters;
	shortlist: number[];
	showShortlistedOnly: boolean;
};

const DEFAULT_URL_STATE: UrlState = {
	tab: DEFAULT_TAB,
	playerSearch: DEFAULT_PLAYER_SEARCH,
	teamFilter: DEFAULT_TEAM_FILTER,
	windowSize: DEFAULT_WINDOW_SIZE,
	position: DEFAULT_POSITION,
	minMinutes: DEFAULT_MIN_MINUTES,
	minHitRate: DEFAULT_MIN_HIT_RATE,
	minGames: DEFAULT_MIN_GAMES,
	asOfGw: DEFAULT_AS_OF_GW,
	selectedElement: DEFAULT_SELECTED_ELEMENT,
	playerWindow: DEFAULT_PLAYER_WINDOW,
	playerSeason: DEFAULT_PLAYER_SEASON,
	attackingMetrics: DEFAULT_ATTACKING_METRICS,
	attackingThreatFilters: DEFAULT_ATTACKING_THREAT_FILTERS,
	clubActualMetrics: DEFAULT_CLUB_ACTUAL_METRICS,
	transferFilters: DEFAULT_TRANSFER_FILTERS,
	shortlist: [],
	showShortlistedOnly: false,
};

function isBrowser() {
	return typeof window !== "undefined";
}

function parseNumber(
	value: string | null,
	fallback: number,
	{ min, max }: { min?: number; max?: number } = {},
): number {
	if (value === null || value.trim() === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	if (min !== undefined && parsed < min) {
		return fallback;
	}
	if (max !== undefined && parsed > max) {
		return fallback;
	}
	return parsed;
}

function parseOptionalNumber(
	value: string | null,
	{ min, max }: { min?: number; max?: number } = {},
): number | null {
	if (value === null || value.trim() === "") {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	if (min !== undefined && parsed < min) {
		return null;
	}
	if (max !== undefined && parsed > max) {
		return null;
	}
	return parsed;
}

function parseTab(value: string | null): Tab {
	return value === null
		? DEFAULT_TAB
		: (QUERY_VALUE_TABS[value] ?? DEFAULT_TAB);
}

function parsePosition(value: string | null): Position | "" {
	return POSITIONS.includes(value as Position) ? (value as Position) : "";
}

function parseAttackingMetrics(
	value: string | null,
): AttackingMetricVisibility {
	if (value === null) {
		return { ...DEFAULT_ATTACKING_METRICS };
	}
	const visible = new Set(value.split(","));
	const parsed = Object.fromEntries(
		ATTACKING_METRICS.map((metric) => [metric, visible.has(metric)]),
	) as AttackingMetricVisibility;
	return Object.values(parsed).some(Boolean)
		? parsed
		: { ...DEFAULT_ATTACKING_METRICS };
}

function parseClubActualMetrics(
	value: string | null,
): ClubActualMetricVisibility {
	if (value === null) {
		return { ...DEFAULT_CLUB_ACTUAL_METRICS };
	}
	const visible = new Set(value.split(","));
	return Object.fromEntries(
		CLUB_ACTUAL_METRICS.map((metric) => [metric, visible.has(metric)]),
	) as ClubActualMetricVisibility;
}

function parseAttackingThreatFilters(
	params: URLSearchParams,
): AttackingThreatFilters {
	return Object.fromEntries(
		ATTACKING_METRICS.map((metric) => [
			metric,
			Object.fromEntries(
				ATTACKING_THREAT_PERIODS.map((period) => [
					period,
					parseOptionalNumber(
						params.get(ATTACKING_THREAT_QUERY_KEYS[metric][period]),
						{ min: 0 },
					),
				]),
			),
		]),
	) as AttackingThreatFilters;
}

function parseShortlist(value: string | null): number[] {
	if (value === null || value.trim() === "") {
		return [];
	}
	const elements = value
		.split(",")
		.map((part) => Number(part))
		.filter((element) => Number.isInteger(element) && element > 0);
	return Array.from(new Set(elements));
}

function readUrlState(): UrlState {
	if (!isBrowser()) {
		return { ...DEFAULT_URL_STATE };
	}
	const params = new URLSearchParams(window.location.search);
	const shortlist = parseShortlist(params.get("shortlist"));
	return {
		tab: parseTab(params.get("tab")),
		playerSearch: params.get("q") ?? DEFAULT_PLAYER_SEARCH,
		teamFilter: params.get("team") ?? DEFAULT_TEAM_FILTER,
		windowSize: clampWindowSize(
			parseNumber(params.get("window"), DEFAULT_WINDOW_SIZE),
		),
		position: parsePosition(params.get("position")),
		minMinutes: parseNumber(params.get("min_minutes"), DEFAULT_MIN_MINUTES, {
			min: 0,
		}),
		minHitRate: parseNumber(params.get("min_hit_rate"), DEFAULT_MIN_HIT_RATE, {
			min: 0,
			max: 1,
		}),
		minGames: parseNumber(params.get("min_games"), DEFAULT_MIN_GAMES, {
			min: 0,
		}),
		asOfGw: parseOptionalNumber(params.get("as_of_gw"), { min: 1 }),
		selectedElement: parseOptionalNumber(params.get("player"), { min: 1 }),
		transferFilters: {
			maxPrice: parseOptionalNumber(params.get("max_price"), { min: 0 }),
			maxFdr: parseOptionalNumber(params.get("max_fdr"), { min: 1, max: 5 }),
			minStartPct: parseOptionalNumber(params.get("min_start_pct"), {
				min: 0,
				max: 100,
			}),
			minMinsPerAppearance: parseOptionalNumber(params.get("min_mins_app"), {
				min: 0,
			}),
			minOwnership: parseOptionalNumber(params.get("min_owned"), { min: 0 }),
			maxOwnership: parseOptionalNumber(params.get("max_owned"), { min: 0 }),
		},
		playerWindow: parseNumber(
			params.get("player_window"),
			DEFAULT_PLAYER_WINDOW,
			{ min: 1, max: WINDOW_MAX },
		),
		playerSeason: params.get("season") ?? DEFAULT_PLAYER_SEASON,
		attackingMetrics: parseAttackingMetrics(params.get("metrics")),
		attackingThreatFilters: parseAttackingThreatFilters(params),
		clubActualMetrics: parseClubActualMetrics(params.get("club_actuals")),
		shortlist,
		showShortlistedOnly:
			shortlist.length > 0 && params.get("shortlist_only") === "1",
	};
}

function metricsMatchDefault(metrics: AttackingMetricVisibility): boolean {
	return ATTACKING_METRICS.every(
		(metric) => metrics[metric] === DEFAULT_ATTACKING_METRICS[metric],
	);
}

function visibleAttackingThreatFiltersMatchDefault(
	filters: AttackingThreatFilters,
	visibleMetrics: AttackingMetricVisibility,
): boolean {
	return ATTACKING_METRICS.every(
		(metric) =>
			!visibleMetrics[metric] ||
			ATTACKING_THREAT_PERIODS.every(
				(period) => filters[metric][period] === null,
			),
	);
}

function clubActualMetricsMatchDefault(
	metrics: ClubActualMetricVisibility,
): boolean {
	return CLUB_ACTUAL_METRICS.every(
		(metric) => metrics[metric] === DEFAULT_CLUB_ACTUAL_METRICS[metric],
	);
}

function transferFiltersMatchDefault(filters: TransferFilters): boolean {
	return (
		filters.maxPrice === null &&
		filters.maxFdr === null &&
		filters.minStartPct === null &&
		filters.minMinsPerAppearance === null &&
		filters.minOwnership === null &&
		filters.maxOwnership === null
	);
}

function defaultTransferFilters(): TransferFilters {
	return { ...DEFAULT_TRANSFER_FILTERS };
}

function defaultAttackingThreatFilters(): AttackingThreatFilters {
	return {
		xg: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xg },
		xa: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xa },
		xgi: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xgi },
	};
}

function writeUrlState(state: UrlState) {
	if (!isBrowser()) {
		return;
	}
	const params = new URLSearchParams();
	if (state.tab !== DEFAULT_TAB) {
		params.set("tab", TAB_QUERY_VALUES[state.tab]);
	}
	if (state.tab !== "clubs" && state.playerSearch !== DEFAULT_PLAYER_SEARCH) {
		params.set("q", state.playerSearch);
	}
	if (state.teamFilter !== DEFAULT_TEAM_FILTER) {
		params.set("team", state.teamFilter);
	}
	if (state.windowSize !== DEFAULT_WINDOW_SIZE) {
		params.set("window", String(state.windowSize));
	}
	if (state.tab !== "clubs" && state.position !== DEFAULT_POSITION) {
		params.set("position", state.position);
	}
	if (
		state.tab !== "clubs" &&
		state.tab !== "defconProb" &&
		state.minMinutes !== DEFAULT_MIN_MINUTES
	) {
		params.set("min_minutes", String(state.minMinutes));
	}
	if (state.tab === "defcon" && state.minHitRate !== DEFAULT_MIN_HIT_RATE) {
		params.set("min_hit_rate", String(state.minHitRate));
	}
	if (state.tab === "defconProb" && state.minGames !== DEFAULT_MIN_GAMES) {
		params.set("min_games", String(state.minGames));
	}
	if (state.asOfGw !== DEFAULT_AS_OF_GW) {
		params.set("as_of_gw", String(state.asOfGw));
	}
	if (!metricsMatchDefault(state.attackingMetrics)) {
		params.set(
			"metrics",
			ATTACKING_METRICS.filter((metric) => state.attackingMetrics[metric]).join(
				",",
			),
		);
	}
	if (
		state.tab === "form" &&
		!visibleAttackingThreatFiltersMatchDefault(
			state.attackingThreatFilters,
			state.attackingMetrics,
		)
	) {
		for (const metric of ATTACKING_METRICS) {
			if (!state.attackingMetrics[metric]) {
				continue;
			}
			for (const period of ATTACKING_THREAT_PERIODS) {
				const value = state.attackingThreatFilters[metric][period];
				if (value !== null) {
					params.set(
						ATTACKING_THREAT_QUERY_KEYS[metric][period],
						String(value),
					);
				}
			}
		}
	}
	if (!clubActualMetricsMatchDefault(state.clubActualMetrics)) {
		params.set(
			"club_actuals",
			CLUB_ACTUAL_METRICS.filter(
				(metric) => state.clubActualMetrics[metric],
			).join(","),
		);
	}
	if (state.shortlist.length > 0) {
		params.set("shortlist", state.shortlist.join(","));
		if (state.tab !== "clubs" && state.showShortlistedOnly) {
			params.set("shortlist_only", "1");
		}
	}
	if (
		state.tab !== "clubs" &&
		!transferFiltersMatchDefault(state.transferFilters)
	) {
		if (state.transferFilters.maxPrice !== null) {
			params.set("max_price", String(state.transferFilters.maxPrice));
		}
		if (state.transferFilters.maxFdr !== null) {
			params.set("max_fdr", String(state.transferFilters.maxFdr));
		}
		if (state.transferFilters.minStartPct !== null) {
			params.set("min_start_pct", String(state.transferFilters.minStartPct));
		}
		if (state.transferFilters.minMinsPerAppearance !== null) {
			params.set(
				"min_mins_app",
				String(state.transferFilters.minMinsPerAppearance),
			);
		}
		if (state.transferFilters.minOwnership !== null) {
			params.set("min_owned", String(state.transferFilters.minOwnership));
		}
		if (state.transferFilters.maxOwnership !== null) {
			params.set("max_owned", String(state.transferFilters.maxOwnership));
		}
	}
	if (
		state.tab !== "clubs" &&
		state.selectedElement !== DEFAULT_SELECTED_ELEMENT
	) {
		params.set("player", String(state.selectedElement));
		if (state.playerWindow !== DEFAULT_PLAYER_WINDOW) {
			params.set("player_window", String(state.playerWindow));
		}
		if (state.playerSeason !== null) {
			params.set("season", state.playerSeason);
		}
	}

	const search = params.toString();
	const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
	const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	if (nextUrl !== currentUrl) {
		window.history.replaceState(null, "", nextUrl);
	}
}

// Apply the client-side player and team filters so the chart and table stay
// in sync from a single source.
function filterPlayers<
	T extends { web_name: string; team_name: string | null },
>(rows: T[], playerSearch: string, teamFilter: string): T[] {
	const query = playerSearch.trim().toLowerCase();
	return rows.filter(
		(row) =>
			(query === "" || row.web_name.toLowerCase().includes(query)) &&
			(teamFilter === "" || row.team_name === teamFilter),
	);
}

function passesMax(value: number | null | undefined, max: number | null) {
	return max === null || (typeof value === "number" && value <= max);
}

function passesMin(value: number | null | undefined, min: number | null) {
	return min === null || (typeof value === "number" && value >= min);
}

// Transfer filters are hard candidate-pool constraints (price ceiling, minutes
// floor, ownership band), so they apply even when a player search is active,
// unlike the form-quality filters that the search box deliberately bypasses. A
// searched player outside these constraints is correctly not a candidate.
function filterTransferCandidates<T extends TransferFilterRow>(
	rows: T[],
	filters: TransferFilters,
): T[] {
	if (transferFiltersMatchDefault(filters)) {
		return rows;
	}
	return rows.filter(
		(row) =>
			passesMax(row.price, filters.maxPrice) &&
			passesMax(row.avg_fdr, filters.maxFdr) &&
			passesMin(
				typeof row.window_start_rate === "number"
					? row.window_start_rate * 100
					: row.window_start_rate,
				filters.minStartPct,
			) &&
			passesMin(row.window_mins_per_appearance, filters.minMinsPerAppearance) &&
			passesMin(row.current_ownership, filters.minOwnership) &&
			passesMax(row.current_ownership, filters.maxOwnership),
	);
}

function filterAttackingThreatCandidates(
	rows: FormPlayer[],
	filters: AttackingThreatFilters,
	visibleMetrics: AttackingMetricVisibility,
): FormPlayer[] {
	if (visibleAttackingThreatFiltersMatchDefault(filters, visibleMetrics)) {
		return rows;
	}
	return rows.filter((row) =>
		ATTACKING_METRICS.every((metric) => {
			if (!visibleMetrics[metric]) {
				return true;
			}
			return ATTACKING_THREAT_PERIODS.every((period) => {
				const value = row[ATTACKING_THREAT_FILTER_KEYS[metric][period]];
				return passesMin(
					typeof value === "number" ? value : null,
					filters[metric][period],
				);
			});
		}),
	);
}

function filterShortlistedPlayers<T extends { element: number }>(
	rows: T[],
	shortlist: number[],
	showShortlistedOnly: boolean,
): T[] {
	if (!showShortlistedOnly) {
		return rows;
	}
	const shortlistedElements = new Set(shortlist);
	return rows.filter((row) => shortlistedElements.has(row.element));
}

function formatPlayerCount(count: number): string {
	return `${count} ${count === 1 ? "player" : "players"}`;
}

type Range = { min: number; max: number };

// Metric columns that get heat shading. The range is computed league-wide from
// an unfiltered query so a player's colour stays fixed as you filter.
const FORM_HEAT_KEYS = [
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
	"window_xgi90_per_million",
	"season_points_per_million",
	"window_minutes",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
const DEFCON_HEAT_KEYS = [
	"window_minutes",
	"window_games",
	"window_defcon_hits",
	"window_defcon_hit_rate",
	"window_defcon",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
const DEFCON_PROB_HEAT_KEYS = [
	"window_minutes",
	"games",
	"hits",
	"raw_rate",
	"prob",
	"prob_std",
	"window_defcon",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
const CLUB_HEAT_KEYS = [
	"window_matches",
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
	"avg_fdr",
];

// Min/max per metric across the supplied (league-wide) rows.
function computeRanges(
	rows: readonly unknown[],
	keys: string[],
): Record<string, Range> {
	const ranges: Record<string, Range> = {};
	for (const key of keys) {
		const values = rows
			.map((row) => (row as Record<string, unknown>)[key])
			.filter((value): value is number => typeof value === "number");
		ranges[key] =
			values.length > 0
				? { min: Math.min(...values), max: Math.max(...values) }
				: { min: 0, max: 0 };
	}
	return ranges;
}

// Render the cell text; the table cell owns the background fill.
function HeatCell({
	value,
	text,
}: {
	value: number | null | undefined;
	text: string;
}) {
	if (value == null) {
		return <span className="text-zinc-400">-</span>;
	}
	return <span>{text}</span>;
}

// Shade a cell red (worst) to green (best) by its position in the league-wide
// range, so relative standing is readable at a glance.
function heatCellColour(
	value: number | null | undefined,
	range: Range,
	lowerIsBetter: boolean,
) {
	if (value == null) {
		return undefined;
	}
	const { min, max } = range;
	const t = max > min ? (value - min) / (max - min) : 0.5;
	const score = lowerIsBetter ? 1 - t : t;
	const hue = score * 120; // 0 = red (worst), 120 = green (best).
	return `hsl(${hue}, 68%, 80%)`;
}

// Build the text renderer for a heat-shaded cell.
function heatCell<T>(_range: Range, opts: HeatCellOptions = {}) {
	const format = opts.format ?? ((value: number | null) => fmtNum(value));
	return (info: CellContext<T, unknown>) => {
		const value = info.getValue<number | null>();
		return <HeatCell value={value} text={format(value)} />;
	};
}

function heatCellStyle<T>(
	range: Range,
	lowerIsBetter: boolean,
): (cell: Cell<T, unknown>) => { backgroundColor: string } | undefined {
	return (cell) => {
		const backgroundColor = heatCellColour(
			cell.getValue<number | null>(),
			range,
			lowerIsBetter,
		);
		return backgroundColor ? { backgroundColor } : undefined;
	};
}

function heatMeta<T>(
	meta: ColumnDef<T>["meta"],
	range: Range,
	opts: HeatCellOptions = {},
): ColumnDef<T>["meta"] {
	return {
		...meta,
		cellStyle: heatCellStyle<T>(range, opts.lowerIsBetter ?? false),
	};
}

function buildFormMetricColumns(
	ranges: Record<string, Range>,
	metric: AttackingMetric,
): ColumnDef<FormPlayer>[] {
	const label = ATTACKING_METRIC_LABELS[metric];
	const noun = ATTACKING_METRIC_NOUNS[metric];
	const styles = ATTACKING_METRIC_STYLES[metric];
	return (
		["window", "season", "delta", "value"] satisfies AttackingMetricColumn[]
	).map((group) => {
		const groupLabel = ATTACKING_METRIC_GROUP_LABELS[group];
		const key = ATTACKING_METRIC_KEYS[metric][group];
		const formatter = group === "delta" ? { format: fmtDelta } : {};
		const tooltip =
			group === "window"
				? `Expected ${noun} per 90 minutes over the recent window`
				: group === "season"
					? `Expected ${noun} per 90 minutes, season to date`
					: group === "delta"
						? `Window ${label} per 90 minus season ${label} per 90; positive means recent form beats the season baseline`
						: `Window ${label} per 90 divided by price`;
		const header =
			group === "value"
				? `${label} Per 90 Per £m`
				: `${groupLabel} ${label} Per 90`;
		return {
			accessorKey: key,
			header,
			cell: heatCell<FormPlayer>(ranges[key], formatter),
			meta: heatMeta<FormPlayer>(
				{
					tooltip,
					headerClassName: styles.header,
				},
				ranges[key],
				formatter,
			),
		} satisfies ColumnDef<FormPlayer>;
	});
}

function buildPlayerContextColumns<T extends TransferFilterRow>(
	ranges: Record<string, Range>,
): ColumnDef<T>[] {
	return [
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<T>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<T>(
				{
					tooltip:
						"Average fixture difficulty over the next 5 gameweeks; lower is easier",
				},
				ranges.avg_fdr,
				{ lowerIsBetter: true },
			),
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: heatCell<T>(ranges.current_ownership, {
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: heatMeta<T>(
				{
					tooltip:
						"Current ownership percentage; a live snapshot, not point-in-time",
				},
				ranges.current_ownership,
				{ lowerIsBetter: true },
			),
		},
	];
}

function buildFormColumns(
	ranges: Record<string, Range>,
	visibleMetrics: AttackingMetricVisibility,
): ColumnDef<FormPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<FormPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<FormPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Total minutes played across the window" },
				ranges.window_minutes,
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<FormPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<FormPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<FormPlayer>(ranges.window_start_rate, { format: fmtPct }),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Share of window games the player started" },
				ranges.window_start_rate,
			),
		},
		...ATTACKING_METRIC_COLUMN_ORDER.filter(
			(metric) => visibleMetrics[metric],
		).flatMap((metric) => buildFormMetricColumns(ranges, metric)),
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<FormPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

function buildDefconColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<DefconPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<DefconPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Total minutes played across the window" },
				ranges.window_minutes,
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Share of window games the player started" },
				ranges.window_start_rate,
			),
		},
		{
			accessorKey: "window_games",
			header: "Games",
			cell: heatCell<DefconPlayer>(ranges.window_games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Eligible games in the window" },
				ranges.window_games,
			),
		},
		{
			accessorKey: "window_defcon_hits",
			header: "Hits",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Window games clearing the DefCon threshold" },
				ranges.window_defcon_hits,
			),
		},
		{
			accessorKey: "window_defcon_hit_rate",
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hit_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Share of window games clearing the DefCon threshold" },
				ranges.window_defcon_hit_rate,
			),
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per game over the window",
				},
				ranges.window_defcon,
			),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

function buildDefconProbColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconProbabilityPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<DefconProbabilityPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Total minutes played across the recent window" },
				ranges.window_minutes,
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.window_mins_per_appearance,
				{ format: (v) => fmtNum(v, 0) },
			),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the recent window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Share of recent window games the player started" },
				ranges.window_start_rate,
			),
		},
		{
			accessorKey: "games",
			header: "Games",
			cell: heatCell<DefconProbabilityPlayer>(ranges.games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Eligible appearances up to this gameweek" },
				ranges.games,
			),
		},
		{
			accessorKey: "hits",
			header: "Hits",
			cell: heatCell<DefconProbabilityPlayer>(ranges.hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Appearances clearing the DefCon threshold" },
				ranges.hits,
			),
		},
		{
			accessorKey: "raw_rate",
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>(ranges.raw_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Observed DefCon hit rate (hits / games)" },
				ranges.raw_rate,
			),
		},
		{
			accessorKey: "prob",
			header: "P(Hit Next GW)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob, { format: fmtPct }),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Modelled probability of clearing the DefCon threshold next gameweek",
				},
				ranges.prob,
			),
		},
		{
			accessorKey: "prob_std",
			header: "+/-",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob_std, {
				lowerIsBetter: true,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Uncertainty (standard deviation) of the probability" },
				ranges.prob_std,
				{ lowerIsBetter: true },
			),
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per game over the recent window",
				},
				ranges.window_defcon,
			),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.season_points_per_million,
				{ format: (v) => fmtNum(v, 1) },
			),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

function buildClubColumns(
	ranges: Record<string, Range>,
	visibleActualMetrics: ClubActualMetricVisibility,
): ColumnDef<ClubForm>[] {
	return [
		{ accessorKey: "team_name", header: "Club" },
		{
			accessorKey: "window_matches",
			header: "Matches",
			cell: heatCell<ClubForm>(ranges.window_matches, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Club matches in the recent window" },
				ranges.window_matches,
			),
		},
		{
			accessorKey: "window_xg_per_match",
			header: "Window xG",
			cell: heatCell<ClubForm>(ranges.window_xg_per_match),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match over the recent window" },
				ranges.window_xg_per_match,
			),
		},
		{
			accessorKey: "season_xg_per_match",
			header: "Season xG",
			cell: heatCell<ClubForm>(ranges.season_xg_per_match),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match, season to date" },
				ranges.season_xg_per_match,
			),
		},
		{
			accessorKey: "delta_xg_per_match",
			header: "Delta xG",
			cell: heatCell<ClubForm>(ranges.delta_xg_per_match, {
				format: fmtDelta,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Window xG per match minus season xG per match; positive means the attack is creating more",
				},
				ranges.delta_xg_per_match,
			),
		},
		...(visibleActualMetrics.goals
			? [
					{
						accessorKey: "window_goals_for_per_match",
						header: "Window Goals",
						cell: heatCell<ClubForm>(ranges.window_goals_for_per_match),
						meta: heatMeta<ClubForm>(
							{
								tooltip: "Goals scored per match over the recent window",
							},
							ranges.window_goals_for_per_match,
						),
					},
					{
						accessorKey: "delta_goals_for_per_match",
						header: "Delta Goals",
						cell: heatCell<ClubForm>(ranges.delta_goals_for_per_match, {
							format: fmtDelta,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip:
									"Window goals per match minus season goals per match; useful context for finishing variance",
							},
							ranges.delta_goals_for_per_match,
						),
					},
				]
			: []),
		{
			accessorKey: "attack_form",
			header: "Attack Form",
			cell: heatCell<ClubForm>(ranges.attack_form, { format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip: "Recent xG per match improvement versus the season baseline",
				},
				ranges.attack_form,
			),
		},
		{
			accessorKey: "window_xgc_per_match",
			header: "Window xGC",
			cell: heatCell<ClubForm>(ranges.window_xgc_per_match, {
				lowerIsBetter: true,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip: "Expected goals conceded per match over the recent window",
				},
				ranges.window_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		{
			accessorKey: "season_xgc_per_match",
			header: "Season xGC",
			cell: heatCell<ClubForm>(ranges.season_xgc_per_match, {
				lowerIsBetter: true,
			}),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals conceded per match, season to date" },
				ranges.season_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		{
			accessorKey: "delta_xgc_per_match",
			header: "Delta xGC",
			cell: heatCell<ClubForm>(ranges.delta_xgc_per_match, {
				lowerIsBetter: true,
				format: fmtDelta,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Window xGC per match minus season xGC per match; negative means the defence is allowing less",
				},
				ranges.delta_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		...(visibleActualMetrics.ga
			? [
					{
						accessorKey: "window_goals_against_per_match",
						header: "Window Goals Conceded",
						cell: heatCell<ClubForm>(ranges.window_goals_against_per_match, {
							lowerIsBetter: true,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip: "Goals conceded per match over the recent window",
							},
							ranges.window_goals_against_per_match,
							{ lowerIsBetter: true },
						),
					},
					{
						accessorKey: "delta_goals_against_per_match",
						header: "Delta Goals Conceded",
						cell: heatCell<ClubForm>(ranges.delta_goals_against_per_match, {
							lowerIsBetter: true,
							format: fmtDelta,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip:
									"Window goals conceded per match minus season goals conceded per match",
							},
							ranges.delta_goals_against_per_match,
							{ lowerIsBetter: true },
						),
					},
				]
			: []),
		{
			accessorKey: "defence_form",
			header: "Defence Form",
			cell: heatCell<ClubForm>(ranges.defence_form, { format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Recent xGC per match improvement versus the season baseline; positive is better",
				},
				ranges.defence_form,
			),
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<ClubForm>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Average fixture difficulty over the next 5 gameweeks; lower is easier",
				},
				ranges.avg_fdr,
				{ lowerIsBetter: true },
			),
		},
	];
}

const labelClass = "flex flex-col text-xs font-medium text-zinc-600";
const fieldClass =
	"rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900";
// Most controls sit below a label, so the shared input class adds the gap.
const inputClass = `mt-1 ${fieldClass}`;
const transferInputClass = `${inputClass} w-[5.5rem]`;

// Keep the window within bounds and tolerate an empty/NaN number input.
function clampWindowSize(value: number): number {
	if (!Number.isFinite(value)) {
		return WINDOW_MIN;
	}
	return Math.min(Math.max(value, WINDOW_MIN), WINDOW_MAX);
}

// Clamp to the same bounds the URL parser enforces, so a typed value always
// round-trips through the query string instead of silently vanishing on reload.
function parseOptionalInputNumber(
	value: string,
	{ min, max }: { min?: number; max?: number } = {},
): number | null {
	if (value === "") {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	if (min !== undefined && parsed < min) {
		return min;
	}
	if (max !== undefined && parsed > max) {
		return max;
	}
	return parsed;
}

export default function App() {
	const initialUrlState = useMemo(() => readUrlState(), []);
	const [tab, setTab] = useState<Tab>(initialUrlState.tab);
	const [playerSearch, setPlayerSearch] = useState(
		initialUrlState.playerSearch,
	);
	const [teamFilter, setTeamFilter] = useState(initialUrlState.teamFilter);
	const [windowSize, setWindowSize] = useState(initialUrlState.windowSize);
	const [position, setPosition] = useState<Position | "">(
		initialUrlState.position,
	);
	const [minMinutes, setMinMinutes] = useState(initialUrlState.minMinutes);
	const [minHitRate, setMinHitRate] = useState(initialUrlState.minHitRate);
	const [minGames, setMinGames] = useState(initialUrlState.minGames);
	const [asOfGw, setAsOfGw] = useState<number | null>(initialUrlState.asOfGw);
	const [selectedElement, setSelectedElement] = useState<number | null>(
		initialUrlState.selectedElement,
	);
	const [playerWindow, setPlayerWindow] = useState(
		initialUrlState.playerWindow,
	);
	const [playerSeason, setPlayerSeason] = useState<string | null>(
		initialUrlState.playerSeason,
	);
	const [attackingMetrics, setAttackingMetrics] =
		useState<AttackingMetricVisibility>(initialUrlState.attackingMetrics);
	const [attackingThreatFilters, setAttackingThreatFilters] =
		useState<AttackingThreatFilters>(initialUrlState.attackingThreatFilters);
	const [clubActualMetrics, setClubActualMetrics] =
		useState<ClubActualMetricVisibility>(initialUrlState.clubActualMetrics);
	const [transferFilters, setTransferFilters] = useState<TransferFilters>(
		initialUrlState.transferFilters,
	);
	const [shortlist, setShortlist] = useState<number[]>(
		initialUrlState.shortlist,
	);
	const [showShortlistedOnly, setShowShortlistedOnly] = useState(
		initialUrlState.showShortlistedOnly,
	);

	useEffect(() => {
		function applyCurrentUrlState() {
			const next = readUrlState();
			setTab(next.tab);
			setPlayerSearch(next.playerSearch);
			setTeamFilter(next.teamFilter);
			setWindowSize(next.windowSize);
			setPosition(next.position);
			setMinMinutes(next.minMinutes);
			setMinHitRate(next.minHitRate);
			setMinGames(next.minGames);
			setAsOfGw(next.asOfGw);
			setSelectedElement(next.selectedElement);
			setPlayerWindow(next.playerWindow);
			setPlayerSeason(next.playerSeason);
			setAttackingMetrics(next.attackingMetrics);
			setAttackingThreatFilters(next.attackingThreatFilters);
			setClubActualMetrics(next.clubActualMetrics);
			setTransferFilters(next.transferFilters);
			setShortlist(next.shortlist);
			setShowShortlistedOnly(next.showShortlistedOnly);
		}

		window.addEventListener("popstate", applyCurrentUrlState);
		return () => window.removeEventListener("popstate", applyCurrentUrlState);
	}, []);

	useEffect(() => {
		writeUrlState({
			tab,
			playerSearch,
			teamFilter,
			windowSize,
			position,
			minMinutes,
			minHitRate,
			minGames,
			asOfGw,
			selectedElement,
			playerWindow,
			playerSeason,
			attackingMetrics,
			attackingThreatFilters,
			clubActualMetrics,
			transferFilters,
			shortlist,
			showShortlistedOnly,
		});
	}, [
		tab,
		playerSearch,
		teamFilter,
		windowSize,
		position,
		minMinutes,
		minHitRate,
		minGames,
		asOfGw,
		selectedElement,
		playerWindow,
		playerSeason,
		attackingMetrics,
		attackingThreatFilters,
		clubActualMetrics,
		transferFilters,
		shortlist,
		showShortlistedOnly,
	]);

	useEffect(() => {
		if (shortlist.length === 0 && showShortlistedOnly) {
			setShowShortlistedOnly(false);
		}
	}, [shortlist.length, showShortlistedOnly]);

	function updateTransferFilter(
		filter: keyof TransferFilters,
		value: number | null,
	) {
		setTransferFilters((current) => ({ ...current, [filter]: value }));
	}

	function resetTransferFilters() {
		setMinMinutes(DEFAULT_MIN_MINUTES);
		setTransferFilters(defaultTransferFilters());
	}

	function updateAttackingThreatFilter(
		metric: AttackingMetric,
		period: AttackingThreatPeriod,
		value: number | null,
	) {
		setAttackingThreatFilters((current) => ({
			...current,
			[metric]: { ...current[metric], [period]: value },
		}));
	}

	function resetAttackingThreatFilters() {
		setAttackingThreatFilters(defaultAttackingThreatFilters());
	}

	function clearActiveFilters() {
		setPlayerSearch(DEFAULT_PLAYER_SEARCH);
		setTeamFilter(DEFAULT_TEAM_FILTER);
		setWindowSize(DEFAULT_WINDOW_SIZE);
		setPosition(DEFAULT_POSITION);
		setMinMinutes(DEFAULT_MIN_MINUTES);
		setMinHitRate(DEFAULT_MIN_HIT_RATE);
		setMinGames(DEFAULT_MIN_GAMES);
		setAsOfGw(DEFAULT_AS_OF_GW);
		setAttackingMetrics({ ...DEFAULT_ATTACKING_METRICS });
		setAttackingThreatFilters(defaultAttackingThreatFilters());
		setClubActualMetrics({ ...DEFAULT_CLUB_ACTUAL_METRICS });
		setTransferFilters(defaultTransferFilters());
		setShowShortlistedOnly(false);
	}

	function applyFilterPreset(preset: FilterPreset) {
		setTab("form");
		setAttackingMetrics({ ...DEFAULT_ATTACKING_METRICS });
		setAttackingThreatFilters((current) => {
			const next = defaultAttackingThreatFilters();
			if (preset === "value") {
				next.xgi = { window: 0.35, season: 0.25 };
			} else if (preset === "differential") {
				next.xgi = { ...current.xgi, window: 0.3 };
			} else if (preset === "fixture") {
				next.xgi = { ...current.xgi, window: 0.25 };
			}
			return next;
		});
		setTransferFilters((current) => {
			if (preset === "nailed") {
				return {
					...current,
					minMinsPerAppearance: 70,
					minStartPct: 80,
				};
			}
			if (preset === "value") {
				return {
					...current,
					maxPrice: 7.5,
				};
			}
			if (preset === "differential") {
				return {
					...current,
					maxOwnership: 10,
				};
			}
			return {
				...current,
				maxFdr: 3,
			};
		});
		if (preset === "nailed") {
			setMinMinutes(270);
		}
	}

	function openPlayerDetail(element: number) {
		setSelectedElement(element);
		setPlayerWindow(DEFAULT_PLAYER_WINDOW);
		setPlayerSeason(DEFAULT_PLAYER_SEASON);
	}

	function toggleShortlist(element: number) {
		setShortlist((current) =>
			current.includes(element)
				? current.filter((value) => value !== element)
				: [...current, element],
		);
	}

	function toggleAttackingMetric(metric: AttackingMetric) {
		setAttackingMetrics((current) => {
			const enabledCount = Object.values(current).filter(Boolean).length;
			if (current[metric] && enabledCount === 1) {
				return current;
			}
			return { ...current, [metric]: !current[metric] };
		});
	}

	function toggleClubActualMetric(metric: ClubActualMetric) {
		setClubActualMetrics((current) => ({
			...current,
			[metric]: !current[metric],
		}));
	}

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const latestGw = meta.data?.latest_gw ?? 38;
	const hasPlayerSearch = playerSearch.trim() !== "";
	const windowFillPct =
		((windowSize - WINDOW_MIN) / (WINDOW_MAX - WINDOW_MIN)) * 100;

	const base = { window: windowSize, position, minMinutes, asOfGw };
	const formQuery = useQuery({
		queryKey: ["form", windowSize, position, minMinutes, asOfGw],
		queryFn: () =>
			fetchForm({
				...base,
				minDelta: FORM_MIN_DELTA_FLOOR,
			}),
		enabled: tab === "form",
		placeholderData: keepPreviousData,
	});
	const defconQuery = useQuery({
		queryKey: [
			"defcon",
			windowSize,
			position,
			minMinutes,
			minHitRate,
			asOfGw,
			hasPlayerSearch,
		],
		queryFn: () =>
			fetchDefcon({ ...base, minHitRate: hasPlayerSearch ? 0 : minHitRate }),
		enabled: tab === "defcon",
		placeholderData: keepPreviousData,
	});
	const defconProbQuery = useQuery({
		queryKey: ["defconProb", position, minGames, asOfGw, hasPlayerSearch],
		queryFn: () =>
			fetchDefconProbability({
				position,
				minGames: hasPlayerSearch ? 0 : minGames,
				asOfGw,
			}),
		enabled: tab === "defconProb",
		placeholderData: keepPreviousData,
	});
	const clubQuery = useQuery({
		queryKey: ["clubs", windowSize, asOfGw],
		queryFn: () => fetchClubForm({ window: windowSize, asOfGw }),
		enabled: tab === "clubs",
		placeholderData: keepPreviousData,
	});

	// League-wide queries (no position/delta/hit-rate filter) feed the heat-map
	// colour scale, so a player's colour is fixed regardless of the active filters.
	const formBaseline = useQuery({
		queryKey: ["formBaseline", windowSize, minMinutes, asOfGw],
		queryFn: () =>
			fetchForm({
				window: windowSize,
				position: "",
				minMinutes,
				minDelta: FORM_MIN_DELTA_FLOOR,
				asOfGw,
			}),
		enabled: tab === "form",
		placeholderData: keepPreviousData,
	});
	const defconBaseline = useQuery({
		queryKey: ["defconBaseline", windowSize, minMinutes, asOfGw],
		queryFn: () =>
			fetchDefcon({
				window: windowSize,
				position: "",
				minMinutes,
				minHitRate: 0,
				asOfGw,
			}),
		enabled: tab === "defcon",
		placeholderData: keepPreviousData,
	});
	const defconProbBaseline = useQuery({
		queryKey: ["defconProbBaseline", asOfGw],
		queryFn: () =>
			fetchDefconProbability({ position: "", minGames: 0, asOfGw }),
		enabled: tab === "defconProb",
		placeholderData: keepPreviousData,
	});
	const clubBaseline = useQuery({
		queryKey: ["clubBaseline", windowSize, asOfGw],
		queryFn: () => fetchClubForm({ window: windowSize, asOfGw }),
		enabled: tab === "clubs",
		placeholderData: keepPreviousData,
	});

	const formColumns = useMemo(
		() =>
			buildFormColumns(
				computeRanges(formBaseline.data ?? [], FORM_HEAT_KEYS),
				attackingMetrics,
			),
		[formBaseline.data, attackingMetrics],
	);
	const defconColumns = useMemo(
		() =>
			buildDefconColumns(
				computeRanges(defconBaseline.data ?? [], DEFCON_HEAT_KEYS),
			),
		[defconBaseline.data],
	);
	const defconProbColumns = useMemo(
		() =>
			buildDefconProbColumns(
				computeRanges(defconProbBaseline.data ?? [], DEFCON_PROB_HEAT_KEYS),
			),
		[defconProbBaseline.data],
	);
	const clubColumns = useMemo(
		() =>
			buildClubColumns(
				computeRanges(clubBaseline.data ?? [], CLUB_HEAT_KEYS),
				clubActualMetrics,
			),
		[clubBaseline.data, clubActualMetrics],
	);

	const active =
		tab === "form"
			? formQuery
			: tab === "defcon"
				? defconQuery
				: tab === "defconProb"
					? defconProbQuery
					: clubQuery;

	// Team dropdown options derived from the loaded players, independent of the
	// client-side player/team filters so the list stays stable.
	const teamOptions = useMemo(() => {
		const rows = (active.data ?? []) as Array<{ team_name: string | null }>;
		const names = rows
			.map((row) => row.team_name)
			.filter((name): name is string => name !== null);
		return Array.from(new Set(names)).sort();
	}, [active.data]);

	const filteredForm = filterPlayers(
		formQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredTransferForm = filterTransferCandidates(
		filteredForm,
		transferFilters,
	);
	const filteredThreatForm = filterAttackingThreatCandidates(
		filteredTransferForm,
		attackingThreatFilters,
		attackingMetrics,
	);
	const visibleFormRows = filterShortlistedPlayers(
		filteredThreatForm,
		shortlist,
		showShortlistedOnly,
	);
	const filteredDefcon = filterPlayers(
		defconQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredTransferDefcon = filterTransferCandidates(
		filteredDefcon,
		transferFilters,
	);
	const visibleDefconRows = filterShortlistedPlayers(
		filteredTransferDefcon,
		shortlist,
		showShortlistedOnly,
	);
	const filteredDefconProb = filterPlayers(
		defconProbQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredTransferDefconProb = filterTransferCandidates(
		filteredDefconProb,
		transferFilters,
	);
	const visibleDefconProbRows = filterShortlistedPlayers(
		filteredTransferDefconProb,
		shortlist,
		showShortlistedOnly,
	);
	const filteredClubs = (clubQuery.data ?? []).filter(
		(row) => teamFilter === "" || row.team_name === teamFilter,
	);
	const enabledAttackingMetricCount =
		Object.values(attackingMetrics).filter(Boolean).length;
	const showTransferFilters = tab !== "clubs";
	const isShortlistViewActive =
		tab !== "clubs" && showShortlistedOnly && shortlist.length > 0;
	const hasActiveTransferFilters =
		tab !== "clubs" &&
		(minMinutes !== DEFAULT_MIN_MINUTES ||
			!transferFiltersMatchDefault(transferFilters));
	const hasActiveAttackingThreatFilters =
		tab === "form" &&
		!visibleAttackingThreatFiltersMatchDefault(
			attackingThreatFilters,
			attackingMetrics,
		);
	const hasActiveClubActualMetrics =
		tab === "clubs" && !clubActualMetricsMatchDefault(clubActualMetrics);
	const visiblePlayerRowCount =
		tab === "form"
			? visibleFormRows.length
			: tab === "defcon"
				? visibleDefconRows.length
				: tab === "defconProb"
					? visibleDefconProbRows.length
					: 0;
	const shortlistSummary =
		visiblePlayerRowCount === shortlist.length
			? `Showing ${visiblePlayerRowCount} shortlisted ${visiblePlayerRowCount === 1 ? "player" : "players"}`
			: `Showing ${visiblePlayerRowCount} of ${formatPlayerCount(shortlist.length)} shortlisted`;
	const shortlistRowClassName = (row: ShortlistablePlayer) =>
		shortlist.includes(row.element) ? "bg-amber-50/50" : "";
	const shortlistStickyClassName = (row: ShortlistablePlayer) =>
		shortlist.includes(row.element)
			? "bg-amber-50 group-hover:bg-amber-100/70"
			: "bg-white group-hover:bg-zinc-50";
	const renderShortlistAction = (row: ShortlistablePlayer) => {
		const isShortlisted = shortlist.includes(row.element);
		return (
			<button
				type="button"
				aria-pressed={isShortlisted}
				aria-label={
					isShortlisted
						? `Remove ${row.web_name} from shortlist`
						: `Add ${row.web_name} to shortlist`
				}
				title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
				className={`flex h-7 w-7 items-center justify-center rounded-md border text-base leading-none ${
					isShortlisted
						? "border-amber-300 bg-amber-100 text-amber-700"
						: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
				}`}
				onClick={(event) => {
					event.stopPropagation();
					toggleShortlist(row.element);
				}}
			>
				<span aria-hidden="true">{isShortlisted ? "\u2605" : "\u2606"}</span>
			</button>
		);
	};
	const activeFilterChips: ActiveFilterChip[] = [];

	if (tab !== "clubs" && playerSearch.trim() !== "") {
		activeFilterChips.push({
			id: "player",
			label: `Player ${playerSearch.trim()}`,
			onClear: () => setPlayerSearch(DEFAULT_PLAYER_SEARCH),
		});
	}
	if (tab !== "clubs" && position !== DEFAULT_POSITION) {
		activeFilterChips.push({
			id: "position",
			label: `Position ${position}`,
			onClear: () => setPosition(DEFAULT_POSITION),
		});
	}
	if (teamFilter !== DEFAULT_TEAM_FILTER) {
		activeFilterChips.push({
			id: "team",
			label: `Team ${teamFilter}`,
			onClear: () => setTeamFilter(DEFAULT_TEAM_FILTER),
		});
	}
	if (tab !== "defconProb" && windowSize !== DEFAULT_WINDOW_SIZE) {
		activeFilterChips.push({
			id: "window",
			label: `Window ${windowSize}`,
			onClear: () => setWindowSize(DEFAULT_WINDOW_SIZE),
		});
	}
	if (
		tab !== "clubs" &&
		tab !== "defconProb" &&
		minMinutes !== DEFAULT_MIN_MINUTES
	) {
		activeFilterChips.push({
			id: "min-minutes",
			label: `Minutes >= ${minMinutes}`,
			onClear: () => setMinMinutes(DEFAULT_MIN_MINUTES),
		});
	}
	if (tab === "defcon" && minHitRate !== DEFAULT_MIN_HIT_RATE) {
		activeFilterChips.push({
			id: "min-hit-rate",
			label: `Hit Rate >= ${Math.round(minHitRate * 100)}%`,
			onClear: () => setMinHitRate(DEFAULT_MIN_HIT_RATE),
		});
	}
	if (tab === "defconProb" && minGames !== DEFAULT_MIN_GAMES) {
		activeFilterChips.push({
			id: "min-games",
			label: `Games >= ${minGames}`,
			onClear: () => setMinGames(DEFAULT_MIN_GAMES),
		});
	}
	if (asOfGw !== DEFAULT_AS_OF_GW) {
		activeFilterChips.push({
			id: "as-of-gw",
			label: `As Of GW ${asOfGw}`,
			onClear: () => setAsOfGw(DEFAULT_AS_OF_GW),
		});
	}
	if (tab === "form" && !metricsMatchDefault(attackingMetrics)) {
		activeFilterChips.push({
			id: "metrics",
			label: `Metrics ${ATTACKING_METRIC_COLUMN_ORDER.filter(
				(metric) => attackingMetrics[metric],
			)
				.map((metric) => ATTACKING_METRIC_LABELS[metric])
				.join(", ")}`,
			onClear: () => setAttackingMetrics({ ...DEFAULT_ATTACKING_METRICS }),
		});
	}
	if (tab === "form") {
		for (const metric of ATTACKING_METRIC_COLUMN_ORDER) {
			if (!attackingMetrics[metric]) {
				continue;
			}
			for (const period of ATTACKING_THREAT_PERIODS) {
				const value = attackingThreatFilters[metric][period];
				if (value !== null) {
					activeFilterChips.push({
						id: `${metric}-${period}`,
						label: `Min ${ATTACKING_THREAT_PERIOD_LABELS[period]} ${ATTACKING_METRIC_LABELS[metric]}/90 >= ${fmtNum(value)}`,
						onClear: () => updateAttackingThreatFilter(metric, period, null),
					});
				}
			}
		}
	}
	if (tab !== "clubs") {
		if (transferFilters.maxPrice !== null) {
			activeFilterChips.push({
				id: "max-price",
				label: `Price <= ${fmtPrice(transferFilters.maxPrice)}`,
				onClear: () => updateTransferFilter("maxPrice", null),
			});
		}
		if (transferFilters.maxFdr !== null) {
			activeFilterChips.push({
				id: "max-fdr",
				label: `FDR <= ${fmtNum(transferFilters.maxFdr, 1)}`,
				onClear: () => updateTransferFilter("maxFdr", null),
			});
		}
		if (transferFilters.minMinsPerAppearance !== null) {
			activeFilterChips.push({
				id: "min-mins-app",
				label: `Mins/App >= ${fmtNum(transferFilters.minMinsPerAppearance, 0)}`,
				onClear: () => updateTransferFilter("minMinsPerAppearance", null),
			});
		}
		if (transferFilters.minStartPct !== null) {
			activeFilterChips.push({
				id: "min-start",
				label: `Start >= ${fmtPctPoints(transferFilters.minStartPct, 0)}`,
				onClear: () => updateTransferFilter("minStartPct", null),
			});
		}
		if (transferFilters.minOwnership !== null) {
			activeFilterChips.push({
				id: "min-owned",
				label: `Owned >= ${fmtPctPoints(transferFilters.minOwnership, 0)}`,
				onClear: () => updateTransferFilter("minOwnership", null),
			});
		}
		if (transferFilters.maxOwnership !== null) {
			activeFilterChips.push({
				id: "max-owned",
				label: `Owned <= ${fmtPctPoints(transferFilters.maxOwnership, 0)}`,
				onClear: () => updateTransferFilter("maxOwnership", null),
			});
		}
	}
	if (hasActiveClubActualMetrics) {
		activeFilterChips.push({
			id: "club-actuals",
			label: `Actuals ${CLUB_ACTUAL_METRICS.filter(
				(metric) => clubActualMetrics[metric],
			)
				.map((metric) => CLUB_ACTUAL_METRIC_LABELS[metric])
				.join(", ")}`,
			onClear: () => setClubActualMetrics({ ...DEFAULT_CLUB_ACTUAL_METRICS }),
		});
	}
	if (isShortlistViewActive) {
		activeFilterChips.push({
			id: "shortlisted-only",
			label: "Shortlisted Only",
			onClear: () => setShowShortlistedOnly(false),
		});
	}

	const hasActiveFilters = activeFilterChips.length > 0;
	const clearActiveFiltersButton = hasActiveFilters ? (
		<button
			type="button"
			className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-medium text-xs text-zinc-700 hover:bg-zinc-50"
			onClick={clearActiveFilters}
		>
			Clear Active Filters
		</button>
	) : null;
	const playerEmptyTitle = hasActiveFilters
		? "No Players Match These Filters"
		: "No Players Available";
	const playerEmptyDescription = hasActiveFilters
		? "Try clearing active filters or lowering the strongest thresholds"
		: undefined;
	const clubEmptyTitle = hasActiveFilters
		? "No Clubs Match These Filters"
		: "No Clubs Available";

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<div className="app-shell mx-auto px-6 py-8">
				<header className="mb-6">
					<h1 className="font-semibold text-2xl">FPL Form Scout</h1>
					<p className="mt-1 max-w-3xl text-sm text-zinc-500">
						Surfaces players whose recent underlying output – expected goal
						involvement and DefCon hit rate over your chosen window – is
						outpacing their season-to-date baseline, alongside clubs whose
						attack or defence has shifted against its season baseline. Figures
						are point-in-time as of GW {asOfGw ?? latestGw}: only matches up to
						and including that gameweek are counted, with no look-ahead.
					</p>
				</header>

				<div className="mb-4 flex gap-2">
					{TABS.map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setTab(value)}
							className={`rounded-md px-3 py-1.5 font-medium text-sm ${
								tab === value
									? "bg-zinc-900 text-white"
									: "bg-white text-zinc-700 ring-1 ring-zinc-200"
							}`}
						>
							{TAB_LABELS[value]}
						</button>
					))}
				</div>

				<div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
					<div className="flex flex-wrap items-start gap-4">
						{tab !== "clubs" && (
							<>
								<label className={labelClass}>
									Player
									<input
										type="search"
										placeholder="e.g. Saka"
										className={`${inputClass} w-40`}
										value={playerSearch}
										onChange={(e) => setPlayerSearch(e.target.value)}
									/>
								</label>

								<label className={labelClass}>
									Position
									<select
										className={inputClass}
										value={position}
										onChange={(e) =>
											setPosition(e.target.value as Position | "")
										}
									>
										<option value="">All</option>
										{POSITIONS.map((p) => (
											<option key={p} value={p}>
												{p}
											</option>
										))}
									</select>
								</label>
							</>
						)}

						<label className={labelClass}>
							Team
							<select
								className={inputClass}
								value={teamFilter}
								onChange={(e) => setTeamFilter(e.target.value)}
							>
								<option value="">All</option>
								{teamOptions.map((team) => (
									<option key={team} value={team}>
										{team}
									</option>
								))}
							</select>
						</label>

						{tab === "clubs" && (
							<div className={labelClass}>
								<span>Actual Metrics (Non-Expected)</span>
								<div className="mt-1 flex h-[34px] items-center gap-4">
									{CLUB_ACTUAL_METRICS.map((metric) => (
										<label
											key={metric}
											className="flex items-center gap-1 text-xs text-zinc-900"
										>
											<input
												type="checkbox"
												className="accent-blue-600"
												checked={clubActualMetrics[metric]}
												onChange={() => toggleClubActualMetric(metric)}
											/>
											{CLUB_ACTUAL_METRIC_LABELS[metric]}
										</label>
									))}
								</div>
							</div>
						)}

						{tab === "form" && (
							<div className={labelClass}>
								<span>Metrics</span>
								<div className="mt-1 flex h-[34px] items-center gap-4">
									{ATTACKING_METRICS.map((metric) => (
										<label
											key={metric}
											className="flex items-center gap-1 text-xs text-zinc-900"
										>
											<input
												type="checkbox"
												className="accent-blue-600"
												checked={attackingMetrics[metric]}
												disabled={
													attackingMetrics[metric] &&
													enabledAttackingMetricCount === 1
												}
												onChange={() => toggleAttackingMetric(metric)}
											/>
											{ATTACKING_METRIC_LABELS[metric]}
										</label>
									))}
								</div>
							</div>
						)}

						{tab === "defcon" && (
							<label className={labelClass}>
								Min Hit Rate
								<select
									className={inputClass}
									value={minHitRate}
									onChange={(e) => setMinHitRate(Number(e.target.value))}
								>
									{HIT_RATES.map((rate) => (
										<option key={rate} value={rate}>
											{Math.round(rate * 100)}%
										</option>
									))}
								</select>
							</label>
						)}

						{tab === "defconProb" && (
							<label className={labelClass}>
								Min Games
								<input
									type="number"
									min={0}
									className={`${inputClass} w-24`}
									value={minGames}
									onChange={(e) => setMinGames(Number(e.target.value))}
								/>
							</label>
						)}

						{tab !== "defconProb" && (
							<label htmlFor="window-size" className={labelClass}>
								Window (Games)
								<span className="mt-1 flex items-center gap-2">
									<input
										id="window-size"
										type="range"
										min={WINDOW_MIN}
										max={WINDOW_MAX}
										step={1}
										value={windowSize}
										onChange={(e) =>
											setWindowSize(clampWindowSize(Number(e.target.value)))
										}
										className="range-slider w-32"
										style={{
											background: `linear-gradient(to right, #18181b 0%, #18181b ${windowFillPct}%, #e4e4e7 ${windowFillPct}%, #e4e4e7 100%)`,
										}}
									/>
									<input
										type="number"
										min={WINDOW_MIN}
										max={WINDOW_MAX}
										step={1}
										aria-label="Window size in games"
										className={`${fieldClass} w-14`}
										value={windowSize}
										onChange={(e) =>
											setWindowSize(clampWindowSize(Number(e.target.value)))
										}
									/>
								</span>
							</label>
						)}

						<div className={labelClass}>
							<span className="flex items-center gap-1">
								<label htmlFor="as-of-gw">As Of GW</label>
								<InfoTooltip text="Evaluate form as of this gameweek. Only matches up to and including it are counted, so there is no look-ahead. Current ownership is excluded - it is always the present-day snapshot." />
							</span>
							<select
								id="as-of-gw"
								className={inputClass}
								value={asOfGw ?? ""}
								onChange={(e) =>
									setAsOfGw(
										e.target.value === "" ? null : Number(e.target.value),
									)
								}
							>
								<option value="">Latest ({latestGw})</option>
								{Array.from({ length: latestGw }, (_, i) => latestGw - i).map(
									(gw) => (
										<option key={gw} value={gw}>
											{gw}
										</option>
									),
								)}
							</select>
						</div>
					</div>
					{tab === "form" ? (
						<div className="mt-4 border-zinc-100 border-t pt-4">
							<div className="mb-2 font-medium text-xs text-zinc-600">
								Filter Presets
							</div>
							<div className="flex flex-wrap gap-2">
								{FILTER_PRESETS.map((preset) => (
									<button
										key={preset.id}
										type="button"
										className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-medium text-sm text-zinc-700 hover:border-zinc-300 hover:bg-white"
										onClick={() => applyFilterPreset(preset.id)}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
					) : null}
					{tab === "form" || showTransferFilters ? (
						<div className="mt-4 grid gap-6 border-zinc-100 border-t pt-4 xl:grid-cols-[auto_1fr]">
							{tab === "form" ? (
								<fieldset className="min-w-0 border-0 p-0">
									<legend className="sr-only">Attacking Threat Filters</legend>
									<div className="mb-2 flex items-center gap-2">
										<span className="font-medium text-xs text-zinc-600">
											Attacking Threat Filters
										</span>
										{hasActiveAttackingThreatFilters ? (
											<button
												type="button"
												className="rounded px-2 py-0.5 font-medium text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
												onClick={resetAttackingThreatFilters}
											>
												Reset Threat Filters
											</button>
										) : null}
									</div>
									<div className="flex flex-wrap items-start gap-x-2 gap-y-3">
										{ATTACKING_METRIC_COLUMN_ORDER.filter(
											(metric) => attackingMetrics[metric],
										).flatMap((metric) =>
											ATTACKING_THREAT_PERIODS.map((period) => (
												<label
													key={`${metric}-${period}`}
													className={labelClass}
												>
													{`Min ${ATTACKING_THREAT_PERIOD_LABELS[period]} ${ATTACKING_METRIC_LABELS[metric]}/90`}
													<input
														type="number"
														min={0}
														step={0.05}
														placeholder="Any"
														className={`${inputClass} w-28`}
														value={attackingThreatFilters[metric][period] ?? ""}
														onChange={(e) =>
															updateAttackingThreatFilter(
																metric,
																period,
																parseOptionalInputNumber(e.target.value, {
																	min: 0,
																}),
															)
														}
													/>
												</label>
											)),
										)}
									</div>
								</fieldset>
							) : null}
							{showTransferFilters ? (
								<fieldset className="min-w-0 border-0 p-0">
									<legend className="sr-only">Transfer Filters</legend>
									<div className="mb-2 flex items-center gap-2">
										<span className="font-medium text-xs text-zinc-600">
											Transfer Filters
										</span>
										{hasActiveTransferFilters ? (
											<button
												type="button"
												className="rounded px-2 py-0.5 font-medium text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
												onClick={resetTransferFilters}
											>
												Reset Transfer Filters
											</button>
										) : null}
									</div>
									<div className="flex flex-wrap items-start gap-x-2 gap-y-3">
										<label className={labelClass}>
											Max Price
											<input
												type="number"
												min={0}
												step={0.1}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.maxPrice ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"maxPrice",
														parseOptionalInputNumber(e.target.value, {
															min: 0,
														}),
													)
												}
											/>
										</label>

										<label className={labelClass}>
											Max FDR
											<input
												type="number"
												min={1}
												max={5}
												step={0.1}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.maxFdr ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"maxFdr",
														parseOptionalInputNumber(e.target.value, {
															min: 1,
															max: 5,
														}),
													)
												}
											/>
										</label>

										{tab !== "defconProb" && (
											<label className={labelClass}>
												Min Minutes
												<input
													type="number"
													min={0}
													className={transferInputClass}
													value={minMinutes}
													onChange={(e) =>
														setMinMinutes(Number(e.target.value))
													}
												/>
											</label>
										)}

										<label className={labelClass}>
											Min Mins/App
											<input
												type="number"
												min={0}
												step={1}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.minMinsPerAppearance ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"minMinsPerAppearance",
														parseOptionalInputNumber(e.target.value, {
															min: 0,
														}),
													)
												}
											/>
										</label>

										<label className={labelClass}>
											Min Start %
											<input
												type="number"
												min={0}
												max={100}
												step={5}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.minStartPct ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"minStartPct",
														parseOptionalInputNumber(e.target.value, {
															min: 0,
															max: 100,
														}),
													)
												}
											/>
										</label>

										<label className={labelClass}>
											Min Owned %
											<input
												type="number"
												min={0}
												step={1}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.minOwnership ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"minOwnership",
														parseOptionalInputNumber(e.target.value, {
															min: 0,
														}),
													)
												}
											/>
										</label>

										<label className={labelClass}>
											Max Owned %
											<input
												type="number"
												min={0}
												step={1}
												placeholder="Any"
												className={transferInputClass}
												value={transferFilters.maxOwnership ?? ""}
												onChange={(e) =>
													updateTransferFilter(
														"maxOwnership",
														parseOptionalInputNumber(e.target.value, {
															min: 0,
														}),
													)
												}
											/>
										</label>
									</div>
								</fieldset>
							) : null}
						</div>
					) : null}
				</div>

				{hasActiveFilters ? (
					<div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
						<span className="mr-1 font-medium text-xs text-zinc-500">
							Active Filters
						</span>
						{activeFilterChips.map((chip) => (
							<button
								key={chip.id}
								type="button"
								className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-xs text-zinc-700 hover:border-zinc-300 hover:bg-white"
								onClick={chip.onClear}
							>
								<span>{chip.label}</span>
								<span aria-hidden="true" className="text-zinc-400">
									x
								</span>
								<span className="sr-only">Clear {chip.label}</span>
							</button>
						))}
						<div className="ml-auto">{clearActiveFiltersButton}</div>
					</div>
				) : null}

				{tab !== "clubs" ? (
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-white p-0.5">
							<legend className="sr-only">Player View</legend>
							<button
								type="button"
								aria-pressed={!isShortlistViewActive}
								className={`rounded px-3 py-1.5 font-medium text-sm ${
									isShortlistViewActive
										? "text-zinc-600 hover:bg-zinc-50"
										: "bg-zinc-900 text-white"
								}`}
								onClick={() => setShowShortlistedOnly(false)}
							>
								All Players
							</button>
							<button
								type="button"
								aria-pressed={isShortlistViewActive}
								disabled={shortlist.length === 0}
								className={`rounded px-3 py-1.5 font-medium text-sm ${
									isShortlistViewActive
										? "bg-zinc-900 text-white"
										: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
								}`}
								onClick={() => setShowShortlistedOnly(true)}
							>
								Shortlisted ({shortlist.length})
							</button>
						</fieldset>
					</div>
				) : null}

				{isShortlistViewActive ? (
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
						<p className="font-medium text-amber-900 text-sm">
							{shortlistSummary}
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 text-xs hover:bg-amber-100"
								onClick={() => setShowShortlistedOnly(false)}
							>
								Show All
							</button>
							<button
								type="button"
								className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 text-xs hover:bg-amber-100"
								onClick={() => {
									setShortlist([]);
									setShowShortlistedOnly(false);
								}}
							>
								Clear Shortlist
							</button>
						</div>
					</div>
				) : null}

				{active.isPending ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : active.isError ? (
					<p className="text-red-600 text-sm">
						Failed to load - is the API running on port 8000?
					</p>
				) : tab === "form" ? (
					<>
						<FormScatter players={visibleFormRows} />
						<DataTable
							data={visibleFormRows}
							columns={formColumns}
							onRowClick={(row) => openPlayerDetail(row.element)}
							rowClassName={shortlistRowClassName}
							rowStickyClassName={shortlistStickyClassName}
							renderRowActions={renderShortlistAction}
							rowActionsHeader={"\u2605"}
							rowActionsHeaderLabel="Shortlist"
							rowActionsHeaderTooltip="Add or remove players from the shortlist"
							stickyDataColumns={4}
							emptyTitle={playerEmptyTitle}
							emptyDescription={playerEmptyDescription}
							emptyAction={clearActiveFiltersButton}
						/>
					</>
				) : tab === "defcon" ? (
					<DataTable
						data={visibleDefconRows}
						columns={defconColumns}
						onRowClick={(row) => openPlayerDetail(row.element)}
						rowClassName={shortlistRowClassName}
						rowStickyClassName={shortlistStickyClassName}
						renderRowActions={renderShortlistAction}
						rowActionsHeader={"\u2605"}
						rowActionsHeaderLabel="Shortlist"
						rowActionsHeaderTooltip="Add or remove players from the shortlist"
						stickyDataColumns={4}
						emptyTitle={playerEmptyTitle}
						emptyDescription={playerEmptyDescription}
						emptyAction={clearActiveFiltersButton}
					/>
				) : tab === "defconProb" ? (
					<DataTable
						data={visibleDefconProbRows}
						columns={defconProbColumns}
						onRowClick={(row) => openPlayerDetail(row.element)}
						rowClassName={shortlistRowClassName}
						rowStickyClassName={shortlistStickyClassName}
						renderRowActions={renderShortlistAction}
						rowActionsHeader={"\u2605"}
						rowActionsHeaderLabel="Shortlist"
						rowActionsHeaderTooltip="Add or remove players from the shortlist"
						stickyDataColumns={4}
						emptyTitle={playerEmptyTitle}
						emptyDescription={playerEmptyDescription}
						emptyAction={clearActiveFiltersButton}
					/>
				) : (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Club form compares recent per-match output with the season
							baseline, then shows the next fixture run alongside it.
						</p>
						<DataTable
							data={filteredClubs}
							columns={clubColumns}
							stickyDataColumns={1}
							emptyTitle={clubEmptyTitle}
							emptyDescription={
								hasActiveFilters
									? "Try clearing active filters or selecting a different team"
									: undefined
							}
							emptyAction={clearActiveFiltersButton}
						/>
					</>
				)}
			</div>

			{selectedElement !== null ? (
				<PlayerPanel
					key={selectedElement}
					element={selectedElement}
					window={playerWindow}
					season={playerSeason}
					onWindowChange={setPlayerWindow}
					onSeasonChange={setPlayerSeason}
					onClose={() => {
						setSelectedElement(null);
						setPlayerWindow(DEFAULT_PLAYER_WINDOW);
						setPlayerSeason(DEFAULT_PLAYER_SEASON);
					}}
				/>
			) : null}
		</div>
	);
}

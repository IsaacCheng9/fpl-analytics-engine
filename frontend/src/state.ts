import type { FormPlayer, Position } from "./api";

export type Tab = "form" | "defcon" | "defconProb" | "clubs" | "evidence";
export type AttackingMetric = "xg" | "xa" | "xgi";
export type AttackingMetricVisibility = Record<AttackingMetric, boolean>;
export type AttackingMetricColumn = "window" | "season" | "delta" | "value";
export type AttackingThreatPeriod = "window" | "season";
export type OwnershipFilter = "all" | "owned" | "not-owned";
export type AttackingThreatFilters = Record<
	AttackingMetric,
	Record<AttackingThreatPeriod, number | null>
>;
export type ClubColumnGroup =
	| "matches"
	| "xg"
	| "xgc"
	| "xgd"
	| "fdr"
	| "form"
	| "goals"
	| "ga"
	| "finishing_total"
	| "finishing_rate"
	| "concession_total"
	| "concession_rate"
	| "goal_difference_total"
	| "goal_difference_rate";
export type ClubColumnVisibility = Record<ClubColumnGroup, boolean>;
export type TransferFilters = {
	maxPrice: number | null;
	maxFdr: number | null;
	minStartPct: number | null;
	minMinsPerAppearance: number | null;
	minOwnership: number | null;
	maxOwnership: number | null;
};
export type TransferFilterRow = {
	price?: number | null;
	avg_fdr?: number | null;
	window_start_rate?: number | null;
	window_mins_per_appearance?: number | null;
	current_ownership?: number | null;
};
export type ShortlistablePlayer = {
	element: number;
	web_name: string;
};
export type ActiveFilterChip = {
	id: string;
	label: string;
	onClear: () => void;
};
export type FilterPreset = "nailed" | "value" | "differential" | "fixture";

export const TAB_LABELS: Record<Tab, string> = {
	form: "Attacking Form",
	defcon: "DefCon Form",
	defconProb: "DefCon Probability",
	clubs: "Club Form",
	evidence: "Model Evidence",
};

export const TABS: Tab[] = [
	"form",
	"defcon",
	"defconProb",
	"clubs",
	"evidence",
];
export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
export const WINDOW_MIN = 2;
export const WINDOW_MAX = 20;
export const DEFAULT_TAB: Tab = "form";
export const DEFAULT_PLAYER_SEARCH = "";
export const DEFAULT_TEAM_FILTER = "";
// Upper bounds for the automatic window and min-games defaults, which shrink
// early in the season so recent form never covers every gameweek played.
const DEFAULT_WINDOW_SIZE = 5;
export const DEFAULT_POSITION: Position | "" = "";
export const DEFAULT_MIN_MINUTES = 180;
export const DEFAULT_MIN_HIT_RATE = 0;
const DEFAULT_MIN_GAMES = 5;
export const FORM_MIN_DELTA_FLOOR = -1000;
export const DEFAULT_AS_OF_GW: number | null = null;
export const DEFAULT_SELECTED_ELEMENT: number | null = null;
export const DEFAULT_PLAYER_WINDOW = 5;
export const DEFAULT_PLAYER_SEASON: string | null = null;
export const DEFAULT_FPL_TEAM_ID: number | null = null;
export const DEFAULT_OWNERSHIP_FILTER: OwnershipFilter = "all";
export const DEFAULT_SHOW_SQUAD_VIEW = false;
export const DEFAULT_COMPARE_OPEN = false;
export const DEFAULT_COMPARE_ELEMENT: number | null = null;
export const DEFAULT_COMPARE_WINDOW = DEFAULT_WINDOW_SIZE;
export const DEFAULT_COMPARE_AS_OF_GW: number | null = null;
export const DEFAULT_TRANSFER_FILTERS: TransferFilters = {
	maxPrice: null,
	maxFdr: null,
	minStartPct: null,
	minMinsPerAppearance: null,
	minOwnership: null,
	maxOwnership: null,
};
export const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];
export const ATTACKING_METRICS: AttackingMetric[] = ["xgi", "xg", "xa"];
export const ATTACKING_METRIC_COLUMN_ORDER: AttackingMetric[] = [
	"xgi",
	"xg",
	"xa",
];
export const ATTACKING_THREAT_PERIODS: AttackingThreatPeriod[] = [
	"window",
	"season",
];
export const ATTACKING_METRIC_GROUP_LABELS: Record<
	AttackingMetricColumn,
	string
> = {
	window: "Window",
	season: "Season",
	delta: "Delta",
	value: "",
};
export const ATTACKING_METRIC_LABELS: Record<AttackingMetric, string> = {
	xg: "xG",
	xa: "xA",
	xgi: "xGI",
};
export const ATTACKING_METRIC_KEYS: Record<
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
export const ATTACKING_THREAT_FILTER_KEYS: Record<
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
export const ATTACKING_THREAT_QUERY_KEYS: Record<
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
export const ATTACKING_THREAT_PERIOD_LABELS: Record<
	AttackingThreatPeriod,
	string
> = {
	window: "Window",
	season: "Season",
};
export const ATTACKING_METRIC_NOUNS: Record<AttackingMetric, string> = {
	xg: "goals",
	xa: "assists",
	xgi: "goal involvements",
};
export const ATTACKING_METRIC_STYLES: Record<
	AttackingMetric,
	{ header: string }
> = {
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
export const DEFAULT_ATTACKING_METRICS: AttackingMetricVisibility = {
	xg: true,
	xa: false,
	xgi: true,
};
export const DEFAULT_ATTACKING_THREAT_FILTERS: AttackingThreatFilters = {
	xg: { window: null, season: null },
	xa: { window: null, season: null },
	xgi: { window: null, season: null },
};
export const CLUB_COLUMN_GROUPS: ClubColumnGroup[] = [
	"matches",
	"xg",
	"xgc",
	"xgd",
	"fdr",
	"form",
	"goals",
	"ga",
	"finishing_total",
	"finishing_rate",
	"concession_total",
	"concession_rate",
	"goal_difference_total",
	"goal_difference_rate",
];
export const CLUB_COLUMN_LABELS: Record<ClubColumnGroup, string> = {
	matches: "Matches",
	xg: "xG",
	xgc: "xGC",
	xgd: "xGD",
	fdr: "FDR",
	form: "Form Summaries",
	goals: "Goals",
	ga: "Goals Conceded",
	finishing_total: "xG +/- Totals",
	finishing_rate: "xG +/- Per Match",
	concession_total: "xGC +/- Totals",
	concession_rate: "xGC +/- Per Match",
	goal_difference_total: "xGD +/- Totals",
	goal_difference_rate: "xGD +/- Per Match",
};
export const DEFAULT_CLUB_COLUMNS: ClubColumnVisibility = {
	matches: true,
	xg: true,
	xgc: true,
	xgd: true,
	fdr: true,
	form: false,
	goals: false,
	ga: false,
	finishing_total: false,
	finishing_rate: false,
	concession_total: false,
	concession_rate: false,
	goal_difference_total: false,
	goal_difference_rate: false,
};
export const FILTER_PRESETS: Array<{ id: FilterPreset; label: string }> = [
	{ id: "nailed", label: "Nailed Starters" },
	{ id: "value", label: "Value Attack" },
	{ id: "differential", label: "Differentials" },
	{ id: "fixture", label: "Fixture Swing" },
];

// Keep the window within bounds and tolerate an empty/NaN number input.
export function clampWindowSize(value: number): number {
	if (!Number.isFinite(value)) {
		return WINDOW_MIN;
	}
	return Math.min(Math.max(value, WINDOW_MIN), WINDOW_MAX);
}

// Default to a window shorter than the gameweeks played, so the recent window
// differs from the season baseline; fall back to the cap while meta loads.
export function defaultWindowSize(gameweeksPlayed: number): number {
	if (gameweeksPlayed <= 0) {
		return DEFAULT_WINDOW_SIZE;
	}
	return clampWindowSize(Math.min(DEFAULT_WINDOW_SIZE, gameweeksPlayed - 1));
}

// Default to a games floor that some players can meet so far this season.
export function defaultMinGames(gameweeksPlayed: number): number {
	if (gameweeksPlayed <= 0) {
		return DEFAULT_MIN_GAMES;
	}
	return Math.max(1, Math.min(DEFAULT_MIN_GAMES, gameweeksPlayed - 1));
}

// Clamp to the same bounds the URL parser enforces, so a typed value always
// round-trips through the query string instead of silently vanishing on reload.
export function parseOptionalInputNumber(
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

export function isPlayerTab(tab: Tab): boolean {
	return tab !== "clubs" && tab !== "evidence";
}

export function metricsMatchDefault(
	metrics: AttackingMetricVisibility,
): boolean {
	return ATTACKING_METRICS.every(
		(metric) => metrics[metric] === DEFAULT_ATTACKING_METRICS[metric],
	);
}

export function visibleAttackingThreatFiltersMatchDefault(
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

export function clubColumnVisibilityMatchDefault(
	metrics: ClubColumnVisibility,
): boolean {
	return CLUB_COLUMN_GROUPS.every(
		(metric) => metrics[metric] === DEFAULT_CLUB_COLUMNS[metric],
	);
}

export function transferFiltersMatchDefault(filters: TransferFilters): boolean {
	return (
		filters.maxPrice === null &&
		filters.maxFdr === null &&
		filters.minStartPct === null &&
		filters.minMinsPerAppearance === null &&
		filters.minOwnership === null &&
		filters.maxOwnership === null
	);
}

export function defaultTransferFilters(): TransferFilters {
	return { ...DEFAULT_TRANSFER_FILTERS };
}

export function defaultAttackingThreatFilters(): AttackingThreatFilters {
	return {
		xg: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xg },
		xa: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xa },
		xgi: { ...DEFAULT_ATTACKING_THREAT_FILTERS.xgi },
	};
}

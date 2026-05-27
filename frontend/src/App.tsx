import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
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
const DEFAULT_MIN_DELTA: number | null = null;
const DEFAULT_MIN_HIT_RATE = 0;
const DEFAULT_MIN_GAMES = 5;
const DEFAULT_AS_OF_GW: number | null = null;
const DEFAULT_SELECTED_ELEMENT: number | null = null;
const DEFAULT_PLAYER_WINDOW = 5;
const DEFAULT_PLAYER_SEASON: string | null = null;
const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];
const ATTACKING_METRICS: AttackingMetric[] = ["xgi", "xg", "xa"];
const ATTACKING_METRIC_COLUMN_ORDER: AttackingMetric[] = ["xgi", "xg", "xa"];
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
	minDelta: number | null;
	minHitRate: number;
	minGames: number;
	asOfGw: number | null;
	selectedElement: number | null;
	playerWindow: number;
	playerSeason: string | null;
	attackingMetrics: AttackingMetricVisibility;
};

const DEFAULT_URL_STATE: UrlState = {
	tab: DEFAULT_TAB,
	playerSearch: DEFAULT_PLAYER_SEARCH,
	teamFilter: DEFAULT_TEAM_FILTER,
	windowSize: DEFAULT_WINDOW_SIZE,
	position: DEFAULT_POSITION,
	minMinutes: DEFAULT_MIN_MINUTES,
	minDelta: DEFAULT_MIN_DELTA,
	minHitRate: DEFAULT_MIN_HIT_RATE,
	minGames: DEFAULT_MIN_GAMES,
	asOfGw: DEFAULT_AS_OF_GW,
	selectedElement: DEFAULT_SELECTED_ELEMENT,
	playerWindow: DEFAULT_PLAYER_WINDOW,
	playerSeason: DEFAULT_PLAYER_SEASON,
	attackingMetrics: DEFAULT_ATTACKING_METRICS,
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

function readUrlState(): UrlState {
	if (!isBrowser()) {
		return { ...DEFAULT_URL_STATE };
	}
	const params = new URLSearchParams(window.location.search);
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
		minDelta: parseOptionalNumber(params.get("min_delta")),
		minHitRate: parseNumber(params.get("min_hit_rate"), DEFAULT_MIN_HIT_RATE, {
			min: 0,
			max: 1,
		}),
		minGames: parseNumber(params.get("min_games"), DEFAULT_MIN_GAMES, {
			min: 0,
		}),
		asOfGw: parseOptionalNumber(params.get("as_of_gw"), { min: 1 }),
		selectedElement: parseOptionalNumber(params.get("player"), { min: 1 }),
		playerWindow: parseNumber(
			params.get("player_window"),
			DEFAULT_PLAYER_WINDOW,
			{ min: 1, max: WINDOW_MAX },
		),
		playerSeason: params.get("season") ?? DEFAULT_PLAYER_SEASON,
		attackingMetrics: parseAttackingMetrics(params.get("metrics")),
	};
}

function metricsMatchDefault(metrics: AttackingMetricVisibility): boolean {
	return ATTACKING_METRICS.every(
		(metric) => metrics[metric] === DEFAULT_ATTACKING_METRICS[metric],
	);
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
	if (state.tab === "form" && state.minDelta !== DEFAULT_MIN_DELTA) {
		params.set("min_delta", String(state.minDelta));
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
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
const DEFCON_HEAT_KEYS = [
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

// Shade a cell red (worst) to green (best) by its position in the league-wide
// range, so relative standing is readable at a glance.
function HeatCell({
	value,
	range,
	lowerIsBetter,
	text,
}: {
	value: number | null | undefined;
	range: Range;
	lowerIsBetter: boolean;
	text: string;
}) {
	if (value == null) {
		return <span className="text-zinc-400">-</span>;
	}
	const { min, max } = range;
	const t = max > min ? (value - min) / (max - min) : 0.5;
	const score = lowerIsBetter ? 1 - t : t;
	const hue = score * 120; // 0 = red (worst), 120 = green (best).
	return (
		<span
			className="-mx-3 -my-2 block px-3 py-2"
			style={{ backgroundColor: `hsl(${hue}, 68%, 80%)` }}
		>
			{text}
		</span>
	);
}

// Build a heat-shaded cell renderer scaled against a fixed league-wide range.
function heatCell<T>(
	range: Range,
	opts: {
		lowerIsBetter?: boolean;
		format?: (value: number | null) => string;
	} = {},
) {
	const format = opts.format ?? ((value: number | null) => fmtNum(value));
	const lowerIsBetter = opts.lowerIsBetter ?? false;
	return (info: CellContext<T, unknown>) => {
		const value = info.getValue<number | null>();
		return (
			<HeatCell
				value={value}
				range={range}
				lowerIsBetter={lowerIsBetter}
				text={format(value)}
			/>
		);
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
			meta: {
				tooltip,
				headerClassName: styles.header,
			},
		} satisfies ColumnDef<FormPlayer>;
	});
}

function buildFormColumns(
	ranges: Record<string, Range>,
	visibleMetrics: AttackingMetricVisibility,
): ColumnDef<FormPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<FormPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<FormPlayer>(ranges.window_start_rate, { format: fmtPct }),
			meta: { tooltip: "Share of window games the player started" },
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
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<FormPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: heatCell<FormPlayer>(ranges.current_ownership, {
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
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
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of window games the player started" },
		},
		{
			accessorKey: "window_games",
			header: "Games",
			cell: heatCell<DefconPlayer>(ranges.window_games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Eligible games in the window" },
		},
		{
			accessorKey: "window_defcon_hits",
			header: "Hits",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Window games clearing the DefCon threshold" },
		},
		{
			accessorKey: "window_defcon_hit_rate",
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hit_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of window games clearing the DefCon threshold" },
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average defensive-contribution count per game over the window",
			},
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: heatCell<DefconPlayer>(ranges.current_ownership, {
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
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
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the recent window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.window_mins_per_appearance,
				{ format: (v) => fmtNum(v, 0) },
			),
			meta: {
				tooltip:
					"Average minutes per appearance in the recent window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of recent window games the player started" },
		},
		{
			accessorKey: "games",
			header: "Games",
			cell: heatCell<DefconProbabilityPlayer>(ranges.games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Eligible appearances up to this gameweek" },
		},
		{
			accessorKey: "hits",
			header: "Hits",
			cell: heatCell<DefconProbabilityPlayer>(ranges.hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Appearances clearing the DefCon threshold" },
		},
		{
			accessorKey: "raw_rate",
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>(ranges.raw_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Observed DefCon hit rate (hits / games)" },
		},
		{
			accessorKey: "prob",
			header: "P(Hit Next GW)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob, { format: fmtPct }),
			meta: {
				tooltip:
					"Modelled probability of clearing the DefCon threshold next gameweek",
			},
		},
		{
			accessorKey: "prob_std",
			header: "+/-",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob_std, {
				lowerIsBetter: true,
			}),
			meta: { tooltip: "Uncertainty (standard deviation) of the probability" },
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average defensive-contribution count per game over the recent window",
			},
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.season_points_per_million,
				{ format: (v) => fmtNum(v, 1) },
			),
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: heatCell<DefconProbabilityPlayer>(ranges.current_ownership, {
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
		},
	];
}

function buildClubColumns(
	ranges: Record<string, Range>,
): ColumnDef<ClubForm>[] {
	return [
		{ accessorKey: "team_name", header: "Club" },
		{
			accessorKey: "window_matches",
			header: "Matches",
			cell: heatCell<ClubForm>(ranges.window_matches, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Club matches in the recent window" },
		},
		{
			accessorKey: "window_xg_per_match",
			header: "Window xG",
			cell: heatCell<ClubForm>(ranges.window_xg_per_match),
			meta: { tooltip: "Expected goals per match over the recent window" },
		},
		{
			accessorKey: "season_xg_per_match",
			header: "Season xG",
			cell: heatCell<ClubForm>(ranges.season_xg_per_match),
			meta: { tooltip: "Expected goals per match, season to date" },
		},
		{
			accessorKey: "delta_xg_per_match",
			header: "Delta xG",
			cell: heatCell<ClubForm>(ranges.delta_xg_per_match, {
				format: fmtDelta,
			}),
			meta: {
				tooltip:
					"Window xG per match minus season xG per match; positive means the attack is creating more",
			},
		},
		{
			accessorKey: "window_goals_for_per_match",
			header: "Window Goals",
			cell: heatCell<ClubForm>(ranges.window_goals_for_per_match),
			meta: { tooltip: "Goals scored per match over the recent window" },
		},
		{
			accessorKey: "delta_goals_for_per_match",
			header: "Delta Goals",
			cell: heatCell<ClubForm>(ranges.delta_goals_for_per_match, {
				format: fmtDelta,
			}),
			meta: {
				tooltip:
					"Window goals per match minus season goals per match; useful context for finishing variance",
			},
		},
		{
			accessorKey: "window_xgc_per_match",
			header: "Window xGC",
			cell: heatCell<ClubForm>(ranges.window_xgc_per_match, {
				lowerIsBetter: true,
			}),
			meta: {
				tooltip: "Expected goals conceded per match over the recent window",
			},
		},
		{
			accessorKey: "season_xgc_per_match",
			header: "Season xGC",
			cell: heatCell<ClubForm>(ranges.season_xgc_per_match, {
				lowerIsBetter: true,
			}),
			meta: { tooltip: "Expected goals conceded per match, season to date" },
		},
		{
			accessorKey: "delta_xgc_per_match",
			header: "Delta xGC",
			cell: heatCell<ClubForm>(ranges.delta_xgc_per_match, {
				lowerIsBetter: true,
				format: fmtDelta,
			}),
			meta: {
				tooltip:
					"Window xGC per match minus season xGC per match; negative means the defence is allowing less",
			},
		},
		{
			accessorKey: "window_goals_against_per_match",
			header: "Window GA",
			cell: heatCell<ClubForm>(ranges.window_goals_against_per_match, {
				lowerIsBetter: true,
			}),
			meta: {
				tooltip: "Goals conceded per match over the recent window",
			},
		},
		{
			accessorKey: "delta_goals_against_per_match",
			header: "Delta GA",
			cell: heatCell<ClubForm>(ranges.delta_goals_against_per_match, {
				lowerIsBetter: true,
				format: fmtDelta,
			}),
			meta: {
				tooltip:
					"Window goals conceded per match minus season goals conceded per match",
			},
		},
		{
			accessorKey: "attack_form",
			header: "Attack Form",
			cell: heatCell<ClubForm>(ranges.attack_form, { format: fmtDelta }),
			meta: {
				tooltip: "Recent xG per match improvement versus the season baseline",
			},
		},
		{
			accessorKey: "defence_form",
			header: "Defence Form",
			cell: heatCell<ClubForm>(ranges.defence_form, { format: fmtDelta }),
			meta: {
				tooltip:
					"Recent xGC per match improvement versus the season baseline; positive is better",
			},
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<ClubForm>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
	];
}

const labelClass = "flex flex-col text-xs font-medium text-zinc-600";
const fieldClass =
	"rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900";
// Most controls sit below a label, so the shared input class adds the gap.
const inputClass = `mt-1 ${fieldClass}`;

// Keep the window within bounds and tolerate an empty/NaN number input.
function clampWindowSize(value: number): number {
	if (!Number.isFinite(value)) {
		return WINDOW_MIN;
	}
	return Math.min(Math.max(value, WINDOW_MIN), WINDOW_MAX);
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
	// Null means no delta floor - show every qualifying player by default; the
	// delta column and scatter still convey who is improving.
	const [minDelta, setMinDelta] = useState<number | null>(
		initialUrlState.minDelta,
	);
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

	useEffect(() => {
		function applyCurrentUrlState() {
			const next = readUrlState();
			setTab(next.tab);
			setPlayerSearch(next.playerSearch);
			setTeamFilter(next.teamFilter);
			setWindowSize(next.windowSize);
			setPosition(next.position);
			setMinMinutes(next.minMinutes);
			setMinDelta(next.minDelta);
			setMinHitRate(next.minHitRate);
			setMinGames(next.minGames);
			setAsOfGw(next.asOfGw);
			setSelectedElement(next.selectedElement);
			setPlayerWindow(next.playerWindow);
			setPlayerSeason(next.playerSeason);
			setAttackingMetrics(next.attackingMetrics);
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
			minDelta,
			minHitRate,
			minGames,
			asOfGw,
			selectedElement,
			playerWindow,
			playerSeason,
			attackingMetrics,
		});
	}, [
		tab,
		playerSearch,
		teamFilter,
		windowSize,
		position,
		minMinutes,
		minDelta,
		minHitRate,
		minGames,
		asOfGw,
		selectedElement,
		playerWindow,
		playerSeason,
		attackingMetrics,
	]);

	function toggleAttackingMetric(metric: AttackingMetric) {
		setAttackingMetrics((current) => {
			const enabledCount = Object.values(current).filter(Boolean).length;
			if (current[metric] && enabledCount === 1) {
				return current;
			}
			return { ...current, [metric]: !current[metric] };
		});
	}

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const latestGw = meta.data?.latest_gw ?? 38;
	const hasPlayerSearch = playerSearch.trim() !== "";
	const windowFillPct =
		((windowSize - WINDOW_MIN) / (WINDOW_MAX - WINDOW_MIN)) * 100;

	const base = { window: windowSize, position, minMinutes, asOfGw };
	const formQuery = useQuery({
		queryKey: [
			"form",
			windowSize,
			position,
			minMinutes,
			minDelta,
			asOfGw,
			hasPlayerSearch,
		],
		queryFn: () =>
			fetchForm({
				...base,
				minDelta: hasPlayerSearch ? -1000 : (minDelta ?? -1000),
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
				minDelta: -1000,
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
			buildClubColumns(computeRanges(clubBaseline.data ?? [], CLUB_HEAT_KEYS)),
		[clubBaseline.data],
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
	const filteredDefcon = filterPlayers(
		defconQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredDefconProb = filterPlayers(
		defconProbQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredClubs = (clubQuery.data ?? []).filter(
		(row) => teamFilter === "" || row.team_name === teamFilter,
	);
	const enabledAttackingMetricCount =
		Object.values(attackingMetrics).filter(Boolean).length;

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<div className="mx-auto max-w-[90rem] px-6 py-8">
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

						{tab !== "defconProb" && tab !== "clubs" && (
							<label className={labelClass}>
								Min Minutes
								<input
									type="number"
									min={0}
									className={`${inputClass} w-24`}
									value={minMinutes}
									onChange={(e) => setMinMinutes(Number(e.target.value))}
								/>
							</label>
						)}

						{tab === "form" && (
							<>
								<label className={labelClass}>
									Min Delta xGI Per 90
									<input
										type="number"
										step={0.05}
										placeholder="Any"
										className={`${inputClass} w-24`}
										value={minDelta ?? ""}
										onChange={(e) =>
											setMinDelta(
												e.target.value === "" ? null : Number(e.target.value),
											)
										}
									/>
								</label>

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
							</>
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
				</div>

				{active.isPending ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : active.isError ? (
					<p className="text-red-600 text-sm">
						Failed to load - is the API running on port 8000?
					</p>
				) : tab === "form" ? (
					<>
						<FormScatter players={filteredForm} />
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredForm}
							columns={formColumns}
							onRowClick={(row) => {
								setSelectedElement(row.element);
								setPlayerWindow(DEFAULT_PLAYER_WINDOW);
								setPlayerSeason(DEFAULT_PLAYER_SEASON);
							}}
						/>
					</>
				) : tab === "defcon" ? (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredDefcon}
							columns={defconColumns}
							onRowClick={(row) => {
								setSelectedElement(row.element);
								setPlayerWindow(DEFAULT_PLAYER_WINDOW);
								setPlayerSeason(DEFAULT_PLAYER_SEASON);
							}}
						/>
					</>
				) : tab === "defconProb" ? (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredDefconProb}
							columns={defconProbColumns}
							onRowClick={(row) => {
								setSelectedElement(row.element);
								setPlayerWindow(DEFAULT_PLAYER_WINDOW);
								setPlayerSeason(DEFAULT_PLAYER_SEASON);
							}}
						/>
					</>
				) : (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Club form compares recent per-match output with the season
							baseline, then shows the next fixture run alongside it.
						</p>
						<DataTable data={filteredClubs} columns={clubColumns} />
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

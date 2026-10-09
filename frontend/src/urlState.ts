import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Position } from "./api";
import { parseSortParam } from "./lib/tableSort";
import {
	ATTACKING_METRICS,
	ATTACKING_THREAT_PERIODS,
	ATTACKING_THREAT_QUERY_KEYS,
	type AttackingMetricVisibility,
	type AttackingThreatFilters,
	CLUB_COLUMN_GROUPS,
	type ClubColumnVisibility,
	clampWindowSize,
	clubColumnVisibilityMatchDefault,
	DEFAULT_AS_OF_GW,
	DEFAULT_ATTACKING_METRICS,
	DEFAULT_ATTACKING_THREAT_FILTERS,
	DEFAULT_CLUB_COLUMNS,
	DEFAULT_COMPARE_AS_OF_GW,
	DEFAULT_COMPARE_ELEMENT,
	DEFAULT_COMPARE_OPEN,
	DEFAULT_COMPARE_WINDOW,
	DEFAULT_FPL_TEAM_ID,
	DEFAULT_MIN_HIT_RATE,
	DEFAULT_MIN_MINUTES,
	DEFAULT_OWNERSHIP_FILTER,
	DEFAULT_PLAYER_SEARCH,
	DEFAULT_PLAYER_SEASON,
	DEFAULT_PLAYER_WINDOW,
	DEFAULT_POSITION,
	DEFAULT_SELECTED_ELEMENT,
	DEFAULT_SHOW_SQUAD_VIEW,
	DEFAULT_TAB,
	DEFAULT_TEAM_FILTER,
	DEFAULT_TRANSFER_FILTERS,
	isPlayerTab,
	metricsMatchDefault,
	type OwnershipFilter,
	POSITIONS,
	type Tab,
	type TransferFilters,
	transferFiltersMatchDefault,
	visibleAttackingThreatFiltersMatchDefault,
	WINDOW_MAX,
} from "./state";

const TAB_QUERY_VALUES: Record<Tab, string> = {
	form: "form",
	defcon: "defcon",
	defconProb: "defcon-prob",
	clubs: "clubs",
	evidence: "evidence",
};
const QUERY_VALUE_TABS: Record<string, Tab> = {
	form: "form",
	defcon: "defcon",
	defconProb: "defconProb",
	"defcon-prob": "defconProb",
	clubs: "clubs",
	evidence: "evidence",
};

export type UrlState = {
	tab: Tab;
	playerSearch: string;
	teamFilter: string;
	windowSize: number | null;
	position: Position | "";
	minMinutes: number;
	minHitRate: number;
	minGames: number | null;
	asOfGw: number | null;
	selectedElement: number | null;
	playerWindow: number;
	playerSeason: string | null;
	fplTeamId: number | null;
	ownershipFilter: OwnershipFilter;
	showSquadView: boolean;
	compareOpen: boolean;
	compareLeftElement: number | null;
	compareRightElement: number | null;
	compareWindow: number;
	compareAsOfGw: number | null;
	attackingMetrics: AttackingMetricVisibility;
	attackingThreatFilters: AttackingThreatFilters;
	clubColumnVisibility: ClubColumnVisibility;
	transferFilters: TransferFilters;
	shortlist: number[];
	showShortlistedOnly: boolean;
	sort: string | null;
};

export const DEFAULT_URL_STATE: UrlState = {
	tab: DEFAULT_TAB,
	playerSearch: DEFAULT_PLAYER_SEARCH,
	teamFilter: DEFAULT_TEAM_FILTER,
	windowSize: null,
	position: DEFAULT_POSITION,
	minMinutes: DEFAULT_MIN_MINUTES,
	minHitRate: DEFAULT_MIN_HIT_RATE,
	minGames: null,
	asOfGw: DEFAULT_AS_OF_GW,
	selectedElement: DEFAULT_SELECTED_ELEMENT,
	playerWindow: DEFAULT_PLAYER_WINDOW,
	playerSeason: DEFAULT_PLAYER_SEASON,
	fplTeamId: DEFAULT_FPL_TEAM_ID,
	ownershipFilter: DEFAULT_OWNERSHIP_FILTER,
	showSquadView: DEFAULT_SHOW_SQUAD_VIEW,
	compareOpen: DEFAULT_COMPARE_OPEN,
	compareLeftElement: DEFAULT_COMPARE_ELEMENT,
	compareRightElement: DEFAULT_COMPARE_ELEMENT,
	compareWindow: DEFAULT_COMPARE_WINDOW,
	compareAsOfGw: DEFAULT_COMPARE_AS_OF_GW,
	attackingMetrics: DEFAULT_ATTACKING_METRICS,
	attackingThreatFilters: DEFAULT_ATTACKING_THREAT_FILTERS,
	clubColumnVisibility: DEFAULT_CLUB_COLUMNS,
	transferFilters: DEFAULT_TRANSFER_FILTERS,
	shortlist: [],
	showShortlistedOnly: false,
	sort: null,
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

function parseClubColumnGroups(value: string | null): ClubColumnVisibility {
	if (value === null) {
		return { ...DEFAULT_CLUB_COLUMNS };
	}
	const visible = new Set(value.split(","));
	return Object.fromEntries(
		CLUB_COLUMN_GROUPS.map((metric) => [metric, visible.has(metric)]),
	) as ClubColumnVisibility;
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

function parseOwnershipFilter(value: string | null): OwnershipFilter {
	return value === "owned" || value === "not-owned"
		? value
		: DEFAULT_OWNERSHIP_FILTER;
}

export function readUrlState(): UrlState {
	if (!isBrowser()) {
		return { ...DEFAULT_URL_STATE };
	}
	const params = new URLSearchParams(window.location.search);
	const shortlist = parseShortlist(params.get("shortlist"));
	const fplTeamId = parseOptionalNumber(params.get("fpl_team"), { min: 1 });
	const tab = parseTab(params.get("tab"));
	const showSquadView =
		fplTeamId !== null && isPlayerTab(tab) && params.get("squad_view") === "1";
	const windowSize = parseOptionalNumber(params.get("window"));
	return {
		tab,
		playerSearch: params.get("q") ?? DEFAULT_PLAYER_SEARCH,
		teamFilter: params.get("team") ?? DEFAULT_TEAM_FILTER,
		windowSize: windowSize === null ? null : clampWindowSize(windowSize),
		position: parsePosition(params.get("position")),
		minMinutes: parseNumber(params.get("min_minutes"), DEFAULT_MIN_MINUTES, {
			min: 0,
		}),
		minHitRate: parseNumber(params.get("min_hit_rate"), DEFAULT_MIN_HIT_RATE, {
			min: 0,
			max: 1,
		}),
		minGames: parseOptionalNumber(params.get("min_games"), { min: 0 }),
		asOfGw: parseOptionalNumber(params.get("as_of_gw"), { min: 1 }),
		selectedElement: parseOptionalNumber(params.get("player"), { min: 1 }),
		fplTeamId,
		ownershipFilter: showSquadView
			? DEFAULT_OWNERSHIP_FILTER
			: parseOwnershipFilter(params.get("squad")),
		showSquadView,
		compareOpen:
			params.get("compare") === "1" ||
			params.has("compare_a") ||
			params.has("compare_b"),
		compareLeftElement: parseOptionalNumber(params.get("compare_a"), {
			min: 1,
		}),
		compareRightElement: parseOptionalNumber(params.get("compare_b"), {
			min: 1,
		}),
		compareWindow: clampWindowSize(
			parseNumber(params.get("compare_window"), DEFAULT_COMPARE_WINDOW),
		),
		compareAsOfGw: parseOptionalNumber(params.get("compare_as_of_gw"), {
			min: 1,
		}),
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
		clubColumnVisibility: params.has("club_columns")
			? parseClubColumnGroups(params.get("club_columns"))
			: {
					...DEFAULT_CLUB_COLUMNS,
					goals:
						params.get("club_actuals")?.split(",").includes("goals") ?? false,
					ga: params.get("club_actuals")?.split(",").includes("ga") ?? false,
				},
		shortlist,
		showShortlistedOnly:
			!showSquadView &&
			shortlist.length > 0 &&
			params.get("shortlist_only") === "1",
		sort: parseSortParam(params.get("sort")),
	};
}

export function writeUrlState(state: UrlState) {
	if (!isBrowser()) {
		return;
	}
	const params = new URLSearchParams();
	if (state.tab !== DEFAULT_TAB) {
		params.set("tab", TAB_QUERY_VALUES[state.tab]);
	}
	if (isPlayerTab(state.tab) && state.playerSearch !== DEFAULT_PLAYER_SEARCH) {
		params.set("q", state.playerSearch);
	}
	if (state.tab !== "evidence" && state.teamFilter !== DEFAULT_TEAM_FILTER) {
		params.set("team", state.teamFilter);
	}
	if (state.tab !== "evidence" && state.windowSize !== null) {
		params.set("window", String(state.windowSize));
	}
	if (isPlayerTab(state.tab) && state.position !== DEFAULT_POSITION) {
		params.set("position", state.position);
	}
	if (
		isPlayerTab(state.tab) &&
		state.tab !== "defconProb" &&
		state.minMinutes !== DEFAULT_MIN_MINUTES
	) {
		params.set("min_minutes", String(state.minMinutes));
	}
	if (state.tab === "defcon" && state.minHitRate !== DEFAULT_MIN_HIT_RATE) {
		params.set("min_hit_rate", String(state.minHitRate));
	}
	if (state.tab === "defconProb" && state.minGames !== null) {
		params.set("min_games", String(state.minGames));
	}
	if (state.tab !== "evidence" && state.asOfGw !== DEFAULT_AS_OF_GW) {
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
	if (!clubColumnVisibilityMatchDefault(state.clubColumnVisibility)) {
		params.set(
			"club_columns",
			CLUB_COLUMN_GROUPS.filter(
				(metric) => state.clubColumnVisibility[metric],
			).join(","),
		);
	}
	if (state.shortlist.length > 0) {
		params.set("shortlist", state.shortlist.join(","));
		if (isPlayerTab(state.tab) && state.showShortlistedOnly) {
			params.set("shortlist_only", "1");
		}
	}
	if (
		isPlayerTab(state.tab) &&
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
		isPlayerTab(state.tab) &&
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
	if (state.fplTeamId !== DEFAULT_FPL_TEAM_ID) {
		params.set("fpl_team", String(state.fplTeamId));
		if (isPlayerTab(state.tab) && state.ownershipFilter !== "all") {
			params.set("squad", state.ownershipFilter);
		}
		if (isPlayerTab(state.tab) && state.showSquadView) {
			params.set("squad_view", "1");
		}
	}
	if (state.compareOpen) {
		params.set("compare", "1");
		if (state.compareLeftElement !== DEFAULT_COMPARE_ELEMENT) {
			params.set("compare_a", String(state.compareLeftElement));
		}
		if (state.compareRightElement !== DEFAULT_COMPARE_ELEMENT) {
			params.set("compare_b", String(state.compareRightElement));
		}
		if (state.compareWindow !== DEFAULT_COMPARE_WINDOW) {
			params.set("compare_window", String(state.compareWindow));
		}
		if (state.compareAsOfGw !== DEFAULT_COMPARE_AS_OF_GW) {
			params.set("compare_as_of_gw", String(state.compareAsOfGw));
		}
	}

	if (state.tab !== "evidence" && state.sort !== null) {
		params.set("sort", state.sort);
	}

	const search = params.toString();
	const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
	const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	if (nextUrl !== currentUrl) {
		window.history.replaceState(null, "", nextUrl);
	}
}

export type UrlStateSetters = {
	[Key in keyof UrlState]: Dispatch<SetStateAction<UrlState[Key]>>;
};

// Hold the shareable dashboard state, mirror it into the query string, and
// restore it on back/forward navigation. Each field gets a stable setter with
// useState semantics, so call sites read like ordinary component state.
export function useUrlState(
	onRestore?: (state: UrlState) => void,
): [UrlState, UrlStateSetters] {
	const [state, setState] = useState(readUrlState);
	const onRestoreRef = useRef(onRestore);
	onRestoreRef.current = onRestore;

	useEffect(() => {
		function restore() {
			const next = readUrlState();
			setState(next);
			onRestoreRef.current?.(next);
		}
		window.addEventListener("popstate", restore);
		return () => window.removeEventListener("popstate", restore);
	}, []);

	useEffect(() => {
		writeUrlState(state);
	}, [state]);

	const setters = useMemo(() => {
		function setterFor<Key extends keyof UrlState>(key: Key) {
			return (value: SetStateAction<UrlState[Key]>) =>
				setState((current) => {
					const next =
						typeof value === "function"
							? (value as (previous: UrlState[Key]) => UrlState[Key])(
									current[key],
								)
							: value;
					// Keep the same object when nothing changed so React can skip renders.
					return Object.is(next, current[key])
						? current
						: { ...current, [key]: next };
				});
		}
		const keys = Object.keys(DEFAULT_URL_STATE) as Array<keyof UrlState>;
		return Object.fromEntries(
			keys.map((key) => [key, setterFor(key)]),
		) as UrlStateSetters;
	}, []);

	return [state, setters];
}

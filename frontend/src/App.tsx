import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
	type FplTeamPick,
	fetchClubForm,
	fetchClubFormValidation,
	fetchCurrentPlayerContext,
	fetchDefcon,
	fetchDefconProbability,
	fetchDefconProbabilityValidation,
	fetchForm,
	fetchFplTeam,
	fetchMeta,
	type Position,
} from "./api";
import {
	buildClubColumns,
	buildDefconColumns,
	buildDefconProbColumns,
	buildFormColumns,
	CLUB_HEAT_KEYS,
	computeRanges,
	DEFCON_HEAT_KEYS,
	DEFCON_PROB_HEAT_KEYS,
	FORM_HEAT_KEYS,
} from "./columns";
import { ActiveFilterChips } from "./components/ActiveFilterChips";
import { AttackingThreatFilterFields } from "./components/AttackingThreatFilterFields";
import { ClubColumnChooser } from "./components/ClubColumnChooser";
import { DataTable } from "./components/DataTable";
import { FormScatter } from "./components/FormScatter";
import { InfoTooltip } from "./components/InfoTooltip";
import { ModelEvidence } from "./components/ModelEvidence";
import { SeasonStatus } from "./components/SeasonStatus";
import { SquadInspection } from "./components/SquadInspection";
import { TransferFilterFields } from "./components/TransferFilterFields";
import { WindowSizeControl } from "./components/WindowSizeControl";
import {
	filterAttackingThreatCandidates,
	filterOwnedPlayers,
	filterPlayers,
	filterShortlistedPlayers,
	filterTransferCandidates,
	formatPlayerCount,
} from "./lib/filters";
import { fmtNum, fmtPctPoints, fmtPrice } from "./lib/format";
import {
	type ActiveFilterChip,
	ATTACKING_METRIC_COLUMN_ORDER,
	ATTACKING_METRIC_LABELS,
	ATTACKING_METRICS,
	ATTACKING_THREAT_PERIOD_LABELS,
	ATTACKING_THREAT_PERIODS,
	type AttackingMetric,
	type AttackingThreatPeriod,
	type ClubColumnGroup,
	clubColumnVisibilityMatchDefault,
	DEFAULT_AS_OF_GW,
	DEFAULT_ATTACKING_METRICS,
	DEFAULT_CLUB_COLUMNS,
	DEFAULT_FPL_TEAM_ID,
	DEFAULT_MIN_HIT_RATE,
	DEFAULT_MIN_MINUTES,
	DEFAULT_OWNERSHIP_FILTER,
	DEFAULT_PLAYER_SEARCH,
	DEFAULT_PLAYER_SEASON,
	DEFAULT_PLAYER_WINDOW,
	DEFAULT_POSITION,
	DEFAULT_SHOW_SQUAD_VIEW,
	DEFAULT_TEAM_FILTER,
	defaultAttackingThreatFilters,
	defaultMinGames,
	defaultTransferFilters,
	defaultWindowSize,
	FILTER_PRESETS,
	type FilterPreset,
	FORM_MIN_DELTA_FLOOR,
	HIT_RATES,
	isPlayerTab,
	metricsMatchDefault,
	type OwnershipFilter,
	POSITIONS,
	type ShortlistablePlayer,
	TAB_LABELS,
	TABS,
	type TransferFilters,
	transferFiltersMatchDefault,
	visibleAttackingThreatFiltersMatchDefault,
	WINDOW_MIN,
} from "./state";
import { inputClass, labelClass } from "./styles";
import { useUrlState } from "./urlState";

// Load the modal panels on demand to keep them out of the initial bundle.
const PlayerPanel = lazy(() =>
	import("./components/PlayerPanel").then((m) => ({ default: m.PlayerPanel })),
);
const PlayerComparePanel = lazy(() =>
	import("./components/PlayerComparePanel").then((m) => ({
		default: m.PlayerComparePanel,
	})),
);

function PanelFallback() {
	return (
		<div className="fixed inset-0 z-40 overflow-y-auto p-4">
			<div className="fixed inset-0 bg-black/40" />
			<div className="relative mx-auto mt-8 w-full max-w-4xl rounded-lg bg-white p-5 shadow-xl">
				<p className="text-sm text-zinc-500">Loading...</p>
			</div>
		</div>
	);
}

export default function App() {
	const [tablePageSize, setTablePageSize] = useState(25);
	const [urlState, setUrlState] = useUrlState((restored) =>
		setFplTeamInput(restored.fplTeamId?.toString() ?? ""),
	);
	const {
		tab,
		playerSearch,
		teamFilter,
		windowSize: windowSizeChoice,
		position,
		minMinutes,
		minHitRate,
		minGames: minGamesChoice,
		asOfGw,
		selectedElement,
		playerWindow,
		playerSeason,
		fplTeamId,
		ownershipFilter,
		showSquadView,
		compareOpen,
		compareLeftElement,
		compareRightElement,
		compareWindow,
		compareAsOfGw,
		attackingMetrics,
		attackingThreatFilters,
		clubColumnVisibility,
		transferFilters,
		shortlist,
		showShortlistedOnly,
	} = urlState;
	const {
		tab: setTab,
		playerSearch: setPlayerSearch,
		teamFilter: setTeamFilter,
		windowSize: setWindowSize,
		position: setPosition,
		minMinutes: setMinMinutes,
		minHitRate: setMinHitRate,
		minGames: setMinGames,
		asOfGw: setAsOfGw,
		selectedElement: setSelectedElement,
		playerWindow: setPlayerWindow,
		playerSeason: setPlayerSeason,
		fplTeamId: setFplTeamId,
		ownershipFilter: setOwnershipFilter,
		showSquadView: setShowSquadView,
		compareOpen: setCompareOpen,
		compareLeftElement: setCompareLeftElement,
		compareRightElement: setCompareRightElement,
		compareWindow: setCompareWindow,
		compareAsOfGw: setCompareAsOfGw,
		attackingMetrics: setAttackingMetrics,
		attackingThreatFilters: setAttackingThreatFilters,
		clubColumnVisibility: setClubColumnGroups,
		transferFilters: setTransferFilters,
		shortlist: setShortlist,
		showShortlistedOnly: setShowShortlistedOnly,
	} = setUrlState;
	// The team ID input is a draft until imported, so it stays out of the URL.
	const [fplTeamInput, setFplTeamInput] = useState(
		urlState.fplTeamId?.toString() ?? "",
	);

	useEffect(() => {
		if (shortlist.length === 0 && showShortlistedOnly) {
			setShowShortlistedOnly(false);
		}
	}, [shortlist.length, showShortlistedOnly, setShowShortlistedOnly]);

	useEffect(() => {
		if (fplTeamId === null && ownershipFilter !== "all") {
			setOwnershipFilter("all");
		}
		if (fplTeamId === null && showSquadView) {
			setShowSquadView(false);
		}
	}, [
		fplTeamId,
		ownershipFilter,
		showSquadView,
		setOwnershipFilter,
		setShowSquadView,
	]);

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
		setWindowSize(null);
		setPosition(DEFAULT_POSITION);
		setMinMinutes(DEFAULT_MIN_MINUTES);
		setMinHitRate(DEFAULT_MIN_HIT_RATE);
		setMinGames(null);
		setAsOfGw(DEFAULT_AS_OF_GW);
		setAttackingMetrics({ ...DEFAULT_ATTACKING_METRICS });
		setAttackingThreatFilters(defaultAttackingThreatFilters());
		setClubColumnGroups({ ...DEFAULT_CLUB_COLUMNS });
		setTransferFilters(defaultTransferFilters());
		setOwnershipFilter(DEFAULT_OWNERSHIP_FILTER);
		setShowSquadView(DEFAULT_SHOW_SQUAD_VIEW);
		setShowShortlistedOnly(false);
	}

	function importFplTeam() {
		const parsed = Number(fplTeamInput);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			return;
		}
		if (parsed !== fplTeamId) {
			setOwnershipFilter(DEFAULT_OWNERSHIP_FILTER);
			setShowSquadView(DEFAULT_SHOW_SQUAD_VIEW);
		}
		setFplTeamId(parsed);
	}

	function clearFplTeam() {
		setFplTeamId(DEFAULT_FPL_TEAM_ID);
		setFplTeamInput("");
		setOwnershipFilter(DEFAULT_OWNERSHIP_FILTER);
		setShowSquadView(DEFAULT_SHOW_SQUAD_VIEW);
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

	function openComparePanel() {
		setCompareOpen(true);
		setCompareWindow(windowSize);
		setCompareAsOfGw(asOfGw);
		const defaults = shortlist.length > 0 ? shortlist : ownedElementList;
		if (defaults.length > 0) {
			setCompareLeftElement((current) => current ?? defaults[0] ?? null);
			setCompareRightElement((current) => current ?? defaults[1] ?? null);
		}
	}

	function closeComparePanel() {
		setCompareOpen(false);
	}

	function updateCompareLeft(element: number | null) {
		setCompareLeftElement(element);
		if (element !== null && element === compareRightElement) {
			setCompareRightElement(null);
		}
	}

	function updateCompareRight(element: number | null) {
		setCompareRightElement(element);
		if (element !== null && element === compareLeftElement) {
			setCompareLeftElement(null);
		}
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

	function toggleClubColumnGroup(metric: ClubColumnGroup) {
		setClubColumnGroups((current) => ({
			...current,
			[metric]: !current[metric],
		}));
	}

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const analyticsReady = meta.data?.data_status === "ready";
	const latestGw = meta.data?.latest_gw ?? 0;
	const gameweeksPlayed = asOfGw ?? latestGw;
	const windowSize = windowSizeChoice ?? defaultWindowSize(gameweeksPlayed);
	const minGames = minGamesChoice ?? defaultMinGames(gameweeksPlayed);
	const hasPlayerSearch = playerSearch.trim() !== "";
	const isSquadViewActive =
		isPlayerTab(tab) && showSquadView && fplTeamId !== null;
	const fplTeamQuery = useQuery({
		queryKey: ["fplTeam", fplTeamId],
		queryFn: () => fetchFplTeam(fplTeamId as number, null),
		enabled: analyticsReady && fplTeamId !== null,
	});
	const importedTeam =
		fplTeamQuery.data?.entry_id === fplTeamId ? fplTeamQuery.data : undefined;
	const teamImportIdentityError =
		fplTeamQuery.data !== undefined && importedTeam === undefined;
	const parsedFplTeamInput = Number(fplTeamInput);
	const canImportFplTeam =
		Number.isInteger(parsedFplTeamInput) && parsedFplTeamInput > 0;
	const ownedElements = useMemo(
		() => new Set(importedTeam?.owned_elements ?? []),
		[importedTeam],
	);
	const ownedElementList = useMemo(
		() => importedTeam?.owned_elements ?? [],
		[importedTeam],
	);
	const ownedCount = importedTeam?.owned_elements.length ?? 0;
	const hasImportedTeam = importedTeam !== undefined;
	const squadPicks: FplTeamPick[] = importedTeam?.picks ?? [];

	// Fetch each table league-wide so heat ranges stay fixed as filters change;
	// position, hit-rate and games filters then apply client-side.
	const base = {
		window: windowSize,
		position: "" as const,
		minMinutes,
		asOfGw,
	};
	const squadBase = {
		window: windowSize,
		position: "" as const,
		minMinutes: 0,
		asOfGw,
	};
	const formQuery = useQuery({
		queryKey: ["form", windowSize, minMinutes, asOfGw],
		queryFn: () =>
			fetchForm({
				...base,
				minDelta: FORM_MIN_DELTA_FLOOR,
			}),
		enabled: analyticsReady && tab === "form",
	});
	const defconQuery = useQuery({
		queryKey: ["defcon", windowSize, minMinutes, asOfGw],
		queryFn: () => fetchDefcon({ ...base, minHitRate: 0 }),
		enabled: analyticsReady && tab === "defcon",
	});
	const defconProbQuery = useQuery({
		queryKey: ["defconProb", asOfGw],
		queryFn: () =>
			fetchDefconProbability({ position: "", minGames: 0, asOfGw }),
		enabled: analyticsReady && tab === "defconProb",
	});
	const clubQuery = useQuery({
		queryKey: ["clubs", windowSize, asOfGw],
		queryFn: () => fetchClubForm({ window: windowSize, asOfGw }),
		enabled: analyticsReady && tab === "clubs",
	});
	const defconValidationQuery = useQuery({
		queryKey: ["defconValidation"],
		queryFn: () => fetchDefconProbabilityValidation(),
		enabled: analyticsReady && tab === "evidence",
	});
	const clubValidationQuery = useQuery({
		queryKey: ["clubValidation"],
		queryFn: () => fetchClubFormValidation(),
		enabled: analyticsReady && tab === "evidence",
	});
	const squadFormQuery = useQuery({
		queryKey: ["squadForm", windowSize, asOfGw],
		queryFn: () =>
			fetchForm({
				...squadBase,
				minDelta: FORM_MIN_DELTA_FLOOR,
			}),
		enabled: analyticsReady && isSquadViewActive,
	});
	const squadCurrentContextQuery = useQuery({
		queryKey: ["squadCurrentContext"],
		queryFn: fetchCurrentPlayerContext,
		enabled: analyticsReady && isSquadViewActive,
	});
	const squadDefconProbabilityQuery = useQuery({
		queryKey: ["defconProb", asOfGw],
		queryFn: () =>
			fetchDefconProbability({
				position: "",
				minGames: 0,
				asOfGw,
			}),
		enabled: analyticsReady && isSquadViewActive,
	});

	const compareFormQuery = useQuery({
		queryKey: ["compareForm", compareWindow, compareAsOfGw],
		queryFn: () =>
			fetchForm({
				window: compareWindow,
				position: "",
				minMinutes: 0,
				minDelta: FORM_MIN_DELTA_FLOOR,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareDefconQuery = useQuery({
		queryKey: ["compareDefcon", compareWindow, compareAsOfGw],
		queryFn: () =>
			fetchDefcon({
				window: compareWindow,
				position: "",
				minMinutes: 0,
				minHitRate: 0,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareDefconProbabilityQuery = useQuery({
		queryKey: ["compareDefconProbability", compareAsOfGw],
		queryFn: () =>
			fetchDefconProbability({
				position: "",
				minGames: 0,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareClubQuery = useQuery({
		queryKey: ["compareClub", compareWindow, compareAsOfGw],
		queryFn: () =>
			fetchClubForm({ window: compareWindow, asOfGw: compareAsOfGw }),
		enabled: analyticsReady && compareOpen,
	});

	const comparePlayerOptions = useMemo(
		() =>
			[...(compareFormQuery.data ?? [])]
				.sort((left, right) => {
					const name = left.web_name.localeCompare(right.web_name);
					return name !== 0
						? name
						: (left.team_name ?? "").localeCompare(right.team_name ?? "");
				})
				.map((player) => ({
					element: player.element,
					web_name: player.web_name,
					position: player.position,
					team_name: player.team_name,
				})),
		[compareFormQuery.data],
	);
	const compareOptionElements = useMemo(
		() => new Set(comparePlayerOptions.map((player) => player.element)),
		[comparePlayerOptions],
	);

	useEffect(() => {
		if (!compareOpen || comparePlayerOptions.length === 0) {
			return;
		}
		const defaults = shortlist.length > 0 ? shortlist : ownedElementList;
		const defaultElement = defaults.find((element) =>
			compareOptionElements.has(element),
		);
		setCompareLeftElement((current) =>
			current !== null && compareOptionElements.has(current)
				? current
				: (defaultElement ?? null),
		);
	}, [
		compareOpen,
		compareOptionElements,
		comparePlayerOptions,
		ownedElementList,
		shortlist,
		setCompareLeftElement,
	]);

	useEffect(() => {
		if (!compareOpen || comparePlayerOptions.length === 0) {
			return;
		}
		setCompareRightElement((current) => {
			if (
				current !== null &&
				current !== compareLeftElement &&
				compareOptionElements.has(current)
			) {
				return current;
			}
			const defaults = shortlist.length > 0 ? shortlist : ownedElementList;
			const defaultElement = defaults.find(
				(element) =>
					element !== compareLeftElement && compareOptionElements.has(element),
			);
			return defaultElement ?? null;
		});
	}, [
		compareLeftElement,
		compareOpen,
		compareOptionElements,
		comparePlayerOptions,
		ownedElementList,
		shortlist,
		setCompareRightElement,
	]);

	const formColumns = useMemo(
		() =>
			buildFormColumns(
				computeRanges(formQuery.data ?? [], FORM_HEAT_KEYS),
				attackingMetrics,
			),
		[formQuery.data, attackingMetrics],
	);
	const defconColumns = useMemo(
		() =>
			buildDefconColumns(
				computeRanges(defconQuery.data ?? [], DEFCON_HEAT_KEYS),
			),
		[defconQuery.data],
	);
	const defconProbColumns = useMemo(
		() =>
			buildDefconProbColumns(
				computeRanges(defconProbQuery.data ?? [], DEFCON_PROB_HEAT_KEYS),
			),
		[defconProbQuery.data],
	);
	const clubColumns = useMemo(
		() =>
			buildClubColumns(
				computeRanges(clubQuery.data ?? [], CLUB_HEAT_KEYS),
				clubColumnVisibility,
			),
		[clubQuery.data, clubColumnVisibility],
	);

	const active =
		tab === "form"
			? formQuery
			: tab === "defcon"
				? defconQuery
				: tab === "defconProb"
					? defconProbQuery
					: tab === "clubs"
						? clubQuery
						: null;
	const activeLoading = active?.isPending;
	const activeError = active?.isError;

	// Team dropdown options derived from the loaded players, independent of the
	// client-side player/team filters so the list stays stable.
	const teamOptions = useMemo(() => {
		const rows = (active?.data ?? []) as Array<{ team_name: string | null }>;
		const names = rows
			.map((row) => row.team_name)
			.filter((name): name is string => name !== null);
		return Array.from(new Set(names)).sort();
	}, [active?.data]);

	// Keep table pages stable when shortlist or ownership changes only affect styling.
	const shortlistFilter = showShortlistedOnly ? shortlist : null;
	const ownedFilter = ownershipFilter === "all" ? null : ownedElements;
	const visibleFormRows = useMemo(() => {
		const players = filterPlayers(
			formQuery.data ?? [],
			playerSearch,
			teamFilter,
			position,
		);
		const transfers = filterTransferCandidates(players, transferFilters);
		const threats = filterAttackingThreatCandidates(
			transfers,
			attackingThreatFilters,
			attackingMetrics,
		);
		const owned = ownedFilter
			? filterOwnedPlayers(threats, ownedFilter, ownershipFilter)
			: threats;
		return filterShortlistedPlayers(
			owned,
			shortlistFilter ?? [],
			shortlistFilter !== null,
		);
	}, [
		formQuery.data,
		playerSearch,
		teamFilter,
		position,
		transferFilters,
		attackingThreatFilters,
		attackingMetrics,
		ownedFilter,
		ownershipFilter,
		shortlistFilter,
	]);
	const visibleDefconRows = useMemo(() => {
		// Searching for a player ignores the hit-rate floor so they always appear.
		const players = filterPlayers(
			defconQuery.data ?? [],
			playerSearch,
			teamFilter,
			position,
		).filter(
			(row) =>
				hasPlayerSearch || (row.window_defcon_hit_rate ?? 0) >= minHitRate,
		);
		const transfers = filterTransferCandidates(players, transferFilters);
		const owned = ownedFilter
			? filterOwnedPlayers(transfers, ownedFilter, ownershipFilter)
			: transfers;
		return filterShortlistedPlayers(
			owned,
			shortlistFilter ?? [],
			shortlistFilter !== null,
		);
	}, [
		defconQuery.data,
		playerSearch,
		teamFilter,
		position,
		hasPlayerSearch,
		minHitRate,
		transferFilters,
		ownedFilter,
		ownershipFilter,
		shortlistFilter,
	]);
	const visibleDefconProbRows = useMemo(() => {
		// Searching for a player ignores the games floor so they always appear.
		const players = filterPlayers(
			defconProbQuery.data ?? [],
			playerSearch,
			teamFilter,
			position,
		).filter((row) => hasPlayerSearch || row.games >= minGames);
		const transfers = filterTransferCandidates(players, transferFilters);
		const owned = ownedFilter
			? filterOwnedPlayers(transfers, ownedFilter, ownershipFilter)
			: transfers;
		return filterShortlistedPlayers(
			owned,
			shortlistFilter ?? [],
			shortlistFilter !== null,
		);
	}, [
		defconProbQuery.data,
		playerSearch,
		teamFilter,
		position,
		hasPlayerSearch,
		minGames,
		transferFilters,
		ownedFilter,
		ownershipFilter,
		shortlistFilter,
	]);
	const filteredClubs = useMemo(
		() =>
			(clubQuery.data ?? []).filter(
				(row) => teamFilter === "" || row.team_name === teamFilter,
			),
		[clubQuery.data, teamFilter],
	);
	const enabledAttackingMetricCount =
		Object.values(attackingMetrics).filter(Boolean).length;
	const showTransferFilters = isPlayerTab(tab);
	const isShortlistViewActive =
		isPlayerTab(tab) &&
		!isSquadViewActive &&
		showShortlistedOnly &&
		shortlist.length > 0;
	const isAllPlayersViewActive =
		isPlayerTab(tab) && !isSquadViewActive && !isShortlistViewActive;
	const hasActiveTransferFilters =
		isPlayerTab(tab) &&
		(minMinutes !== DEFAULT_MIN_MINUTES ||
			!transferFiltersMatchDefault(transferFilters));
	const hasActiveAttackingThreatFilters =
		tab === "form" &&
		!visibleAttackingThreatFiltersMatchDefault(
			attackingThreatFilters,
			attackingMetrics,
		);
	const hasActiveClubColumnGroups =
		tab === "clubs" && !clubColumnVisibilityMatchDefault(clubColumnVisibility);
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
	const playerRowClassName = (row: ShortlistablePlayer) => {
		const isShortlisted = shortlist.includes(row.element);
		const isOwned = ownedElements.has(row.element);
		if (isShortlisted && isOwned) {
			return "bg-teal-50/60";
		}
		if (isShortlisted) {
			return "bg-amber-50/50";
		}
		return isOwned ? "bg-sky-50/50" : "";
	};
	const playerStickyClassName = (row: ShortlistablePlayer) => {
		const isShortlisted = shortlist.includes(row.element);
		const isOwned = ownedElements.has(row.element);
		if (isShortlisted && isOwned) {
			return "bg-teal-50 group-hover:bg-teal-100/70";
		}
		if (isShortlisted) {
			return "bg-amber-50 group-hover:bg-amber-100/70";
		}
		return isOwned
			? "bg-sky-100 group-hover:bg-sky-100"
			: "bg-white group-hover:bg-zinc-50";
	};
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

	if (isPlayerTab(tab) && playerSearch.trim() !== "") {
		activeFilterChips.push({
			id: "player",
			label: `Player ${playerSearch.trim()}`,
			onClear: () => setPlayerSearch(DEFAULT_PLAYER_SEARCH),
		});
	}
	if (isPlayerTab(tab) && position !== DEFAULT_POSITION) {
		activeFilterChips.push({
			id: "position",
			label: `Position ${position}`,
			onClear: () => setPosition(DEFAULT_POSITION),
		});
	}
	if (tab !== "evidence" && teamFilter !== DEFAULT_TEAM_FILTER) {
		activeFilterChips.push({
			id: "team",
			label: `Team ${teamFilter}`,
			onClear: () => setTeamFilter(DEFAULT_TEAM_FILTER),
		});
	}
	if (tab !== "evidence" && tab !== "defconProb" && windowSizeChoice !== null) {
		activeFilterChips.push({
			id: "window",
			label: `Window ${windowSizeChoice}`,
			onClear: () => setWindowSize(null),
		});
	}
	if (
		isPlayerTab(tab) &&
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
	if (tab === "defconProb" && minGamesChoice !== null) {
		activeFilterChips.push({
			id: "min-games",
			label: `Games >= ${minGamesChoice}`,
			onClear: () => setMinGames(null),
		});
	}
	if (tab !== "evidence" && asOfGw !== DEFAULT_AS_OF_GW) {
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
	if (isPlayerTab(tab)) {
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
	if (hasActiveClubColumnGroups) {
		activeFilterChips.push({
			id: "club-columns",
			label: "Custom Columns",
			onClear: () => setClubColumnGroups({ ...DEFAULT_CLUB_COLUMNS }),
		});
	}
	if (isShortlistViewActive) {
		activeFilterChips.push({
			id: "shortlisted-only",
			label: "Shortlisted Only",
			onClear: () => setShowShortlistedOnly(false),
		});
	}
	if (isSquadViewActive) {
		activeFilterChips.push({
			id: "squad-view",
			label: "Squad View",
			onClear: () => setShowSquadView(false),
		});
	}
	if (isPlayerTab(tab) && ownershipFilter !== "all") {
		activeFilterChips.push({
			id: "owned-filter",
			label: ownershipFilter === "owned" ? "Owned Only" : "Not Owned",
			onClear: () => setOwnershipFilter("all"),
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
	const playerEmptyDescription =
		tab === "defconProb" && minGames > gameweeksPlayed
			? `Min Games ${minGames} exceeds the ${gameweeksPlayed} gameweeks played up to GW${gameweeksPlayed}. Lower it to see players.`
			: hasActiveFilters
				? "Try clearing active filters or lowering the strongest thresholds"
				: undefined;
	// A window spanning every gameweek played makes recent form identical to the
	// season baseline, so every delta is zero.
	const windowCoversSeason =
		tab !== "evidence" &&
		tab !== "defconProb" &&
		gameweeksPlayed > 0 &&
		windowSize >= gameweeksPlayed;
	const clubEmptyTitle = hasActiveFilters
		? "No Clubs Match These Filters"
		: "No Clubs Available";

	// The player tabs share every table behaviour except their rows and columns.
	function renderPlayerTable<T extends ShortlistablePlayer>(
		rows: T[],
		columns: ColumnDef<T>[],
	) {
		return (
			<DataTable
				data={rows}
				paginate
				initialPageSize={tablePageSize}
				onPageSizeChange={setTablePageSize}
				columns={columns}
				onRowClick={(row) => openPlayerDetail(row.element)}
				rowClassName={playerRowClassName}
				rowStickyClassName={playerStickyClassName}
				renderRowActions={renderShortlistAction}
				rowActionsHeader={"\u2605"}
				rowActionsHeaderLabel="Shortlist"
				rowActionsHeaderTooltip="Add or remove players from the shortlist"
				stickyDataColumns={4}
				emptyTitle={playerEmptyTitle}
				emptyDescription={playerEmptyDescription}
				emptyAction={clearActiveFiltersButton}
			/>
		);
	}

	if (meta.isPending) {
		return <SeasonStatus state="loading" />;
	}
	if (meta.isError || meta.data === undefined) {
		return <SeasonStatus state="error" />;
	}
	if (!analyticsReady) {
		return <SeasonStatus meta={meta.data} state="preseason" />;
	}

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<div className="app-shell mx-auto px-6 py-8">
				<header className="mb-6">
					<h1 className="font-semibold text-2xl">FPL Form Scout</h1>
					<p className="mt-1 max-w-3xl text-sm text-zinc-500">
						{tab === "evidence" ? (
							<>
								Surfaces backtested evidence for the scouting signals by
								replaying historic as-of gameweeks and scoring them against what
								happened next, with no look-ahead.
							</>
						) : (
							<>
								Surfaces players whose recent underlying output – expected goal
								involvement and DefCon hit rate over your chosen window – is
								outpacing their season-to-date baseline, alongside clubs whose
								attack or defence has shifted against its season baseline.
								Figures are point-in-time as of GW {asOfGw ?? latestGw}: only
								matches up to and including that gameweek are counted, with no
								look-ahead.
							</>
						)}
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

				<div
					className={`mb-4 rounded-lg border border-zinc-200 bg-white p-4 ${
						tab === "evidence" ? "hidden" : ""
					}`}
				>
					<div className="flex flex-wrap items-start gap-4">
						{isPlayerTab(tab) && (
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
							<ClubColumnChooser
								visibility={clubColumnVisibility}
								columnCount={clubColumns.length}
								onToggle={toggleClubColumnGroup}
								onReset={() => setClubColumnGroups({ ...DEFAULT_CLUB_COLUMNS })}
							/>
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
							<WindowSizeControl value={windowSize} onChange={setWindowSize} />
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

						{isPlayerTab(tab) ? (
							<form
								className="flex items-end gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									importFplTeam();
								}}
							>
								<label className={labelClass}>
									FPL Team ID
									<input
										type="number"
										min={1}
										inputMode="numeric"
										placeholder="e.g. 12345"
										className={`${inputClass} w-32`}
										value={fplTeamInput}
										onChange={(event) => setFplTeamInput(event.target.value)}
									/>
								</label>
								<button
									type="submit"
									disabled={!canImportFplTeam}
									className="mb-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-white"
								>
									Import
								</button>
								{fplTeamId !== null ? (
									<button
										type="button"
										className="mb-0 rounded-md px-2 py-1.5 font-medium text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
										onClick={clearFplTeam}
									>
										Clear
									</button>
								) : null}
							</form>
						) : null}
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
								<AttackingThreatFilterFields
									filters={attackingThreatFilters}
									visibleMetrics={attackingMetrics}
									hasActiveFilters={hasActiveAttackingThreatFilters}
									onChange={updateAttackingThreatFilter}
									onReset={resetAttackingThreatFilters}
								/>
							) : null}
							{showTransferFilters ? (
								<TransferFilterFields
									filters={transferFilters}
									minMinutes={minMinutes}
									showMinMinutes={tab !== "defconProb"}
									hasActiveFilters={hasActiveTransferFilters}
									onFilterChange={updateTransferFilter}
									onMinMinutesChange={setMinMinutes}
									onReset={resetTransferFilters}
								/>
							) : null}
						</div>
					) : null}
				</div>

				{hasActiveFilters ? (
					<ActiveFilterChips
						chips={activeFilterChips}
						clearAllButton={clearActiveFiltersButton}
					/>
				) : null}

				{windowCoversSeason ? (
					<p className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 text-sm">
						The {windowSize}-gameweek window covers every gameweek up to GW
						{gameweeksPlayed}, so recent and season figures match and deltas are
						zero.{" "}
						{gameweeksPlayed - 1 >= WINDOW_MIN
							? `Use a window of ${gameweeksPlayed - 1} or fewer to compare them.`
							: `Deltas become meaningful after GW${WINDOW_MIN}.`}
					</p>
				) : null}

				{isPlayerTab(tab) ? (
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<div className="flex flex-wrap items-center gap-2">
							{fplTeamId !== null ? (
								<span
									className={`rounded-md border px-2.5 py-1.5 font-medium text-xs ${
										fplTeamQuery.isError
											? "border-red-200 bg-red-50 text-red-700"
											: "border-sky-200 bg-sky-50 text-sky-800"
									}`}
								>
									{fplTeamQuery.isError || teamImportIdentityError
										? "Team Import Failed"
										: fplTeamQuery.isPending
											? "Loading Team..."
											: `Currently Owned (${ownedCount})`}
								</span>
							) : null}
							{fplTeamId !== null ? (
								<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-white p-0.5">
									<legend className="sr-only">Imported Team Filter</legend>
									{(
										[
											["all", "All"] as const,
											["owned", `Owned (${ownedCount})`] as const,
											["not-owned", "Not Owned"] as const,
										] satisfies Array<readonly [OwnershipFilter, string]>
									).map(([value, label]) => (
										<button
											key={value}
											type="button"
											aria-pressed={ownershipFilter === value}
											disabled={!hasImportedTeam && value !== "all"}
											className={`rounded px-3 py-1.5 font-medium text-sm ${
												ownershipFilter === value
													? "bg-zinc-900 text-white"
													: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
											}`}
											onClick={() => {
												setOwnershipFilter(value);
												setShowSquadView(false);
												setShowShortlistedOnly(false);
											}}
										>
											{label}
										</button>
									))}
								</fieldset>
							) : null}
							<button
								type="button"
								className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50"
								onClick={openComparePanel}
							>
								Compare Players
							</button>
							<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-white p-0.5">
								<legend className="sr-only">Player View</legend>
								<button
									type="button"
									aria-pressed={isAllPlayersViewActive}
									className={`rounded px-3 py-1.5 font-medium text-sm ${
										isAllPlayersViewActive
											? "bg-zinc-900 text-white"
											: "text-zinc-600 hover:bg-zinc-50"
									}`}
									onClick={() => {
										setShowSquadView(false);
										setShowShortlistedOnly(false);
									}}
								>
									All Players
								</button>
								<button
									type="button"
									aria-pressed={isSquadViewActive}
									disabled={!hasImportedTeam}
									className={`rounded px-3 py-1.5 font-medium text-sm ${
										isSquadViewActive
											? "bg-zinc-900 text-white"
											: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
									}`}
									onClick={() => {
										setShowSquadView(true);
										setShowShortlistedOnly(false);
										setOwnershipFilter("all");
									}}
								>
									Squad View ({ownedCount})
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
									onClick={() => {
										setShowSquadView(false);
										setShowShortlistedOnly(true);
									}}
								>
									Shortlisted ({shortlist.length})
								</button>
							</fieldset>
						</div>
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

				{tab === "evidence" ? (
					defconValidationQuery.isPending || clubValidationQuery.isPending ? (
						<p className="text-sm text-zinc-500">Loading...</p>
					) : defconValidationQuery.isError || clubValidationQuery.isError ? (
						<p className="text-red-600 text-sm">
							Failed to load - is the API running on port 8000?
						</p>
					) : (
						<ModelEvidence
							defconValidation={defconValidationQuery.data}
							clubValidation={clubValidationQuery.data ?? []}
						/>
					)
				) : isSquadViewActive ? (
					<SquadInspection
						picks={squadPicks}
						formPlayers={squadFormQuery.data ?? []}
						currentPlayers={squadCurrentContextQuery.data ?? []}
						defconPlayers={squadDefconProbabilityQuery.data ?? []}
						window={windowSize}
						asOfGw={asOfGw}
						latestGw={latestGw}
						loading={
							fplTeamQuery.isPending ||
							squadFormQuery.isPending ||
							squadCurrentContextQuery.isPending ||
							squadDefconProbabilityQuery.isPending
						}
						error={
							fplTeamQuery.isError ||
							teamImportIdentityError ||
							squadFormQuery.isError ||
							squadCurrentContextQuery.isError ||
							squadDefconProbabilityQuery.isError
						}
						onPlayerClick={openPlayerDetail}
					/>
				) : activeLoading ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : activeError ? (
					<p className="text-red-600 text-sm">
						Failed to load - is the API running on port 8000?
					</p>
				) : tab === "form" ? (
					<>
						<FormScatter players={visibleFormRows} />
						{renderPlayerTable(visibleFormRows, formColumns)}
					</>
				) : tab === "defcon" ? (
					renderPlayerTable(visibleDefconRows, defconColumns)
				) : tab === "defconProb" ? (
					renderPlayerTable(visibleDefconProbRows, defconProbColumns)
				) : (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Club form compares recent per-match output with the season
							baseline, then shows the next fixture run alongside it.
						</p>
						<DataTable
							data={filteredClubs}
							paginate
							initialPageSize={tablePageSize}
							onPageSizeChange={setTablePageSize}
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
				<Suspense fallback={<PanelFallback />}>
					<PlayerPanel
						key={selectedElement}
						element={selectedElement}
						window={playerWindow}
						season={playerSeason}
						asOfGw={asOfGw}
						onWindowChange={setPlayerWindow}
						onSeasonChange={setPlayerSeason}
						onClose={() => {
							setSelectedElement(null);
							setPlayerWindow(DEFAULT_PLAYER_WINDOW);
							setPlayerSeason(DEFAULT_PLAYER_SEASON);
						}}
					/>
				</Suspense>
			) : null}

			{compareOpen ? (
				<Suspense fallback={<PanelFallback />}>
					<PlayerComparePanel
						playerOptions={comparePlayerOptions}
						formPlayers={compareFormQuery.data ?? []}
						defconPlayers={compareDefconQuery.data ?? []}
						defconProbabilityPlayers={compareDefconProbabilityQuery.data ?? []}
						clubForms={compareClubQuery.data ?? []}
						contextLoading={
							compareFormQuery.isPending ||
							compareDefconQuery.isPending ||
							compareDefconProbabilityQuery.isPending ||
							compareClubQuery.isPending
						}
						contextError={
							compareFormQuery.isError ||
							compareDefconQuery.isError ||
							compareDefconProbabilityQuery.isError ||
							compareClubQuery.isError
						}
						leftElement={compareLeftElement}
						rightElement={compareRightElement}
						window={compareWindow}
						asOfGw={compareAsOfGw}
						latestGw={latestGw}
						onWindowChange={setCompareWindow}
						onAsOfGwChange={setCompareAsOfGw}
						onLeftChange={updateCompareLeft}
						onRightChange={updateCompareRight}
						onClose={closeComparePanel}
					/>
				</Suspense>
			) : null}
		</div>
	);
}

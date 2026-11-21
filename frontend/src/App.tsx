import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { DataTable } from "./components/DataTable";
import { FormScatter } from "./components/FormScatter";
import { PlayerToolbar } from "./components/PlayerToolbar";
import { SeasonStatus } from "./components/SeasonStatus";
import {
	type ReplacementRequest,
	SquadInspection,
} from "./components/SquadInspection";
import { ThemeToggle } from "./components/ThemeToggle";
import { useDashboardQueries } from "./hooks/useDashboardQueries";
import { useTheme } from "./hooks/useTheme";
import {
	buildActiveFilterChips,
	countMoreFilters,
} from "./lib/activeFilterChips";
import { evidenceSeasons } from "./lib/evidenceSeason";
import {
	filterAttackingThreatCandidates,
	filterOwnedPlayers,
	filterPlayers,
	filterShortlistedPlayers,
	filterTransferCandidates,
	formatPlayerCount,
} from "./lib/filters";
import { sortingFromParam, sortingToParam } from "./lib/tableSort";
import {
	type AttackingMetric,
	type AttackingThreatPeriod,
	type ClubColumnGroup,
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
	defaultTransferFilters,
	type FilterPreset,
	isPlayerTab,
	POSITIONS,
	type ShortlistablePlayer,
	TAB_LABELS,
	TABS,
	type TransferFilters,
	transferFiltersMatchDefault,
	visibleAttackingThreatFiltersMatchDefault,
	WINDOW_MIN,
} from "./state";
import { useUrlState } from "./urlState";

// Load secondary views and charts on demand to keep Recharts out of the initial bundle.
const ModelEvidence = lazy(() =>
	import("./components/ModelEvidence").then((m) => ({
		default: m.ModelEvidence,
	})),
);
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
			<div className="fixed inset-0 bg-black/40 dark:bg-black/70" />
			<div className="relative mx-auto mt-8 w-full max-w-4xl rounded-lg bg-white p-5 shadow-xl dark:border dark:border-zinc-800 dark:bg-zinc-900">
				<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
			</div>
		</div>
	);
}

export default function App() {
	const { theme, setTheme } = useTheme();
	const [tablePageSize, setTablePageSize] = useState(25);
	const [showMoreFilters, setShowMoreFilters] = useState(false);
	const [urlState, setUrlState] = useUrlState((restored) =>
		setFplTeamInput(restored.fplTeamId?.toString() ?? ""),
	);
	const {
		tab,
		playerSearch,
		teamFilter,
		position,
		minMinutes,
		minHitRate,
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
		sort,
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
		evidenceSeason: setEvidenceSeasonChoice,
		sort: setSort,
	} = setUrlState;
	// The team ID input is a draft until imported, so it stays out of the URL.
	const [fplTeamInput, setFplTeamInput] = useState(
		urlState.fplTeamId?.toString() ?? "",
	);

	const {
		meta,
		analyticsReady,
		latestGw,
		liveSeason,
		evidenceSeason,
		gameweeksPlayed,
		windowSize,
		minGames,
		isSquadViewActive,
		fplTeamQuery,
		teamImportIdentityError,
		ownedElements,
		ownedElementList,
		ownedCount,
		hasImportedTeam,
		squadPicks,
		formQuery,
		defconQuery,
		defconProbQuery,
		clubQuery,
		defconValidationQuery,
		formValidationQuery,
		clubValidationQuery,
		squadFormQuery,
		squadCurrentContextQuery,
		squadDefconProbabilityQuery,
		compareFormQuery,
		compareDefconQuery,
		compareDefconProbabilityQuery,
		compareClubQuery,
		comparePlayerOptions,
		compareOptionElements,
		active,
		teamOptions,
	} = useDashboardQueries(urlState);

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
				return { ...current, maxPrice: 7.5 };
			}
			if (preset === "differential") {
				return { ...current, maxOwnership: 10 };
			}
			return { ...current, maxFdr: 3 };
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

	function findReplacement(request: ReplacementRequest) {
		if (tab !== "form") {
			setTab("form");
			setSort(null);
		}
		setShowSquadView(false);
		const nextPosition = POSITIONS.find((value) => value === request.position);
		setPosition(nextPosition ?? DEFAULT_POSITION);
		setTransferFilters((current) => ({
			...current,
			maxPrice: request.maxPrice ?? null,
		}));
		setOwnershipFilter("not-owned");
		setPlayerSearch(DEFAULT_PLAYER_SEARCH);
		setTeamFilter(DEFAULT_TEAM_FILTER);
		setShowShortlistedOnly(false);
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

	function swapComparePlayers() {
		setCompareLeftElement(compareRightElement);
		setCompareRightElement(compareLeftElement);
	}

	function openPlayerFromCompare(element: number) {
		setCompareOpen(false);
		openPlayerDetail(element);
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

	const hasPlayerSearch = playerSearch.trim() !== "";
	const parsedFplTeamInput = Number(fplTeamInput);
	const canImportFplTeam =
		Number.isInteger(parsedFplTeamInput) && parsedFplTeamInput > 0;

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
	const tableSorting = useMemo(() => sortingFromParam(sort), [sort]);
	function updateTableSorting(next: SortingState) {
		setSort(sortingToParam(next));
	}

	const hasMoreFilters = tab === "form" || showTransferFilters;
	const moreFilterCount = countMoreFilters({
		tab,
		attackingMetrics,
		attackingThreatFilters,
		transferFilters,
		minMinutes,
	});
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
			return "bg-teal-50/60 dark:bg-teal-950/40";
		}
		if (isShortlisted) {
			return "bg-amber-50/50 dark:bg-amber-950/35";
		}
		return isOwned ? "bg-sky-50/50 dark:bg-sky-950/35" : "";
	};
	const playerStickyClassName = (row: ShortlistablePlayer) => {
		const isShortlisted = shortlist.includes(row.element);
		const isOwned = ownedElements.has(row.element);
		if (isShortlisted && isOwned) {
			return "bg-teal-50 group-hover:bg-teal-100/70 dark:bg-teal-950 dark:group-hover:bg-teal-900";
		}
		if (isShortlisted) {
			return "bg-amber-50 group-hover:bg-amber-100/70 dark:bg-amber-950 dark:group-hover:bg-amber-900";
		}
		return isOwned
			? "bg-sky-100 group-hover:bg-sky-100 dark:bg-sky-950 dark:group-hover:bg-sky-900"
			: "bg-white group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800";
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
						? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
						: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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

	const activeFilterChips = buildActiveFilterChips({
		state: urlState,
		setters: setUrlState,
		isShortlistViewActive,
		isSquadViewActive,
		updateAttackingThreatFilter,
		updateTransferFilter,
	});
	const hasActiveFilters = activeFilterChips.length > 0;
	const clearActiveFiltersButton = hasActiveFilters ? (
		<button
			type="button"
			className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-medium text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
				sorting={tableSorting}
				onSortingChange={updateTableSorting}
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

	const themeToggle = <ThemeToggle theme={theme} onChange={setTheme} />;

	if (meta.isPending) {
		return <SeasonStatus state="loading" headerAction={themeToggle} />;
	}
	if (meta.isError || meta.data === undefined) {
		return (
			<SeasonStatus
				state="error"
				headerAction={themeToggle}
				onRetry={() => {
					void meta.refetch();
				}}
			/>
		);
	}
	if (!analyticsReady) {
		return (
			<SeasonStatus
				meta={meta.data}
				state="preseason"
				headerAction={themeToggle}
			/>
		);
	}

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
			<div className="app-shell mx-auto px-6 py-8">
				<header className="mb-6">
					<div className="flex items-start justify-between gap-4">
						<h1 className="font-semibold text-2xl">FPL Analytics Engine</h1>
						{themeToggle}
					</div>
					{/* Phones get a one-line summary so the table starts nearer the top. */}
					<p className="mt-1 text-sm text-zinc-500 sm:hidden dark:text-zinc-400">
						{tab === "evidence"
							? "Backtested evidence, replayed with no look-ahead."
							: `Point-in-time form as of GW ${asOfGw ?? latestGw}, with no look-ahead.`}
					</p>
					<p className="mt-1 hidden max-w-3xl text-sm text-zinc-500 sm:block dark:text-zinc-400">
						{tab === "evidence" ? (
							<>
								Surfaces backtested evidence for the scouting signals by
								replaying historic as-of gameweeks and scoring them against what
								happened next, with no look-ahead.
							</>
						) : (
							<>
								Attacking Form ranks players by projected xGI per gameweek – an
								estimated underlying rate, pulled towards last season's, times
								expected minutes. DefCon Form ranks recent hit rates, DefCon
								Probability ranks the calibrated chance of a hit given 60+
								minutes, and Club Form shows whose attack or defence has shifted
								against its season baseline. Figures are point-in-time as of GW{" "}
								{asOfGw ?? latestGw}: only matches up to and including that
								gameweek are counted, with no look-ahead.
							</>
						)}
					</p>
				</header>

				{/* Scroll the tabs sideways on narrow screens rather than widening the page;
				    the padding keeps the focus rings from being clipped. */}
				<div className="mb-4 flex gap-2 overflow-x-auto p-px">
					{TABS.map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => {
								// Each tab has different columns, so a sort does not carry over.
								if (value !== tab) {
									setTab(value);
									setSort(null);
								}
							}}
							className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-sm ${
								tab === value
									? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
									: "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"
							}`}
						>
							{TAB_LABELS[value]}
						</button>
					))}
				</div>

				<DashboardFilterBar
					tab={tab}
					playerSearch={playerSearch}
					position={position}
					teamFilter={teamFilter}
					teamOptions={teamOptions}
					clubColumnVisibility={clubColumnVisibility}
					clubColumnCount={clubColumns.length}
					attackingMetrics={attackingMetrics}
					enabledAttackingMetricCount={enabledAttackingMetricCount}
					minHitRate={minHitRate}
					minGames={minGames}
					windowSize={windowSize}
					asOfGw={asOfGw}
					latestGw={latestGw}
					fplTeamId={fplTeamId}
					fplTeamInput={fplTeamInput}
					canImportFplTeam={canImportFplTeam}
					showMoreFilters={showMoreFilters}
					hasMoreFilters={hasMoreFilters}
					moreFilterCount={moreFilterCount}
					attackingThreatFilters={attackingThreatFilters}
					hasActiveAttackingThreatFilters={hasActiveAttackingThreatFilters}
					transferFilters={transferFilters}
					minMinutes={minMinutes}
					hasActiveTransferFilters={hasActiveTransferFilters}
					onPlayerSearchChange={setPlayerSearch}
					onPositionChange={setPosition}
					onTeamFilterChange={setTeamFilter}
					onToggleClubColumnGroup={toggleClubColumnGroup}
					onResetClubColumns={() =>
						setClubColumnGroups({ ...DEFAULT_CLUB_COLUMNS })
					}
					onToggleAttackingMetric={toggleAttackingMetric}
					onMinHitRateChange={setMinHitRate}
					onMinGamesChange={setMinGames}
					onWindowSizeChange={setWindowSize}
					onAsOfGwChange={setAsOfGw}
					onFplTeamInputChange={setFplTeamInput}
					onImportFplTeam={importFplTeam}
					onClearFplTeam={clearFplTeam}
					onToggleMoreFilters={() => setShowMoreFilters((current) => !current)}
					onApplyFilterPreset={applyFilterPreset}
					onAttackingThreatFilterChange={updateAttackingThreatFilter}
					onResetAttackingThreatFilters={resetAttackingThreatFilters}
					onTransferFilterChange={updateTransferFilter}
					onMinMinutesChange={setMinMinutes}
					onResetTransferFilters={resetTransferFilters}
				/>

				{hasActiveFilters ? (
					<ActiveFilterChips
						chips={activeFilterChips}
						clearAllButton={clearActiveFiltersButton}
					/>
				) : null}

				{windowCoversSeason ? (
					<p className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 text-sm dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-200">
						The {windowSize}-gameweek window covers every gameweek up to GW
						{gameweeksPlayed}, so recent and season figures match and deltas are
						zero.{" "}
						{gameweeksPlayed - 1 >= WINDOW_MIN
							? `Use a window of ${gameweeksPlayed - 1} or fewer to compare them.`
							: `Deltas become meaningful after GW${WINDOW_MIN}.`}
					</p>
				) : null}

				{isPlayerTab(tab) ? (
					<PlayerToolbar
						fplTeamId={fplTeamId}
						teamImportPending={fplTeamQuery.isPending}
						teamImportError={fplTeamQuery.isError || teamImportIdentityError}
						ownedCount={ownedCount}
						hasImportedTeam={hasImportedTeam}
						ownershipFilter={ownershipFilter}
						shortlistCount={shortlist.length}
						isAllPlayersViewActive={isAllPlayersViewActive}
						isSquadViewActive={isSquadViewActive}
						isShortlistViewActive={isShortlistViewActive}
						shortlistSummary={shortlistSummary}
						onSelectOwnershipFilter={(value) => {
							setOwnershipFilter(value);
							setShowSquadView(false);
							setShowShortlistedOnly(false);
						}}
						onOpenCompare={openComparePanel}
						onSelectAllPlayers={() => {
							setShowSquadView(false);
							setShowShortlistedOnly(false);
						}}
						onSelectSquadView={() => {
							setShowSquadView(true);
							setShowShortlistedOnly(false);
							setOwnershipFilter("all");
						}}
						onSelectShortlistView={() => {
							setShowSquadView(false);
							setShowShortlistedOnly(true);
						}}
						onExitShortlistView={() => setShowShortlistedOnly(false)}
						onClearShortlist={() => {
							setShortlist([]);
							setShowShortlistedOnly(false);
						}}
					/>
				) : null}

				{tab === "evidence" ? (
					defconValidationQuery.isPending ||
					clubValidationQuery.isPending ||
					formValidationQuery.isPending ? (
						<p className="text-sm text-zinc-500 dark:text-zinc-400">
							Loading...
						</p>
					) : defconValidationQuery.isError ||
						clubValidationQuery.isError ||
						formValidationQuery.isError ? (
						<div className="flex items-center gap-3">
							<p className="text-red-600 text-sm dark:text-red-400">
								Failed to load research data. Try again in a moment.
							</p>
							<button
								type="button"
								className="rounded-md px-2.5 py-1 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
								onClick={() => {
									if (defconValidationQuery.isError) {
										void defconValidationQuery.refetch();
									}
									if (clubValidationQuery.isError) {
										void clubValidationQuery.refetch();
									}
									if (formValidationQuery.isError) {
										void formValidationQuery.refetch();
									}
								}}
							>
								Retry
							</button>
						</div>
					) : (
						<Suspense
							fallback={
								<p className="text-sm text-zinc-500 dark:text-zinc-400">
									Loading...
								</p>
							}
						>
							<ModelEvidence
								formValidation={formValidationQuery.data}
								defconValidation={defconValidationQuery.data}
								clubValidation={clubValidationQuery.data ?? []}
								season={evidenceSeason}
								seasons={evidenceSeasons(liveSeason)}
								liveSeason={liveSeason}
								isLoadingSeason={
									defconValidationQuery.isPlaceholderData ||
									clubValidationQuery.isPlaceholderData ||
									formValidationQuery.isPlaceholderData
								}
								onSeasonChange={setEvidenceSeasonChoice}
							/>
						</Suspense>
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
						onRetry={() => {
							if (fplTeamQuery.isError || teamImportIdentityError) {
								void fplTeamQuery.refetch();
							}
							if (squadFormQuery.isError) {
								void squadFormQuery.refetch();
							}
							if (squadCurrentContextQuery.isError) {
								void squadCurrentContextQuery.refetch();
							}
							if (squadDefconProbabilityQuery.isError) {
								void squadDefconProbabilityQuery.refetch();
							}
						}}
						onPlayerClick={openPlayerDetail}
						onFindReplacement={findReplacement}
					/>
				) : active?.isPending ? (
					<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
				) : active?.isError ? (
					<div className="flex items-center gap-3">
						<p className="text-red-600 text-sm dark:text-red-400">
							Failed to load data. Try again in a moment.
						</p>
						<button
							type="button"
							className="rounded-md px-2.5 py-1 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
							onClick={() => {
								void active.refetch();
							}}
						>
							Retry
						</button>
					</div>
				) : tab === "form" ? (
					<>
						{/* A 200-point scatter is unreadable at phone widths. */}
						<div className="hidden sm:block">
							<FormScatter players={visibleFormRows} />
						</div>
						{renderPlayerTable(visibleFormRows, formColumns)}
					</>
				) : tab === "defcon" ? (
					renderPlayerTable(visibleDefconRows, defconColumns)
				) : tab === "defconProb" ? (
					renderPlayerTable(visibleDefconProbRows, defconProbColumns)
				) : (
					<>
						<p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
							Club form compares recent per-match output with the season
							baseline, then shows the next fixture run alongside it.
						</p>
						<DataTable
							data={filteredClubs}
							paginate
							initialPageSize={tablePageSize}
							onPageSizeChange={setTablePageSize}
							sorting={tableSorting}
							onSortingChange={updateTableSorting}
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
						onSwap={swapComparePlayers}
						onOpenPlayer={openPlayerFromCompare}
						onRetryContext={() => {
							if (compareFormQuery.isError) {
								void compareFormQuery.refetch();
							}
							if (compareDefconQuery.isError) {
								void compareDefconQuery.refetch();
							}
							if (compareDefconProbabilityQuery.isError) {
								void compareDefconProbabilityQuery.refetch();
							}
							if (compareClubQuery.isError) {
								void compareClubQuery.refetch();
							}
						}}
						onClose={() => setCompareOpen(false)}
					/>
				</Suspense>
			) : null}
		</div>
	);
}

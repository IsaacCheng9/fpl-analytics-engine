import {
	type ActiveFilterChip,
	ATTACKING_METRIC_COLUMN_ORDER,
	ATTACKING_METRIC_LABELS,
	ATTACKING_METRICS,
	ATTACKING_THREAT_PERIOD_LABELS,
	ATTACKING_THREAT_PERIODS,
	type AttackingMetric,
	type AttackingMetricVisibility,
	type AttackingThreatFilters,
	type AttackingThreatPeriod,
	clubColumnVisibilityMatchDefault,
	DEFAULT_AS_OF_GW,
	DEFAULT_ATTACKING_METRICS,
	DEFAULT_CLUB_COLUMNS,
	DEFAULT_MIN_HIT_RATE,
	DEFAULT_MIN_MINUTES,
	DEFAULT_PLAYER_SEARCH,
	DEFAULT_POSITION,
	DEFAULT_TEAM_FILTER,
	isPlayerTab,
	metricsMatchDefault,
	type OwnershipFilter,
	type Tab,
	type TransferFilters,
} from "../state";
import type { UrlState, UrlStateSetters } from "../urlState";
import { fmtNum, fmtPctPoints, fmtPrice } from "./format";

export function countMoreFilters({
	tab,
	attackingMetrics,
	attackingThreatFilters,
	transferFilters,
	minMinutes,
}: {
	tab: Tab;
	attackingMetrics: AttackingMetricVisibility;
	attackingThreatFilters: AttackingThreatFilters;
	transferFilters: TransferFilters;
	minMinutes: number;
}): number {
	const showTransferFilters = isPlayerTab(tab);
	return (
		(tab === "form"
			? ATTACKING_METRICS.filter((metric) => attackingMetrics[metric]).flatMap(
					(metric) =>
						ATTACKING_THREAT_PERIODS.filter(
							(period) => attackingThreatFilters[metric][period] !== null,
						),
				).length
			: 0) +
		(showTransferFilters
			? Object.values(transferFilters).filter(
					(value) => value !== null && value !== false,
				).length +
				(tab !== "defconProb" && minMinutes !== DEFAULT_MIN_MINUTES ? 1 : 0)
			: 0)
	);
}

export function buildActiveFilterChips({
	state,
	setters,
	isShortlistViewActive,
	isSquadViewActive,
	updateAttackingThreatFilter,
	updateTransferFilter,
}: {
	state: UrlState;
	setters: Pick<
		UrlStateSetters,
		| "playerSearch"
		| "position"
		| "teamFilter"
		| "windowSize"
		| "minMinutes"
		| "minHitRate"
		| "minGames"
		| "asOfGw"
		| "attackingMetrics"
		| "clubColumnVisibility"
		| "showShortlistedOnly"
		| "showSquadView"
		| "ownershipFilter"
	>;
	isShortlistViewActive: boolean;
	isSquadViewActive: boolean;
	updateAttackingThreatFilter: (
		metric: AttackingMetric,
		period: AttackingThreatPeriod,
		value: number | null,
	) => void;
	updateTransferFilter: <K extends keyof TransferFilters>(
		filter: K,
		value: TransferFilters[K],
	) => void;
}): ActiveFilterChip[] {
	const {
		tab,
		playerSearch,
		position,
		teamFilter,
		windowSize: windowSizeChoice,
		minMinutes,
		minHitRate,
		minGames: minGamesChoice,
		asOfGw,
		attackingMetrics,
		attackingThreatFilters,
		clubColumnVisibility,
		transferFilters,
		ownershipFilter,
	} = state;
	const chips: ActiveFilterChip[] = [];

	if (isPlayerTab(tab) && playerSearch.trim() !== "") {
		chips.push({
			id: "player",
			label: `Player ${playerSearch.trim()}`,
			onClear: () => setters.playerSearch(DEFAULT_PLAYER_SEARCH),
		});
	}
	if (isPlayerTab(tab) && position !== DEFAULT_POSITION) {
		chips.push({
			id: "position",
			label: `Position ${position}`,
			onClear: () => setters.position(DEFAULT_POSITION),
		});
	}
	if (tab !== "evidence" && teamFilter !== DEFAULT_TEAM_FILTER) {
		chips.push({
			id: "team",
			label: `Team ${teamFilter}`,
			onClear: () => setters.teamFilter(DEFAULT_TEAM_FILTER),
		});
	}
	if (tab !== "evidence" && tab !== "defconProb" && windowSizeChoice !== null) {
		chips.push({
			id: "window",
			label: `Window ${windowSizeChoice}`,
			onClear: () => setters.windowSize(null),
		});
	}
	if (
		isPlayerTab(tab) &&
		tab !== "defconProb" &&
		minMinutes !== DEFAULT_MIN_MINUTES
	) {
		chips.push({
			id: "min-minutes",
			label: `Minutes >= ${minMinutes}`,
			onClear: () => setters.minMinutes(DEFAULT_MIN_MINUTES),
		});
	}
	if (tab === "defcon" && minHitRate !== DEFAULT_MIN_HIT_RATE) {
		chips.push({
			id: "min-hit-rate",
			label: `Hit Rate >= ${Math.round(minHitRate * 100)}%`,
			onClear: () => setters.minHitRate(DEFAULT_MIN_HIT_RATE),
		});
	}
	if (tab === "defconProb" && minGamesChoice !== null) {
		chips.push({
			id: "min-games",
			label: `Games >= ${minGamesChoice}`,
			onClear: () => setters.minGames(null),
		});
	}
	if (tab !== "evidence" && asOfGw !== DEFAULT_AS_OF_GW) {
		chips.push({
			id: "as-of-gw",
			label: `As Of GW ${asOfGw}`,
			onClear: () => setters.asOfGw(DEFAULT_AS_OF_GW),
		});
	}
	if (tab === "form" && !metricsMatchDefault(attackingMetrics)) {
		chips.push({
			id: "metrics",
			label: `Metrics ${ATTACKING_METRIC_COLUMN_ORDER.filter(
				(metric) => attackingMetrics[metric],
			)
				.map((metric) => ATTACKING_METRIC_LABELS[metric])
				.join(", ")}`,
			onClear: () => setters.attackingMetrics({ ...DEFAULT_ATTACKING_METRICS }),
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
					chips.push({
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
			chips.push({
				id: "max-price",
				label: `Price <= ${fmtPrice(transferFilters.maxPrice)}`,
				onClear: () => updateTransferFilter("maxPrice", null),
			});
		}
		if (transferFilters.maxFdr !== null) {
			chips.push({
				id: "max-fdr",
				label: `FDR <= ${fmtNum(transferFilters.maxFdr, 1)}`,
				onClear: () => updateTransferFilter("maxFdr", null),
			});
		}
		if (transferFilters.minMinsPerAppearance !== null) {
			chips.push({
				id: "min-mins-app",
				label: `Mins/App >= ${fmtNum(transferFilters.minMinsPerAppearance, 0)}`,
				onClear: () => updateTransferFilter("minMinsPerAppearance", null),
			});
		}
		if (transferFilters.minStartPct !== null) {
			chips.push({
				id: "min-start",
				label: `Start >= ${fmtPctPoints(transferFilters.minStartPct, 0)}`,
				onClear: () => updateTransferFilter("minStartPct", null),
			});
		}
		if (transferFilters.minOwnership !== null) {
			chips.push({
				id: "min-owned",
				label: `Owned >= ${fmtPctPoints(transferFilters.minOwnership, 0)}`,
				onClear: () => updateTransferFilter("minOwnership", null),
			});
		}
		if (transferFilters.maxOwnership !== null) {
			chips.push({
				id: "max-owned",
				label: `Owned <= ${fmtPctPoints(transferFilters.maxOwnership, 0)}`,
				onClear: () => updateTransferFilter("maxOwnership", null),
			});
		}
		if (transferFilters.excludeUnavailable) {
			chips.push({
				id: "exclude-unavailable",
				label: "Exclude Unavailable",
				onClear: () => updateTransferFilter("excludeUnavailable", false),
			});
		}
		if (transferFilters.penaltiesOnly) {
			chips.push({
				id: "penalties-only",
				label: "Penalties Only",
				onClear: () => updateTransferFilter("penaltiesOnly", false),
			});
		}
	}
	if (
		tab === "clubs" &&
		!clubColumnVisibilityMatchDefault(clubColumnVisibility)
	) {
		chips.push({
			id: "club-columns",
			label: "Custom Columns",
			onClear: () => setters.clubColumnVisibility({ ...DEFAULT_CLUB_COLUMNS }),
		});
	}
	if (isShortlistViewActive) {
		chips.push({
			id: "shortlisted-only",
			label: "Shortlisted Only",
			onClear: () => setters.showShortlistedOnly(false),
		});
	}
	if (isSquadViewActive) {
		chips.push({
			id: "squad-view",
			label: "Squad View",
			onClear: () => setters.showSquadView(false),
		});
	}
	if (isPlayerTab(tab) && ownershipFilter !== "all") {
		chips.push({
			id: "owned-filter",
			label: ownershipFilter === "owned" ? "Owned Only" : "Not Owned",
			onClear: () => setters.ownershipFilter("all" satisfies OwnershipFilter),
		});
	}

	return chips;
}

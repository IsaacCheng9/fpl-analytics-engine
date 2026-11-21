import type { FormPlayer, Position } from "../api";
import {
	ATTACKING_METRICS,
	ATTACKING_THREAT_FILTER_KEYS,
	ATTACKING_THREAT_PERIODS,
	type AttackingMetricVisibility,
	type AttackingThreatFilters,
	type OwnershipFilter,
	type TransferFilterRow,
	type TransferFilters,
	transferFiltersMatchDefault,
	visibleAttackingThreatFiltersMatchDefault,
} from "../state";
import { isUnavailableStatus } from "./playerStatus";

// Apply the client-side player, team and position filters so the chart and
// table stay in sync from a single league-wide source.
export function filterPlayers<
	T extends {
		web_name: string;
		team_name: string | null;
		position: string | null;
	},
>(
	rows: T[],
	playerSearch: string,
	teamFilter: string,
	position: Position | "",
): T[] {
	const query = playerSearch.trim().toLowerCase();
	return rows.filter(
		(row) =>
			(query === "" || row.web_name.toLowerCase().includes(query)) &&
			(teamFilter === "" || row.team_name === teamFilter) &&
			(position === "" || row.position === position),
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
export function filterTransferCandidates<T extends TransferFilterRow>(
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
			passesMax(row.current_ownership, filters.maxOwnership) &&
			(!filters.excludeUnavailable || !isUnavailableStatus(row.status)) &&
			(!filters.penaltiesOnly || row.penalties_order === 1),
	);
}

export function filterAttackingThreatCandidates(
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

export function filterShortlistedPlayers<T extends { element: number }>(
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

export function filterOwnedPlayers<T extends { element: number }>(
	rows: T[],
	ownedElements: Set<number>,
	ownershipFilter: OwnershipFilter,
): T[] {
	if (ownershipFilter === "all") {
		return rows;
	}
	return rows.filter((row) => {
		const isOwned = ownedElements.has(row.element);
		return ownershipFilter === "owned" ? isOwned : !isOwned;
	});
}

export function formatPlayerCount(count: number): string {
	return `${count} ${count === 1 ? "player" : "players"}`;
}

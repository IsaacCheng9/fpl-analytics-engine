export type PlayerLiveStatus = {
	status?: string | null;
	chance_of_playing_next_round?: number | null;
	news?: string | null;
	yellow_cards?: number | null;
	penalties_order?: number | null;
	corners_order?: number | null;
	direct_freekicks_order?: number | null;
};

export type StatusTone = "risk" | "watch";

export type StatusBadge = {
	label: string;
	tone: StatusTone;
	tooltip: string;
};

export type SetPieceDuty = {
	code: "P" | "C" | "FK";
	label: string;
	tooltip: string;
};

export const UNAVAILABLE_STATUSES = new Set(["i", "s", "u", "n"]);

const STATUS_LABELS: Record<string, string> = {
	a: "Available",
	d: "Doubtful",
	i: "Injured",
	s: "Suspended",
	u: "Unavailable",
	n: "Unavailable",
};

const UNAVAILABLE_SHORT_LABELS: Record<string, string> = {
	i: "Inj",
	s: "Susp",
	u: "Out",
	n: "Out",
};

export function isUnavailableStatus(
	status: string | null | undefined,
): boolean {
	return status != null && UNAVAILABLE_STATUSES.has(status);
}

export function isCardRisk(yellowCards: number | null | undefined): boolean {
	return yellowCards === 4 || yellowCards === 9;
}

export function statusLabel(status: string | null | undefined): string | null {
	if (!status) {
		return null;
	}
	return STATUS_LABELS[status] ?? null;
}

export function availabilityTooltip(player: PlayerLiveStatus): string | null {
	const label = statusLabel(player.status);
	if (!label) {
		return null;
	}
	const parts = [label];
	if (typeof player.chance_of_playing_next_round === "number") {
		parts.push(`${player.chance_of_playing_next_round}% chance`);
	}
	const header = parts.join(" - ");
	return player.news ? `${header}: ${player.news}` : header;
}

export function availabilityBadge(
	player: PlayerLiveStatus,
): StatusBadge | null {
	const { status, chance_of_playing_next_round: chance } = player;
	if (!status || status === "a") {
		return null;
	}
	const tooltip = availabilityTooltip(player);
	if (!tooltip) {
		return null;
	}
	if (isUnavailableStatus(status)) {
		return {
			label: UNAVAILABLE_SHORT_LABELS[status] ?? "Out",
			tone: "risk",
			tooltip,
		};
	}
	if (status === "d") {
		return {
			label: typeof chance === "number" ? `${chance}%` : "Doubt",
			tone: "watch",
			tooltip,
		};
	}
	return null;
}

export function cardRiskBadge(
	yellowCards: number | null | undefined,
): StatusBadge | null {
	if (!isCardRisk(yellowCards)) {
		return null;
	}
	return {
		label: `${yellowCards} YC`,
		tone: "watch",
		tooltip: `${yellowCards} yellow cards - suspension watch`,
	};
}

export function setPieceDuties(player: PlayerLiveStatus): SetPieceDuty[] {
	const duties: SetPieceDuty[] = [];
	if (player.penalties_order === 1) {
		duties.push({
			code: "P",
			label: "Penalties",
			tooltip: "Primary penalty taker",
		});
	}
	if (player.corners_order === 1) {
		duties.push({
			code: "C",
			label: "Corners",
			tooltip: "Primary corner and indirect free-kick taker",
		});
	}
	if (player.direct_freekicks_order === 1) {
		duties.push({
			code: "FK",
			label: "Free Kicks",
			tooltip: "Primary direct free-kick taker",
		});
	}
	return duties;
}

export function hasLiveStatusSnapshot(player: PlayerLiveStatus): boolean {
	return (
		player.status != null ||
		player.chance_of_playing_next_round != null ||
		player.news != null ||
		player.yellow_cards != null ||
		player.penalties_order != null ||
		player.corners_order != null ||
		player.direct_freekicks_order != null
	);
}

export function formatAvailabilitySummary(player: PlayerLiveStatus): string {
	const label = statusLabel(player.status);
	if (!label) {
		return "-";
	}
	const cardSuffix = isCardRisk(player.yellow_cards)
		? `${player.yellow_cards} YC - suspension watch`
		: null;
	if (player.status === "a") {
		return cardSuffix ? `${label} (${cardSuffix})` : label;
	}
	const details: string[] = [];
	if (typeof player.chance_of_playing_next_round === "number") {
		details.push(`${player.chance_of_playing_next_round}%`);
	}
	if (cardSuffix) {
		details.push(cardSuffix);
	}
	const detailText = details.length > 0 ? ` (${details.join(", ")})` : "";
	const newsText = player.news ? ` - ${player.news}` : "";
	return `${label}${detailText}${newsText}`;
}

export function formatSetPiecesSummary(player: PlayerLiveStatus): string {
	const duties = setPieceDuties(player);
	if (duties.length > 0) {
		return duties.map((duty) => duty.label).join(", ");
	}
	return hasLiveStatusSnapshot(player) ? "None" : "-";
}

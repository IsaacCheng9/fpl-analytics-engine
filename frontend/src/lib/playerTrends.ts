import type { PlayerGameweek } from "../api";

// Every fixture in a double gameweek carries the same end-of-gameweek rolling
// figures, so plot one point per round instead of duplicating the round.
export function rollingChartRows(
	gameweeks: PlayerGameweek[],
): PlayerGameweek[] {
	const byRound = new Map<number, PlayerGameweek>();
	for (const gameweek of gameweeks) {
		byRound.set(gameweek.round, gameweek);
	}
	return [...byRound.values()];
}

// Average defensive contributions per appearance (0-minute games excluded),
// matching the rolling mean's treatment of missing and bench rows.
export function meanDefensiveContribution(
	gameweeks: PlayerGameweek[],
): number | null {
	const values = gameweeks
		.filter((gameweek) => gameweek.minutes > 0)
		.map((gameweek) => gameweek.defensive_contribution)
		.filter((value): value is number => value !== null);
	if (values.length === 0) {
		return null;
	}
	return values.reduce((total, value) => total + value, 0) / values.length;
}

export interface CompareTrendPoint {
	round: number;
	leftXgi90: number | null;
	rightXgi90: number | null;
	leftDefcon: number | null;
	rightDefcon: number | null;
}

// Align two players' deduplicated gameweeks onto a sorted shared round timeline
// so blank gameweeks stay absent and show as gaps on a numeric X-axis.
export function alignCompareTrends(
	leftGameweeks: PlayerGameweek[],
	rightGameweeks: PlayerGameweek[],
): CompareTrendPoint[] {
	const leftByRound = new Map(
		rollingChartRows(leftGameweeks).map((row) => [row.round, row]),
	);
	const rightByRound = new Map(
		rollingChartRows(rightGameweeks).map((row) => [row.round, row]),
	);
	const rounds = Array.from(
		new Set([...leftByRound.keys(), ...rightByRound.keys()]),
	).sort((a, b) => a - b);

	return rounds.map((round) => {
		const left = leftByRound.get(round);
		const right = rightByRound.get(round);
		return {
			round,
			leftXgi90: left?.rolling_xgi90 ?? null,
			rightXgi90: right?.rolling_xgi90 ?? null,
			leftDefcon: left?.rolling_defcon ?? null,
			rightDefcon: right?.rolling_defcon ?? null,
		};
	});
}

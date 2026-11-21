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

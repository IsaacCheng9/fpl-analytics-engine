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

import { expect, test } from "vitest";
import type { PlayerGameweek } from "../api";
import { meanDefensiveContribution, rollingChartRows } from "./playerTrends";

function gameweek(
	round: number,
	overrides: Partial<PlayerGameweek> = {},
): PlayerGameweek {
	return {
		round,
		kickoff_time: null,
		minutes: 90,
		total_points: 2,
		price: 5,
		expected_goals: 0.1,
		expected_assists: 0.1,
		expected_goal_involvements: 0.2,
		defensive_contribution: 10,
		defcon_hit: true,
		rolling_xg90: 0.1,
		rolling_xa90: 0.1,
		rolling_xgi90: 0.2,
		rolling_defcon: 10,
		...overrides,
	};
}

test("plots one end-of-gameweek point per double gameweek", () => {
	const rows = rollingChartRows([
		gameweek(1),
		gameweek(2, { kickoff_time: "first", rolling_xg90: 0.3 }),
		gameweek(2, { kickoff_time: "second", rolling_xg90: 0.3 }),
		gameweek(4),
	]);

	expect(rows.map((row) => row.round)).toEqual([1, 2, 4]);
	expect(rows[1].kickoff_time).toBe("second");
});

test("averages recorded defensive contributions and ignores missing ones", () => {
	expect(
		meanDefensiveContribution([
			gameweek(1, { defensive_contribution: 6 }),
			gameweek(2, { defensive_contribution: null }),
			gameweek(3, { defensive_contribution: 12 }),
		]),
	).toBe(9);
	expect(
		meanDefensiveContribution([gameweek(1, { defensive_contribution: null })]),
	).toBeNull();
});

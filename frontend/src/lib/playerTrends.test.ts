import { expect, test } from "vitest";
import type { PlayerGameweek } from "../api";
import {
	alignCompareTrends,
	meanDefensiveContribution,
	rollingChartRows,
} from "./playerTrends";

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

test("averages recorded defensive contributions and ignores missing and zero-minute ones", () => {
	expect(
		meanDefensiveContribution([
			gameweek(1, { defensive_contribution: 6 }),
			gameweek(2, { defensive_contribution: null }),
			gameweek(3, { minutes: 0, defensive_contribution: 0, defcon_hit: false }),
			gameweek(4, { defensive_contribution: 12 }),
		]),
	).toBe(9);
	expect(
		meanDefensiveContribution([
			gameweek(1, { defensive_contribution: null }),
			gameweek(2, { minutes: 0, defensive_contribution: 0, defcon_hit: false }),
		]),
	).toBeNull();
});

test("aligns matching gameweeks for two players", () => {
	const points = alignCompareTrends(
		[
			gameweek(1, { rolling_xgi90: 0.4, rolling_defcon: 8 }),
			gameweek(2, { rolling_xgi90: 0.55, rolling_defcon: 9.5 }),
		],
		[
			gameweek(1, { rolling_xgi90: 0.7, rolling_defcon: 5 }),
			gameweek(2, { rolling_xgi90: 0.65, rolling_defcon: 6 }),
		],
	);

	expect(points).toEqual([
		{
			round: 1,
			leftXgi90: 0.4,
			rightXgi90: 0.7,
			leftDefcon: 8,
			rightDefcon: 5,
		},
		{
			round: 2,
			leftXgi90: 0.55,
			rightXgi90: 0.65,
			leftDefcon: 9.5,
			rightDefcon: 6,
		},
	]);
});

test("sorts disjoint gameweeks onto a unified timeline with nulls for missing rounds", () => {
	const points = alignCompareTrends(
		[
			gameweek(5, { rolling_xgi90: 0.6, rolling_defcon: 7 }),
			gameweek(2, { rolling_xgi90: 0.3, rolling_defcon: 4 }),
		],
		[
			gameweek(4, { rolling_xgi90: 0.8, rolling_defcon: 11 }),
			gameweek(1, { rolling_xgi90: 0.2, rolling_defcon: 9 }),
		],
	);

	expect(points).toEqual([
		{
			round: 1,
			leftXgi90: null,
			rightXgi90: 0.2,
			leftDefcon: null,
			rightDefcon: 9,
		},
		{
			round: 2,
			leftXgi90: 0.3,
			rightXgi90: null,
			leftDefcon: 4,
			rightDefcon: null,
		},
		{
			round: 4,
			leftXgi90: null,
			rightXgi90: 0.8,
			leftDefcon: null,
			rightDefcon: 11,
		},
		{
			round: 5,
			leftXgi90: 0.6,
			rightXgi90: null,
			leftDefcon: 7,
			rightDefcon: null,
		},
	]);
});

test("preserves blank gameweek gaps and deduplicates double gameweeks", () => {
	const points = alignCompareTrends(
		[
			gameweek(1, { rolling_xgi90: 0.4, rolling_defcon: 8 }),
			gameweek(2, {
				kickoff_time: "2025-08-23T14:00:00Z",
				rolling_xgi90: 0.45,
				rolling_defcon: 8.5,
			}),
			gameweek(2, {
				kickoff_time: "2025-08-26T19:00:00Z",
				rolling_xgi90: 0.5,
				rolling_defcon: 9,
			}),
			gameweek(5, { rolling_xgi90: 0.6, rolling_defcon: 10 }),
		],
		[
			gameweek(1, { rolling_xgi90: 0.3, rolling_defcon: 6 }),
			gameweek(2, { rolling_xgi90: 0.35, rolling_defcon: 6.5 }),
			gameweek(4, { rolling_xgi90: 0.4, rolling_defcon: 7 }),
			gameweek(5, { rolling_xgi90: 0.45, rolling_defcon: 7.5 }),
		],
	);

	// GW3 is absent for both players so it remains a gap on a numeric axis.
	expect(points.map((point) => point.round)).toEqual([1, 2, 4, 5]);
	expect(points[1]).toEqual({
		round: 2,
		leftXgi90: 0.5,
		rightXgi90: 0.35,
		leftDefcon: 9,
		rightDefcon: 6.5,
	});
	expect(points[2]).toEqual({
		round: 4,
		leftXgi90: null,
		rightXgi90: 0.4,
		leftDefcon: null,
		rightDefcon: 7,
	});
});

test("handles empty gameweek arrays cleanly", () => {
	expect(alignCompareTrends([], [])).toEqual([]);
	expect(
		alignCompareTrends(
			[],
			[gameweek(3, { rolling_xgi90: 0.75, rolling_defcon: null })],
		),
	).toEqual([
		{
			round: 3,
			leftXgi90: null,
			rightXgi90: 0.75,
			leftDefcon: null,
			rightDefcon: null,
		},
	]);
});

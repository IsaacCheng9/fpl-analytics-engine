import { describe, expect, test } from "vitest";
import type { DefconPlayer, FormPlayer, PlayerDetail } from "../api";
import { buildCompareRows, type CompareSide } from "./compareRows";

function makeSide(overrides: Partial<CompareSide> = {}): CompareSide {
	const detail: PlayerDetail = {
		element: 1,
		code: 100,
		as_of_gw: 10,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		rolling_window: 5,
		selected_season: "2026-27",
		available_seasons: ["2026-27"],
		gameweeks: [
			{
				round: 9,
				kickoff_time: null,
				minutes: 90,
				total_points: 8,
				price: 10.0,
				expected_goals: 0.4,
				expected_assists: 0.2,
				expected_goal_involvements: 0.6,
				defensive_contribution: 10,
				defcon_hit: false,
				rolling_xg90: 0.4,
				rolling_xa90: 0.2,
				rolling_xgi90: 0.6,
				rolling_defcon: 10,
			},
		],
		seasons: [
			{
				season: "2026-27",
				games: 9,
				minutes: 780,
				points: 62,
				xg90: 0.45,
				xa90: 0.35,
				xgi90: 0.8,
				points_per_million: 6.2,
				defcon_hit_rate: 0.44,
			},
		],
	};
	return {
		option: {
			element: 1,
			web_name: "Saka",
			position: "MID",
			team_name: "Arsenal",
		},
		form: undefined,
		defcon: undefined,
		defconProb: undefined,
		club: undefined,
		detail,
		...overrides,
	};
}

describe("buildCompareRows", () => {
	test("reuses matching backend FormPlayer, DefconPlayer, and season summaries", () => {
		const form: FormPlayer = {
			element: 1,
			web_name: "Saka",
			position: "MID",
			team_name: "Arsenal",
			price: 10.0,
			window_games: 4,
			window_minutes: 340,
			window_xg90: 0.51,
			window_xa90: 0.31,
			window_xgi90: 0.82,
			season_xg90: 0.48,
			season_xa90: 0.36,
			season_xgi90: 0.84,
			delta_xg90: 0.03,
			delta_xa90: -0.05,
			delta_xgi90: -0.02,
			est_xg90: 0.49,
			est_xa90: 0.35,
			est_xgi90: 0.84,
			projected_minutes: 85,
			projected_xgi: 0.79,
			window_xg90_per_million: 0.051,
			window_xa90_per_million: 0.031,
			window_xgi90_per_million: 0.082,
			season_points_per_million: 6.5,
			window_start_rate: 1.0,
			window_mins_per_appearance: 85,
			upcoming_fixtures: 5,
			avg_fdr: 2.8,
			next_fixture_gw: 11,
			next_opponent_name: "Chelsea",
			next_was_home: true,
			next_fdr: 3,
			current_ownership: 35,
			as_of_gw: 10,
		};
		const defcon: DefconPlayer = {
			element: 1,
			web_name: "Saka",
			position: "MID",
			team_name: "Arsenal",
			price: 10.0,
			window_games: 4,
			window_minutes: 340,
			window_defcon_hits: 3,
			window_defcon_games: 4,
			window_defcon_hit_rate: 0.75,
			window_defcon: 11.5,
			upcoming_fixtures: 5,
			avg_fdr: 2.8,
			next_fixture_gw: 11,
			next_opponent_name: "Chelsea",
			next_was_home: true,
			next_fdr: 3,
			current_ownership: 35,
			window_xgi90_per_million: 0.082,
			season_points_per_million: 6.5,
			window_start_rate: 1.0,
			window_mins_per_appearance: 85,
			as_of_gw: 10,
		};
		const left = makeSide({ form, defcon });
		const right = makeSide();

		const rows = buildCompareRows(left, right, 5, 10, 10);
		const byLabel = (label: string) =>
			rows.find((row) => row.label === label)?.left;

		expect(byLabel("Window Games")).toBe("4");
		expect(byLabel("Window Minutes")).toBe("340");
		expect(byLabel("Window Mins Per App")).toBe("85");
		expect(byLabel("Window xGI Per 90")).toBe("0.82");
		expect(byLabel("Window DefCon Games")).toBe("4");
		expect(byLabel("Window DefCon Hits")).toBe("3");
		expect(byLabel("Window DefCon Hit Rate")).toBe("75%");
		expect(byLabel("Season Games")).toBe("9");
		expect(byLabel("Season Points")).toBe("62");
		expect(byLabel("Season xGI Per 90")).toBe("0.84");
		expect(byLabel("Season DefCon Hit Rate")).toBe("44%");
	});
});

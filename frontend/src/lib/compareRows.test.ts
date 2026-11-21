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
		next_fixtures: [],
		gameweeks: [
			{
				round: 8,
				kickoff_time: null,
				opponent_name: null,
				opponent_short_name: null,
				was_home: null,
				minutes: 0,
				total_points: 0,
				goals_scored: null,
				assists: null,
				bonus: null,
				price: 10.0,
				expected_goals: 0,
				expected_assists: 0,
				expected_goal_involvements: 0,
				defensive_contribution: 0,
				defcon_hit: false,
				rolling_xg90: null,
				rolling_xa90: null,
				rolling_xgi90: null,
				rolling_defcon: null,
			},
			{
				round: 9,
				kickoff_time: null,
				opponent_name: null,
				opponent_short_name: null,
				was_home: null,
				minutes: 90,
				total_points: 8,
				goals_scored: null,
				assists: null,
				bonus: null,
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
			{
				round: 10,
				kickoff_time: null,
				opponent_name: null,
				opponent_short_name: null,
				was_home: null,
				minutes: 90,
				total_points: 10,
				goals_scored: null,
				assists: null,
				bonus: null,
				price: 10.0,
				expected_goals: 0.5,
				expected_assists: 0.3,
				expected_goal_involvements: 0.8,
				defensive_contribution: 12,
				defcon_hit: true,
				rolling_xg90: 0.45,
				rolling_xa90: 0.25,
				rolling_xgi90: 0.7,
				rolling_defcon: 11,
			},
		],
		seasons: [
			{
				season: "2026-27",
				games: 3,
				minutes: 180,
				points: 18,
				xg90: 0.45,
				xa90: 0.25,
				xgi90: 0.7,
				points_per_million: 1.8,
				defcon_hit_rate: 0.5,
			},
		],
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
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

function makeForm(overrides: Partial<FormPlayer> = {}): FormPlayer {
	return {
		element: 1,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		price: 10.0,
		window_games: 3,
		window_minutes: 180,
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
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Chelsea",
		next_was_home: true,
		next_fdr: 3,
		next_fixtures: [],
		current_ownership: 35,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		as_of_gw: 10,
		...overrides,
	};
}

function makeDefcon(overrides: Partial<DefconPlayer> = {}): DefconPlayer {
	return {
		element: 1,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		price: 10.0,
		window_games: 3,
		window_minutes: 180,
		window_defcon_hits: 1,
		window_defcon_games: 2,
		window_defcon_hit_rate: 0.5,
		window_defcon: 11.0,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Chelsea",
		next_was_home: true,
		next_fdr: 3,
		next_fixtures: [],
		current_ownership: 35,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		window_xgi90_per_million: 0.082,
		season_points_per_million: 6.5,
		window_start_rate: 1.0,
		window_mins_per_appearance: 90,
		as_of_gw: 10,
		...overrides,
	};
}

describe("buildCompareRows", () => {
	test("reuses matching backend aggregates while keeping Games and Mins Per App scoped to appearances", () => {
		const left = makeSide({ form: makeForm(), defcon: makeDefcon() });
		const right = makeSide();

		const rows = buildCompareRows(left, right, 5, 10, 10);
		const byLabel = (label: string) =>
			rows.find((row) => row.label === label)?.left;

		// 3 fixture rows include one 0-minute DNP, so appearances stay 2 and Mins Per App stays 90.
		expect(byLabel("Window Games")).toBe("2");
		expect(byLabel("Window Minutes")).toBe("180");
		expect(byLabel("Window Mins Per App")).toBe("90");
		expect(byLabel("Window xGI Per 90")).toBe("0.82");
		expect(byLabel("Window DefCon Games")).toBe("2");
		expect(byLabel("Window DefCon Hits")).toBe("1");
		expect(byLabel("Window DefCon Hit Rate")).toBe("50%");
		expect(byLabel("Season Games")).toBe("2");
		expect(byLabel("Season Mins Per App")).toBe("90");
		expect(byLabel("Season Points")).toBe("18");
		expect(byLabel("Season xGI Per 90")).toBe("0.84");
		expect(byLabel("Season DefCon Hit Rate")).toBe("50%");
	});

	test("maps zero qualifying backend DefCon games to null and preserves authoritative null rates", () => {
		const left = makeSide({
			form: makeForm({ season_xgi90: null }),
			defcon: makeDefcon({
				window_defcon_games: 0,
				window_defcon_hits: 0,
				window_defcon_hit_rate: null,
			}),
		});
		const right = makeSide();

		const rows = buildCompareRows(left, right, 5, 10, 10);
		const byLabel = (label: string) =>
			rows.find((row) => row.label === label)?.left;

		expect(byLabel("Window DefCon Games")).toBe("-");
		expect(byLabel("Window DefCon Hits")).toBe("-");
		expect(byLabel("Window DefCon Hit Rate")).toBe("n/a");
		expect(byLabel("Season xGI Per 90")).toBe("-");
	});

	test("places Next 5 Fixtures strip data in the Fixtures section", () => {
		const leftFixtures = [
			{
				gw: 11,
				opponent_name: "Bournemouth",
				opponent_short_name: "BOU",
				was_home: true,
				fdr: 2,
			},
		];
		const rightFixtures = [
			{
				gw: 11,
				opponent_name: "Man City",
				opponent_short_name: "MCI",
				was_home: false,
				fdr: 5,
			},
		];
		const left = makeSide({
			form: makeForm({ next_fixtures: leftFixtures, avg_fdr: 2.0 }),
		});
		const right = makeSide({
			form: makeForm({ next_fixtures: rightFixtures, avg_fdr: 5.0 }),
		});

		const rows = buildCompareRows(left, right, 5, 10, 10);
		const stripRow = rows.find((row) => row.label === "Next 5 Fixtures");

		expect(stripRow?.section).toBe("Fixtures");
		expect(stripRow?.fixtureStartGw).toBe(11);
		expect(stripRow?.leftFixtures).toEqual(leftFixtures);
		expect(stripRow?.rightFixtures).toEqual(rightFixtures);
		expect(rows.find((row) => row.label === "FDR (Next 5)")?.section).toBe(
			"Fixtures",
		);
	});

	test("drops stale fixtures when no compare source matches comparisonGw", () => {
		const staleFixtures = [
			{
				gw: 11,
				opponent_name: "Bournemouth",
				opponent_short_name: "BOU",
				was_home: true,
				fdr: 2,
			},
		];
		const left = makeSide({
			form: makeForm({ as_of_gw: 10, next_fixtures: staleFixtures }),
		});
		const right = makeSide();

		const rows = buildCompareRows(left, right, 5, 5, 10);
		const stripRow = rows.find((row) => row.label === "Next 5 Fixtures");

		expect(stripRow?.fixtureStartGw).toBe(6);
		expect(stripRow?.leftFixtures).toEqual([]);
		expect(stripRow?.left).toBe("-");
	});

	test("adds Live Snapshot Availability and Set Pieces rows", () => {
		const left = makeSide();
		const right = makeSide();
		left.detail = {
			...(left.detail as PlayerDetail),
			status: "i",
			chance_of_playing_next_round: 0,
			news: "Hamstring injury",
			yellow_cards: 4,
			penalties_order: 1,
			corners_order: 1,
			direct_freekicks_order: 2,
		};
		right.detail = {
			...(right.detail as PlayerDetail),
			status: "a",
			chance_of_playing_next_round: null,
			news: null,
			yellow_cards: 1,
			penalties_order: null,
			corners_order: null,
			direct_freekicks_order: null,
		};

		const rows = buildCompareRows(left, right, 5, 10, 10);
		const availability = rows.find(
			(row) => row.section === "Live Snapshot" && row.label === "Availability",
		);
		const setPieces = rows.find(
			(row) => row.section === "Live Snapshot" && row.label === "Set Pieces",
		);

		expect(availability).toMatchObject({
			left: "Injured (0%, 4 YC - suspension watch) - Hamstring injury",
			right: "Available",
		});
		expect(setPieces).toMatchObject({
			left: "Penalties, Corners",
			right: "None",
		});
	});
});

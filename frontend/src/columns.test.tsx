import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { ClubForm, DefconProbabilityPlayer, FormPlayer } from "./api";
import {
	buildClubColumns,
	buildDefconProbColumns,
	buildFormColumns,
	CLUB_HEAT_KEYS,
	computeRanges,
	DEFCON_PROB_HEAT_KEYS,
	FORM_HEAT_KEYS,
} from "./columns";
import { DataTable } from "./components/DataTable";
import { DEFAULT_ATTACKING_METRICS, DEFAULT_CLUB_COLUMNS } from "./state";

function makeFormPlayer(
	overrides: Partial<FormPlayer> & { element: number; web_name: string },
): FormPlayer {
	return {
		position: "MID",
		team_name: "Arsenal",
		price: 7.5,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.4,
		window_xa90: 0.2,
		window_xgi90: 0.6,
		season_xg90: 0.4,
		season_xa90: 0.2,
		season_xgi90: 0.6,
		delta_xg90: 0,
		delta_xa90: 0,
		delta_xgi90: 0,
		est_xg90: 0.4,
		est_xa90: 0.2,
		est_xgi90: 0.6,
		projected_minutes: 85,
		projected_xgi: 0.5,
		window_xg90_per_million: 0.05,
		window_xa90_per_million: 0.03,
		window_xgi90_per_million: 0.08,
		season_points_per_million: 12,
		window_start_rate: 1,
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 3.0,
		next_fixture_gw: 11,
		next_opponent_name: "Chelsea",
		next_was_home: true,
		next_fdr: 3,
		next_fixtures: [],
		current_ownership: 15,
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

function makeClubForm(
	overrides: Partial<ClubForm> & { team: number; team_name: string },
): ClubForm {
	return {
		window_matches: 5,
		season_matches: 10,
		window_xg_per_match: 1.5,
		season_xg_per_match: 1.5,
		delta_xg_per_match: 0,
		window_goals_for_per_match: 1.5,
		season_goals_for_per_match: 1.5,
		delta_goals_for_per_match: 0,
		window_xgc_per_match: 1.2,
		season_xgc_per_match: 1.2,
		delta_xgc_per_match: 0,
		window_xgd_per_match: 0.3,
		season_xgd_per_match: 0.3,
		window_goals_against_per_match: 1.2,
		season_goals_against_per_match: 1.2,
		delta_goals_against_per_match: 0,
		window_finishing_delta: 0,
		season_finishing_delta: 0,
		window_concession_delta: 0,
		season_concession_delta: 0,
		window_finishing_delta_total: 0,
		season_finishing_delta_total: 0,
		window_concession_delta_total: 0,
		season_concession_delta_total: 0,
		window_goal_difference_delta: 0,
		season_goal_difference_delta: 0,
		window_goal_difference_delta_total: 0,
		season_goal_difference_delta_total: 0,
		attack_form: 0,
		defence_form: 0,
		upcoming_fixtures: 5,
		avg_fdr: 3.0,
		next_fixtures: [],
		as_of_gw: 10,
		...overrides,
	};
}

function firstColumnTexts(): string[] {
	const rows = screen.getAllByRole("row").slice(1);
	return rows.map(
		(row) => within(row).getAllByRole("cell")[0].textContent ?? "",
	);
}

describe("nullable numeric column sorting", () => {
	test("sorts null projected_xgi and avg_fdr last in both directions", () => {
		const players = [
			makeFormPlayer({
				element: 1,
				web_name: "Missing",
				projected_xgi: null,
				avg_fdr: null,
			}),
			makeFormPlayer({
				element: 2,
				web_name: "Low",
				projected_xgi: 0.1,
				avg_fdr: 2.0,
			}),
			makeFormPlayer({
				element: 3,
				web_name: "High",
				projected_xgi: 0.9,
				avg_fdr: 4.5,
			}),
		];
		const columns = buildFormColumns(
			computeRanges(players, FORM_HEAT_KEYS),
			DEFAULT_ATTACKING_METRICS,
		);
		render(<DataTable data={players} columns={columns} />);

		const projectedButton = screen.getByRole("button", {
			name: /^Projected xGI/,
		});
		fireEvent.click(projectedButton);
		expect(firstColumnTexts()).toEqual(["High", "Low", "Missing"]);
		fireEvent.click(projectedButton);
		expect(firstColumnTexts()).toEqual(["Low", "High", "Missing"]);

		const fdrButton = screen.getByRole("button", {
			name: /^FDR \(Next 5\)/,
		});
		fireEvent.click(fdrButton);
		expect(firstColumnTexts()).toEqual(["High", "Low", "Missing"]);
		fireEvent.click(fdrButton);
		expect(firstColumnTexts()).toEqual(["Low", "High", "Missing"]);
	});

	test("sorts null prob last in DefCon probability columns", () => {
		const players: DefconProbabilityPlayer[] = [
			{
				element: 1,
				web_name: "NullProb",
				position: "DEF",
				team_name: "Arsenal",
				price: 5.0,
				window_minutes: 360,
				window_defcon: 10,
				games: 4,
				hits: 2,
				raw_rate: 0.5,
				prob: null,
				upcoming_fixtures: 5,
				avg_fdr: 3,
				next_fixture_gw: 11,
				next_opponent_name: "Chelsea",
				next_was_home: true,
				next_fdr: 3,
				next_fixtures: [],
				current_ownership: 10,
				status: "a",
				chance_of_playing_next_round: null,
				news: null,
				yellow_cards: 0,
				penalties_order: null,
				corners_order: null,
				direct_freekicks_order: null,
				window_xgi90_per_million: 0.02,
				season_points_per_million: 10,
				window_start_rate: 1,
				window_mins_per_appearance: 90,
				as_of_gw: 10,
			},
			{
				element: 2,
				web_name: "Lower",
				position: "DEF",
				team_name: "Arsenal",
				price: 5.0,
				window_minutes: 360,
				window_defcon: 9,
				games: 4,
				hits: 1,
				raw_rate: 0.25,
				prob: 0.25,
				upcoming_fixtures: 5,
				avg_fdr: 3,
				next_fixture_gw: 11,
				next_opponent_name: "Chelsea",
				next_was_home: true,
				next_fdr: 3,
				next_fixtures: [],
				current_ownership: 10,
				status: "a",
				chance_of_playing_next_round: null,
				news: null,
				yellow_cards: 0,
				penalties_order: null,
				corners_order: null,
				direct_freekicks_order: null,
				window_xgi90_per_million: 0.02,
				season_points_per_million: 10,
				window_start_rate: 1,
				window_mins_per_appearance: 90,
				as_of_gw: 10,
			},
			{
				element: 3,
				web_name: "Higher",
				position: "DEF",
				team_name: "Arsenal",
				price: 5.0,
				window_minutes: 360,
				window_defcon: 12,
				games: 4,
				hits: 3,
				raw_rate: 0.75,
				prob: 0.72,
				upcoming_fixtures: 5,
				avg_fdr: 3,
				next_fixture_gw: 11,
				next_opponent_name: "Chelsea",
				next_was_home: true,
				next_fdr: 3,
				next_fixtures: [],
				current_ownership: 10,
				status: "a",
				chance_of_playing_next_round: null,
				news: null,
				yellow_cards: 0,
				penalties_order: null,
				corners_order: null,
				direct_freekicks_order: null,
				window_xgi90_per_million: 0.02,
				season_points_per_million: 10,
				window_start_rate: 1,
				window_mins_per_appearance: 90,
				as_of_gw: 10,
			},
		];
		const columns = buildDefconProbColumns(
			computeRanges(players, DEFCON_PROB_HEAT_KEYS),
		);
		render(<DataTable data={players} columns={columns} />);

		const probButton = screen.getByRole("button", {
			name: /^P\(Hit \| 60\+ Mins\)/,
		});
		fireEvent.click(probButton);
		expect(firstColumnTexts()).toEqual(["Higher", "Lower", "NullProb"]);
		fireEvent.click(probButton);
		expect(firstColumnTexts()).toEqual(["Lower", "Higher", "NullProb"]);
	});

	test("sorts null signed club deltas and overperformance last in both directions", () => {
		const clubs = [
			makeClubForm({
				team: 1,
				team_name: "Negative",
				delta_xg_per_match: -0.5,
				window_finishing_delta_total: -2.0,
			}),
			makeClubForm({
				team: 2,
				team_name: "Missing",
				delta_xg_per_match: null,
				window_finishing_delta_total: null,
			}),
			makeClubForm({
				team: 3,
				team_name: "Positive",
				delta_xg_per_match: 0.6,
				window_finishing_delta_total: 1.5,
			}),
		];
		const columns = buildClubColumns(computeRanges(clubs, CLUB_HEAT_KEYS), {
			...DEFAULT_CLUB_COLUMNS,
			finishing_total: true,
		});
		render(<DataTable data={clubs} columns={columns} />);

		const deltaButton = screen.getByRole("button", {
			name: /^Delta xG(\s|$)/,
		});
		fireEvent.click(deltaButton);
		expect(firstColumnTexts()).toEqual(["Positive", "Negative", "Missing"]);
		fireEvent.click(deltaButton);
		expect(firstColumnTexts()).toEqual(["Negative", "Positive", "Missing"]);

		const overperfButton = screen.getByRole("button", {
			name: /^Window xG \+\/- Total/,
		});
		fireEvent.click(overperfButton);
		expect(firstColumnTexts()).toEqual(["Positive", "Negative", "Missing"]);
		fireEvent.click(overperfButton);
		expect(firstColumnTexts()).toEqual(["Negative", "Positive", "Missing"]);
	});

	test("renders the Next 5 club fixture strip alongside FDR and toggles with the FDR group", () => {
		const clubs = [
			makeClubForm({
				team: 1,
				team_name: "Arsenal",
				as_of_gw: 10,
				next_fixtures: [
					{
						gw: 11,
						opponent_name: "Bournemouth",
						opponent_short_name: "BOU",
						was_home: true,
						fdr: 2,
					},
					{
						gw: 12,
						opponent_name: "Man City",
						opponent_short_name: "MCI",
						was_home: false,
						fdr: 5,
					},
				],
			}),
		];
		const columns = buildClubColumns(
			computeRanges(clubs, CLUB_HEAT_KEYS),
			DEFAULT_CLUB_COLUMNS,
		);
		const { rerender } = render(<DataTable data={clubs} columns={columns} />);

		expect(
			screen.getByRole("columnheader", { name: /^Next 5/ }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^Next 5/ }),
		).not.toBeInTheDocument();
		expect(screen.getByText("BOU (H)")).toHaveAttribute(
			"title",
			"GW11: Bournemouth (H) - FDR 2",
		);
		expect(screen.getByText("MCI (A)")).toHaveAttribute(
			"title",
			"GW12: Man City (A) - FDR 5",
		);

		const hiddenColumns = buildClubColumns(
			computeRanges(clubs, CLUB_HEAT_KEYS),
			{ ...DEFAULT_CLUB_COLUMNS, fdr: false },
		);
		rerender(<DataTable data={clubs} columns={hiddenColumns} />);
		expect(
			screen.queryByRole("columnheader", { name: /^Next 5/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("columnheader", { name: /FDR \(Next 5\)/ }),
		).not.toBeInTheDocument();
	});

	test("renders availability, card-risk, and primary penalty badges in player cells", () => {
		const players = [
			makeFormPlayer({
				element: 1,
				web_name: "Saka",
				status: "i",
				chance_of_playing_next_round: 0,
				news: "Hamstring injury",
				penalties_order: 1,
				corners_order: 1,
				direct_freekicks_order: 1,
			}),
			makeFormPlayer({
				element: 2,
				web_name: "Palmer",
				status: "d",
				chance_of_playing_next_round: 75,
				news: "Knock",
				yellow_cards: 4,
			}),
		];
		const columns = buildFormColumns(
			computeRanges(players, FORM_HEAT_KEYS),
			DEFAULT_ATTACKING_METRICS,
		);
		render(<DataTable data={players} columns={columns} />);

		expect(screen.getByText("Inj")).toHaveAttribute(
			"title",
			"Injured - 0% chance: Hamstring injury",
		);
		expect(screen.getByText("P")).toHaveAttribute(
			"title",
			"Primary penalty taker",
		);
		expect(screen.queryByText("C")).not.toBeInTheDocument();
		expect(screen.queryByText("FK")).not.toBeInTheDocument();
		expect(screen.getByText("75%")).toHaveAttribute(
			"title",
			"Doubtful - 75% chance: Knock",
		);
		expect(screen.getByText("4 YC")).toHaveAttribute(
			"title",
			"4 yellow cards - suspension watch",
		);
	});
});

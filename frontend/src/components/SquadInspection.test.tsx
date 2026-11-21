import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type {
	CurrentPlayerContext,
	DefconProbabilityPlayer,
	FormPlayer,
	FplTeamPick,
} from "../api";
import { SquadInspection } from "./SquadInspection";

const picks: FplTeamPick[] = [
	{
		element: 1,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		squad_position: 1,
		multiplier: 2,
		is_captain: true,
		is_vice_captain: false,
		is_starting: true,
	},
	{
		element: 2,
		web_name: "Palmer",
		position: "MID",
		team_name: "Chelsea",
		squad_position: 2,
		multiplier: 1,
		is_captain: false,
		is_vice_captain: true,
		is_starting: true,
	},
	{
		element: 3,
		web_name: "Gusto",
		position: "DEF",
		team_name: "Chelsea",
		squad_position: 12,
		multiplier: 0,
		is_captain: false,
		is_vice_captain: false,
		is_starting: false,
	},
];

function makePick(
	overrides: Partial<FplTeamPick> & { element: number },
): FplTeamPick {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		squad_position: overrides.element,
		multiplier: 1,
		is_captain: false,
		is_vice_captain: false,
		is_starting: true,
		...overrides,
	};
}

function makeCurrent(
	overrides: Partial<CurrentPlayerContext> & { element: number },
): CurrentPlayerContext {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		price: 7.5,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
		next_fixtures: [],
		current_ownership: 15,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		...overrides,
	};
}

function makeForm(
	overrides: Partial<FormPlayer> & { element: number },
): FormPlayer {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		price: 7.5,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.3,
		window_xa90: 0.2,
		window_xgi90: 0.5,
		season_xg90: 0.3,
		season_xa90: 0.2,
		season_xgi90: 0.5,
		delta_xg90: 0,
		delta_xa90: 0,
		delta_xgi90: 0,
		est_xg90: 0.3,
		est_xa90: 0.2,
		est_xgi90: 0.5,
		projected_minutes: 85,
		projected_xgi: 0.45,
		window_xg90_per_million: 0.04,
		window_xa90_per_million: 0.03,
		window_xgi90_per_million: 0.07,
		season_points_per_million: 4,
		window_start_rate: 1.0,
		window_mins_per_appearance: 85,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
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

function makeDefcon(
	overrides: Partial<DefconProbabilityPlayer> & { element: number },
): DefconProbabilityPlayer {
	return {
		web_name: `Player ${overrides.element}`,
		position: "DEF",
		team_name: "Arsenal",
		price: 5.5,
		window_minutes: 450,
		window_defcon: 8,
		games: 10,
		hits: 5,
		raw_rate: 0.5,
		prob: 0.5,
		window_xgi90_per_million: null,
		season_points_per_million: null,
		window_start_rate: 1.0,
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
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

describe("SquadInspection", () => {
	test("renders accessible captain, vice-captain, and bench badges and interactive player buttons", () => {
		const onPlayerClick = vi.fn();
		render(
			<SquadInspection
				picks={picks}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={onPlayerClick}
				onFindReplacement={() => {}}
			/>,
		);

		expect(screen.getByText("Captain")).toBeInTheDocument();
		expect(screen.getByText("Vice-captain")).toBeInTheDocument();
		expect(screen.getByText("Starting XI")).toBeInTheDocument();
		expect(screen.getByText("Bench")).toBeInTheDocument();
		expect(screen.getByText("B1")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Saka" }));
		expect(onPlayerClick).toHaveBeenCalledWith(1);

		const palmerRow = screen
			.getByRole("button", { name: "Palmer" })
			.closest("tr");
		fireEvent.keyDown(palmerRow as HTMLElement, { key: "Enter" });
		expect(onPlayerClick).toHaveBeenCalledWith(2);
	});

	test("renders a Retry button when squad loading fails", () => {
		const onRetry = vi.fn();
		render(
			<SquadInspection
				picks={[]}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={true}
				onRetry={onRetry}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test("splits Starting XI by position then name and Bench by squad_position ascending", () => {
		const mixedPicks: FplTeamPick[] = [
			makePick({
				element: 10,
				web_name: "Watkins",
				position: "FWD",
				squad_position: 10,
				is_starting: true,
			}),
			makePick({
				element: 11,
				web_name: "Saka",
				position: "MID",
				squad_position: 7,
				is_starting: true,
			}),
			makePick({
				element: 12,
				web_name: "Gabriel",
				position: "DEF",
				squad_position: 3,
				is_starting: true,
			}),
			makePick({
				element: 13,
				web_name: "Raya",
				position: "GK",
				squad_position: 1,
				is_starting: true,
			}),
			makePick({
				element: 14,
				web_name: "Bruno",
				position: "MID",
				squad_position: 8,
				is_starting: true,
			}),
			makePick({
				element: 24,
				web_name: "Winks",
				position: "MID",
				squad_position: 15,
				multiplier: 0,
				is_starting: false,
			}),
			makePick({
				element: 21,
				web_name: "Fabianski",
				position: "GK",
				squad_position: 12,
				multiplier: 0,
				is_starting: false,
			}),
			makePick({
				element: 23,
				web_name: "Greaves",
				position: "DEF",
				squad_position: 14,
				multiplier: 0,
				is_starting: false,
			}),
			makePick({
				element: 22,
				web_name: "Rogers",
				position: "MID",
				squad_position: 13,
				multiplier: 0,
				is_starting: false,
			}),
		];

		render(
			<SquadInspection
				picks={mixedPicks}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		const startingBody = screen.getByRole("rowgroup", { name: "Starting XI" });
		const benchBody = screen.getByRole("rowgroup", { name: "Bench" });

		expect(
			within(startingBody).getByRole("rowheader", { name: /Starting XI/ }),
		).toHaveAttribute("scope", "rowgroup");
		expect(
			within(benchBody).getByRole("rowheader", { name: /Bench/ }),
		).toHaveAttribute("scope", "rowgroup");

		const startingNames = within(startingBody)
			.getAllByRole("row")
			.slice(1)
			.map((row) => within(row).getAllByRole("button")[0].textContent);
		expect(startingNames).toEqual([
			"Raya",
			"Gabriel",
			"Bruno",
			"Saka",
			"Watkins",
		]);

		const benchDataRows = within(benchBody).getAllByRole("row").slice(1);
		const benchOrder = benchDataRows.map((row) => ({
			badge: within(row).getByTitle(/^Bench order/).textContent,
			name: within(row).getAllByRole("button")[0].textContent,
		}));
		expect(benchOrder).toEqual([
			{ badge: "B1", name: "Fabianski" },
			{ badge: "B2", name: "Rogers" },
			{ badge: "B3", name: "Greaves" },
			{ badge: "B4", name: "Winks" },
		]);
	});

	test("preserves FPL auto-sub slot labels on a partial bench", () => {
		const partialBench: FplTeamPick[] = [
			makePick({
				element: 23,
				web_name: "Greaves",
				position: "DEF",
				squad_position: 14,
				multiplier: 0,
				is_starting: false,
			}),
			makePick({
				element: 22,
				web_name: "Rogers",
				position: "MID",
				squad_position: 13,
				multiplier: 0,
				is_starting: false,
			}),
		];

		render(
			<SquadInspection
				picks={partialBench}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		const benchBody = screen.getByRole("rowgroup", { name: "Bench" });
		const benchDataRows = within(benchBody).getAllByRole("row").slice(1);
		expect(
			benchDataRows.map((row) => ({
				badge: within(row).getByTitle(/^Bench order/).textContent,
				name: within(row).getAllByRole("button")[0].textContent,
			})),
		).toEqual([
			{ badge: "B2", name: "Rogers" },
			{ badge: "B3", name: "Greaves" },
		]);
	});

	test("computes summary KPIs from Starting XI metrics, squad-wide flags, and null values", () => {
		const squadPicks: FplTeamPick[] = [
			makePick({
				element: 1,
				web_name: "Saka",
				position: "MID",
				squad_position: 1,
				is_starting: true,
			}),
			makePick({
				element: 2,
				web_name: "Palmer",
				position: "MID",
				squad_position: 2,
				is_starting: true,
			}),
			makePick({
				element: 3,
				web_name: "Raya",
				position: "GK",
				squad_position: 3,
				is_starting: true,
			}),
			makePick({
				element: 4,
				web_name: "BenchSub",
				position: "FWD",
				squad_position: 12,
				multiplier: 0,
				is_starting: false,
			}),
		];

		const formPlayers: FormPlayer[] = [
			// Saka: healthy starter, watch flag only via fixture FDR 4.
			makeForm({
				element: 1,
				web_name: "Saka",
				projected_xgi: 0.65,
				est_xgi90: 0.6,
				window_start_rate: 1.0,
				window_mins_per_appearance: 85,
			}),
			// Palmer: minutes risk + fixture risk -> counted once as Risk.
			makeForm({
				element: 2,
				web_name: "Palmer",
				projected_xgi: 0.35,
				est_xgi90: 0.5,
				window_start_rate: 0.4,
				window_mins_per_appearance: 50,
			}),
			// Raya: null projected_xgi to test partial coverage note.
			makeForm({
				element: 3,
				web_name: "Raya",
				position: "GK",
				projected_xgi: null,
				est_xgi90: null,
				window_start_rate: 1.0,
				window_mins_per_appearance: 90,
			}),
			// BenchSub: high xGI and FDR 5 must not affect Starting XI KPIs,
			// but its Low Threat watch flag counts towards Squad Flags.
			makeForm({
				element: 4,
				web_name: "BenchSub",
				position: "FWD",
				projected_xgi: 0.99,
				est_xgi90: 0.1,
				window_start_rate: 1.0,
				window_mins_per_appearance: 80,
			}),
		];

		const currentPlayers: CurrentPlayerContext[] = [
			makeCurrent({ element: 1, web_name: "Saka", next_fdr: 4 }),
			makeCurrent({ element: 2, web_name: "Palmer", next_fdr: 4 }),
			makeCurrent({
				element: 3,
				web_name: "Raya",
				position: "GK",
				next_fdr: null,
			}),
			makeCurrent({
				element: 4,
				web_name: "BenchSub",
				position: "FWD",
				next_fdr: 5,
			}),
		];

		render(
			<SquadInspection
				picks={squadPicks}
				formPlayers={formPlayers}
				currentPlayers={currentPlayers}
				defconPlayers={[makeDefcon({ element: 1, prob: 0.5 })]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		// Starting XI Projected xGI = 0.65 + 0.35 = 1.00 (2/3 starters with data).
		expect(screen.getByText("Starting XI Projected xGI")).toBeInTheDocument();
		expect(screen.getByText("1.00")).toBeInTheDocument();
		expect(screen.getAllByText("(2/3 with data)")).toHaveLength(2);

		// Squad Flags: Palmer (Risk + Watch -> 1 Risk), Saka (Watch), BenchSub (Watch).
		expect(screen.getByText("1 Risk")).toBeInTheDocument();
		expect(screen.getByText("2 Watch")).toBeInTheDocument();

		// Avg Next FDR (XI) = (4 + 4) / 2 = 4.0 (ignores null Raya and bench FDR 5).
		expect(screen.getByText("Avg Next FDR (XI)")).toBeInTheDocument();
		expect(screen.getByText("4.0")).toBeInTheDocument();
	});

	test("handles all-null summary metrics cleanly without NaN", () => {
		render(
			<SquadInspection
				picks={picks}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		expect(screen.getByText("0 Risk")).toBeInTheDocument();
		expect(screen.getByText("0 Watch")).toBeInTheDocument();
		expect(screen.getAllByText("(0/2 with data)")).toHaveLength(2);
	});

	test("computes maxPrice from price plus Bank (ITB) and invokes onFindReplacement without opening PlayerPanel", () => {
		const onPlayerClick = vi.fn();
		const onFindReplacement = vi.fn();
		const squadPicks: FplTeamPick[] = [
			makePick({
				element: 1,
				web_name: "Saka",
				position: "MID",
				squad_position: 1,
				is_starting: true,
			}),
			makePick({
				element: 2,
				web_name: "Gusto",
				position: "DEF",
				squad_position: 12,
				multiplier: 0,
				is_starting: false,
			}),
			makePick({
				element: 3,
				web_name: "Unpriced",
				position: "MNG",
				squad_position: 13,
				multiplier: 0,
				is_starting: false,
			}),
		];
		const currentPlayers: CurrentPlayerContext[] = [
			makeCurrent({
				element: 1,
				web_name: "Saka",
				position: "MID",
				price: 7.4,
			}),
			makeCurrent({
				element: 2,
				web_name: "Gusto",
				position: "DEF",
				price: 5.0,
			}),
			makeCurrent({
				element: 3,
				web_name: "Unpriced",
				position: "MNG",
				price: null,
			}),
		];

		render(
			<SquadInspection
				picks={squadPicks}
				formPlayers={[]}
				currentPlayers={currentPlayers}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={onPlayerClick}
				onFindReplacement={onFindReplacement}
			/>,
		);

		const bankInput = screen.getByLabelText(/Bank/);
		expect(bankInput).toHaveValue(0);

		// 7.4 + 0.2 tests floating-point rounding to 1 decimal place (7.6).
		fireEvent.change(bankInput, { target: { value: "0.2" } });
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Saka" }),
		);
		expect(onFindReplacement).toHaveBeenCalledWith({
			element: 1,
			webName: "Saka",
			position: "MID",
			maxPrice: 7.6,
		});
		expect(onPlayerClick).not.toHaveBeenCalled();

		// Valid positive bank formats cleanly to one decimal place on blur.
		fireEvent.change(bankInput, { target: { value: "2" } });
		fireEvent.blur(bankInput);
		expect(bankInput).toHaveDisplayValue("2.0");

		fireEvent.change(bankInput, { target: { value: "1.5" } });
		fireEvent.blur(bankInput);
		expect(bankInput).toHaveDisplayValue("1.5");
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Gusto" }),
		);
		expect(onFindReplacement).toHaveBeenCalledWith({
			element: 2,
			webName: "Gusto",
			position: "DEF",
			maxPrice: 6.5,
		});

		// Negative bank clamps to 0 both when computing maxPrice and on blur.
		fireEvent.change(bankInput, { target: { value: "-1" } });
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Gusto" }),
		);
		expect(onFindReplacement).toHaveBeenLastCalledWith({
			element: 2,
			webName: "Gusto",
			position: "DEF",
			maxPrice: 5,
		});
		fireEvent.blur(bankInput);
		expect(bankInput).toHaveDisplayValue("0.0");

		// Bank above 100 clamps to 100 both when computing maxPrice and on blur.
		fireEvent.change(bankInput, { target: { value: "150" } });
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Gusto" }),
		);
		expect(onFindReplacement).toHaveBeenLastCalledWith({
			element: 2,
			webName: "Gusto",
			position: "DEF",
			maxPrice: 105,
		});
		fireEvent.blur(bankInput);
		expect(bankInput).toHaveDisplayValue("100.0");

		// Empty bank treats ITB as 0 and resets to 0.0 on blur.
		fireEvent.change(bankInput, { target: { value: "" } });
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Gusto" }),
		);
		expect(onFindReplacement).toHaveBeenLastCalledWith({
			element: 2,
			webName: "Gusto",
			position: "DEF",
			maxPrice: 5,
		});
		fireEvent.blur(bankInput);
		expect(bankInput).toHaveDisplayValue("0.0");

		// Null price omits maxPrice instead of passing NaN.
		fireEvent.click(
			screen.getByRole("button", { name: "Find replacement for Unpriced" }),
		);
		const lastCall = onFindReplacement.mock.calls.at(-1)?.[0];
		expect(lastCall).toEqual({
			element: 3,
			webName: "Unpriced",
			position: "MNG",
		});
		expect("maxPrice" in lastCall).toBe(false);
		expect(onPlayerClick).not.toHaveBeenCalled();
	});

	test("renders 5-GW fixture strips without mislabeling already-played opening rounds as BGW", () => {
		const currentPlayers: CurrentPlayerContext[] = [
			makeCurrent({
				element: 1,
				web_name: "Saka",
				position: "MID",
				team_name: "Arsenal",
				price: 10.0,
				upcoming_fixtures: 2,
				avg_fdr: 2.5,
				next_fixture_gw: 11,
				next_opponent_name: "Bournemouth",
				next_was_home: true,
				next_fdr: 2,
				next_fixtures: [
					{
						gw: 11,
						opponent_name: "Bournemouth",
						opponent_short_name: "BOU",
						was_home: true,
						fdr: 2,
					},
					// GW12 is a genuine mid-window blank gameweek.
					{
						gw: 13,
						opponent_name: "Chelsea",
						opponent_short_name: "CHE",
						was_home: false,
						fdr: 3,
					},
				],
				current_ownership: 30,
			}),
			makeCurrent({
				element: 2,
				web_name: "Palmer",
				position: "MID",
				team_name: "Chelsea",
				price: 10.5,
				upcoming_fixtures: 4,
				avg_fdr: 3.0,
				next_fixture_gw: 12,
				next_opponent_name: "Arsenal",
				next_was_home: true,
				next_fdr: 4,
				// Already played GW11 in a live mid-GW snapshot: next fixtures cover GW12-15.
				next_fixtures: [
					{
						gw: 12,
						opponent_name: "Arsenal",
						opponent_short_name: "ARS",
						was_home: true,
						fdr: 4,
					},
					{
						gw: 13,
						opponent_name: "Fulham",
						opponent_short_name: "FUL",
						was_home: false,
						fdr: 2,
					},
					{
						gw: 14,
						opponent_name: "Everton",
						opponent_short_name: "EVE",
						was_home: true,
						fdr: 2,
					},
					{
						gw: 15,
						opponent_name: "Liverpool",
						opponent_short_name: "LIV",
						was_home: false,
						fdr: 4,
					},
				],
				current_ownership: 42,
			}),
		];

		render(
			<SquadInspection
				picks={picks.slice(0, 2)}
				formPlayers={[]}
				currentPlayers={currentPlayers}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		expect(
			screen.getByRole("columnheader", { name: "Fixtures" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("columnheader", { name: "FDR" }),
		).toBeInTheDocument();

		const sakaRow = within(
			screen.getByRole("button", { name: "Saka" }).closest("tr") as HTMLElement,
		);
		expect(sakaRow.getByText("BOU (H)")).toHaveAttribute(
			"title",
			"GW11: Bournemouth (H) - FDR 2",
		);
		expect(sakaRow.getAllByText("BGW")[0]).toHaveAttribute(
			"title",
			"GW12: Blank gameweek",
		);
		expect(sakaRow.getAllByRole("cell")[5]).toHaveTextContent("2");

		// Palmer already played GW11, so he gets GW12-15 with neither a GW11 nor GW16 BGW.
		const palmerRow = within(
			screen
				.getByRole("button", { name: "Palmer" })
				.closest("tr") as HTMLElement,
		);
		expect(palmerRow.queryByText("BGW")).not.toBeInTheDocument();
		expect(palmerRow.getAllByRole("listitem")).toHaveLength(4);
		expect(palmerRow.getByText("ARS (H)")).toHaveAttribute(
			"title",
			"GW12: Arsenal (H) - FDR 4",
		);
		expect(palmerRow.getAllByRole("cell")[5]).toHaveTextContent("4");
	});

	test("renders injured, doubtful, and card-risk squad flags with news tooltips", () => {
		const currentPlayers: CurrentPlayerContext[] = [
			makeCurrent({
				element: 1,
				web_name: "Saka",
				position: "MID",
				team_name: "Arsenal",
				price: 10.0,
				upcoming_fixtures: 5,
				avg_fdr: 2.8,
				next_fixture_gw: 11,
				next_opponent_name: "Chelsea",
				next_was_home: true,
				next_fdr: 3,
				current_ownership: 35,
				status: "i",
				chance_of_playing_next_round: 0,
				news: "Hamstring injury - Expected back next month",
				yellow_cards: 1,
				penalties_order: 1,
				corners_order: 2,
				direct_freekicks_order: null,
			}),
			makeCurrent({
				element: 2,
				web_name: "Palmer",
				position: "MID",
				team_name: "Chelsea",
				price: 10.5,
				upcoming_fixtures: 5,
				avg_fdr: 2.6,
				next_fixture_gw: 11,
				next_opponent_name: "Arsenal",
				next_was_home: false,
				next_fdr: 3,
				current_ownership: 45,
				status: "d",
				chance_of_playing_next_round: 75,
				news: "Late fitness test",
				yellow_cards: 4,
				penalties_order: 1,
				corners_order: null,
				direct_freekicks_order: null,
			}),
			makeCurrent({
				element: 3,
				web_name: "Gusto",
				position: "DEF",
				team_name: "Chelsea",
				price: 5.0,
				upcoming_fixtures: 5,
				avg_fdr: 2.6,
				next_fixture_gw: 11,
				next_opponent_name: "Arsenal",
				next_was_home: false,
				next_fdr: 3,
				current_ownership: 10,
				status: "s",
				chance_of_playing_next_round: 0,
				news: "Red card suspension",
				yellow_cards: 9,
				penalties_order: null,
				corners_order: null,
				direct_freekicks_order: null,
			}),
		];

		render(
			<SquadInspection
				picks={picks}
				formPlayers={[]}
				currentPlayers={currentPlayers}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		const sakaRow = screen
			.getByRole("button", { name: "Saka" })
			.closest("tr") as HTMLElement;
		expect(within(sakaRow).getByText("Injured")).toHaveAttribute(
			"title",
			"Injured - 0% chance: Hamstring injury - Expected back next month",
		);
		expect(within(sakaRow).getByText("Inj")).toBeInTheDocument();
		expect(within(sakaRow).getByText("P")).toBeInTheDocument();

		const palmerRow = screen
			.getByRole("button", { name: "Palmer" })
			.closest("tr") as HTMLElement;
		expect(within(palmerRow).getByText("Doubtful")).toHaveAttribute(
			"title",
			"Doubtful - 75% chance: Late fitness test",
		);
		expect(within(palmerRow).getByText("Card Risk")).toHaveAttribute(
			"title",
			"4 yellow cards - suspension watch",
		);

		const gustoRow = screen
			.getByRole("button", { name: "Gusto" })
			.closest("tr") as HTMLElement;
		expect(within(gustoRow).getByText("Suspended")).toHaveAttribute(
			"title",
			"Suspended - 0% chance: Red card suspension",
		);
		expect(within(gustoRow).getByText("Card Risk")).toHaveAttribute(
			"title",
			"9 yellow cards - suspension watch",
		);
	});

	test("suppresses Good Hold for flagged starters with strong form and flags bench players", () => {
		const squadPicks: FplTeamPick[] = [
			...picks,
			{
				element: 4,
				web_name: "Haaland",
				position: "FWD",
				team_name: "Man City",
				squad_position: 3,
				multiplier: 1,
				is_captain: false,
				is_vice_captain: false,
				is_starting: true,
			},
		];
		const strongForm = (
			element: number,
			web_name: string,
			position: string,
			team_name: string,
		): FormPlayer =>
			makeForm({
				element,
				web_name,
				position,
				team_name,
				price: 10.0,
				window_xg90: 0.5,
				window_xa90: 0.2,
				window_xgi90: 0.7,
				season_xg90: 0.5,
				season_xa90: 0.2,
				season_xgi90: 0.7,
				est_xg90: 0.5,
				est_xa90: 0.2,
				est_xgi90: 0.7,
				projected_minutes: 90,
				projected_xgi: 0.7,
				window_xg90_per_million: 0.05,
				window_xa90_per_million: 0.02,
				window_xgi90_per_million: 0.07,
				season_points_per_million: 12,
				window_start_rate: 1.0,
				window_mins_per_appearance: 90,
				avg_fdr: 2.5,
				current_ownership: 35,
			});
		const currentPlayers: CurrentPlayerContext[] = [
			makeCurrent({
				element: 1,
				web_name: "Saka",
				position: "MID",
				team_name: "Arsenal",
				price: 10.0,
				avg_fdr: 2.5,
				current_ownership: 35,
				status: "i",
				chance_of_playing_next_round: 0,
				news: "Thigh injury",
				yellow_cards: 0,
				penalties_order: 1,
			}),
			makeCurrent({
				element: 2,
				web_name: "Palmer",
				position: "MID",
				team_name: "Chelsea",
				price: 10.5,
				avg_fdr: 2.5,
				current_ownership: 40,
				status: "a",
				yellow_cards: 4,
				penalties_order: 1,
			}),
			makeCurrent({
				element: 3,
				web_name: "Gusto",
				position: "DEF",
				team_name: "Chelsea",
				price: 5.0,
				avg_fdr: 2.5,
				current_ownership: 10,
				status: "n",
				chance_of_playing_next_round: 0,
				news: "Ineligible against parent club",
				yellow_cards: 4,
			}),
			makeCurrent({
				element: 4,
				web_name: "Haaland",
				position: "FWD",
				team_name: "Man City",
				price: 15.0,
				avg_fdr: 2.5,
				current_ownership: 70,
				status: "a",
				yellow_cards: 1,
				penalties_order: 1,
			}),
		];

		render(
			<SquadInspection
				picks={squadPicks}
				formPlayers={[
					strongForm(1, "Saka", "MID", "Arsenal"),
					strongForm(2, "Palmer", "MID", "Chelsea"),
					strongForm(3, "Gusto", "DEF", "Chelsea"),
					strongForm(4, "Haaland", "FWD", "Man City"),
				]}
				currentPlayers={currentPlayers}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={() => {}}
				onFindReplacement={() => {}}
			/>,
		);

		const sakaRow = screen
			.getByRole("button", { name: "Saka" })
			.closest("tr") as HTMLElement;
		expect(within(sakaRow).getByText("Injured")).toBeInTheDocument();
		expect(within(sakaRow).queryByText("Good Hold")).not.toBeInTheDocument();

		const palmerRow = screen
			.getByRole("button", { name: "Palmer" })
			.closest("tr") as HTMLElement;
		expect(within(palmerRow).getByText("Card Risk")).toBeInTheDocument();
		expect(within(palmerRow).queryByText("Good Hold")).not.toBeInTheDocument();

		const gustoRow = screen
			.getByRole("button", { name: "Gusto" })
			.closest("tr") as HTMLElement;
		expect(within(gustoRow).getByText("B1")).toBeInTheDocument();
		expect(within(gustoRow).getByText("Unavailable")).toHaveAttribute(
			"title",
			"Unavailable - 0% chance: Ineligible against parent club",
		);
		expect(within(gustoRow).getByText("Card Risk")).toBeInTheDocument();
		expect(within(gustoRow).queryByText("Good Hold")).not.toBeInTheDocument();

		const haalandRow = screen
			.getByRole("button", { name: "Haaland" })
			.closest("tr") as HTMLElement;
		expect(within(haalandRow).getByText("Good Hold")).toBeInTheDocument();
	});
});

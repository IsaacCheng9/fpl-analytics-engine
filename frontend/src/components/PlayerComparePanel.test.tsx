import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode, useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type {
	FormPlayer,
	PlayerDetail,
	PlayerGameweek,
	UpcomingFixture,
} from "../api";
import type { PlayerOption } from "./PlayerCombobox";
import { PlayerComparePanel } from "./PlayerComparePanel";

vi.mock("recharts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("recharts")>();
	return {
		...actual,
		// Supply fixed dimensions in jsdom so Recharts renders SVG series.
		ResponsiveContainer: ({ children }: { children: ReactNode }) =>
			isValidElement<{ width?: number; height?: number }>(children)
				? cloneElement(children, { width: 500, height: 180 })
				: children,
	};
});

const options: PlayerOption[] = [
	{ element: 1, web_name: "Mbeumo", position: "MID", team_name: "Man Utd" },
	{ element: 2, web_name: "Saka", position: "MID", team_name: "Arsenal" },
];

const leftFixtures: UpcomingFixture[] = [
	{
		gw: 11,
		opponent_name: "Bournemouth",
		opponent_short_name: "BOU",
		was_home: true,
		fdr: 2,
	},
	{
		gw: 13,
		opponent_name: "Chelsea",
		opponent_short_name: "CHE",
		was_home: false,
		fdr: 4,
	},
];

const rightFixtures: UpcomingFixture[] = [
	{
		gw: 11,
		opponent_name: "Everton",
		opponent_short_name: "EVE",
		was_home: false,
		fdr: 2,
	},
	{
		gw: 11,
		opponent_name: "Fulham",
		opponent_short_name: "FUL",
		was_home: true,
		fdr: 2,
	},
];

function makeGameweek(
	round: number,
	overrides: Partial<PlayerGameweek> = {},
): PlayerGameweek {
	return {
		round,
		kickoff_time: null,
		opponent_name: null,
		opponent_short_name: null,
		was_home: null,
		minutes: 90,
		total_points: 6,
		goals_scored: null,
		assists: null,
		bonus: null,
		price: 8.5,
		expected_goals: 0.3,
		expected_assists: 0.2,
		expected_goal_involvements: 0.5,
		defensive_contribution: 8,
		defcon_hit: false,
		rolling_xg90: 0.3,
		rolling_xa90: 0.2,
		rolling_xgi90: 0.5,
		rolling_defcon: 8,
		...overrides,
	};
}

function makeDetail(
	element: number,
	webName: string,
	teamName: string,
	gameweeks: PlayerGameweek[],
	{
		asOfGw = 5,
		nextFixtures = [],
	}: { asOfGw?: number; nextFixtures?: UpcomingFixture[] } = {},
): PlayerDetail {
	return {
		element,
		code: element * 100,
		as_of_gw: asOfGw,
		web_name: webName,
		position: "MID",
		team_name: teamName,
		rolling_window: 5,
		selected_season: "2026-27",
		available_seasons: ["2026-27"],
		next_fixtures: nextFixtures,
		gameweeks,
		seasons: [],
	};
}

function makeFormPlayer(
	element: number,
	webName: string,
	teamName: string,
	nextFixtures: UpcomingFixture[],
	avgFdr: number,
): FormPlayer {
	return {
		element,
		web_name: webName,
		position: "MID",
		team_name: teamName,
		price: 9.0,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.5,
		window_xa90: 0.3,
		window_xgi90: 0.8,
		season_xg90: 0.45,
		season_xa90: 0.25,
		season_xgi90: 0.7,
		delta_xg90: 0.05,
		delta_xa90: 0.05,
		delta_xgi90: 0.1,
		est_xg90: 0.48,
		est_xa90: 0.28,
		est_xgi90: 0.76,
		projected_minutes: 85,
		projected_xgi: 0.72,
		window_xg90_per_million: 0.055,
		window_xa90_per_million: 0.033,
		window_xgi90_per_million: 0.089,
		season_points_per_million: 7.5,
		window_start_rate: 1.0,
		window_mins_per_appearance: 90,
		upcoming_fixtures: nextFixtures.length,
		avg_fdr: avgFdr,
		next_fixture_gw: 11,
		next_opponent_name: nextFixtures[0]?.opponent_name ?? null,
		next_was_home: nextFixtures[0]?.was_home ?? null,
		next_fdr: nextFixtures[0]?.fdr ?? null,
		next_fixtures: nextFixtures,
		current_ownership: 25,
		as_of_gw: 10,
	};
}

function renderCompare({
	leftElement = 1,
	rightElement = 2,
	onSwap,
	onOpenPlayer = vi.fn(),
}: {
	leftElement?: number | null;
	rightElement?: number | null;
	onSwap?: () => void;
	onOpenPlayer?: (element: number) => void;
} = {}) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	function Wrapper() {
		const [left, setLeft] = useState<number | null>(leftElement);
		const [right, setRight] = useState<number | null>(rightElement);
		return (
			<PlayerComparePanel
				playerOptions={options}
				formPlayers={[]}
				defconPlayers={[]}
				defconProbabilityPlayers={[]}
				clubForms={[]}
				contextLoading={false}
				contextError={false}
				leftElement={left}
				rightElement={right}
				window={5}
				asOfGw={5}
				latestGw={5}
				onWindowChange={() => {}}
				onAsOfGwChange={() => {}}
				onLeftChange={setLeft}
				onRightChange={setRight}
				onSwap={() => {
					onSwap?.();
					setLeft(right);
					setRight(left);
				}}
				onOpenPlayer={onOpenPlayer}
				onClose={() => {}}
			/>
		);
	}

	render(
		<QueryClientProvider client={client}>
			<Wrapper />
		</QueryClientProvider>,
	);

	return { onOpenPlayer };
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			const detail = url.includes("/api/players/1?")
				? makeDetail(1, "Mbeumo", "Man Utd", [
						makeGameweek(1, { rolling_xgi90: 0.4, rolling_defcon: 7 }),
						makeGameweek(2, { rolling_xgi90: 0.55, rolling_defcon: 8.5 }),
					])
				: makeDetail(2, "Saka", "Arsenal", [
						makeGameweek(1, { rolling_xgi90: 0.65, rolling_defcon: 5 }),
						makeGameweek(2, { rolling_xgi90: 0.72, rolling_defcon: 6 }),
					]);
			return Promise.resolve(
				new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}),
	);
});

test("renders overlaid rolling trend charts and legend when two players are loaded", async () => {
	renderCompare();

	const trendsSection = await screen.findByRole("region", {
		name: "Rolling Trend Comparison",
	});
	const xgiHeading = within(trendsSection).getByRole("heading", {
		name: "Rolling xGI Per 90",
	});
	const defconHeading = within(trendsSection).getByRole("heading", {
		name: "Rolling DefCon (Mean Per Game)",
	});
	expect(xgiHeading).toBeInTheDocument();
	expect(defconHeading).toBeInTheDocument();
	expect(within(trendsSection).getByText("Mbeumo")).toBeInTheDocument();
	expect(within(trendsSection).getByText("Saka")).toBeInTheDocument();
	expect(
		within(trendsSection).queryByText(
			"No rolling data available for either player.",
		),
	).not.toBeInTheDocument();

	const xgiStrokes = Array.from(
		xgiHeading.parentElement?.querySelectorAll("path.recharts-line-curve") ??
			[],
	).map((path) => path.getAttribute("stroke"));
	const defconStrokes = Array.from(
		defconHeading.parentElement?.querySelectorAll("path.recharts-line-curve") ??
			[],
	).map((path) => path.getAttribute("stroke"));
	expect(xgiStrokes).toEqual(["#2563eb", "#ea580c"]);
	expect(defconStrokes).toEqual(["#2563eb", "#ea580c"]);
});

test("shows an empty note when neither player has rolling data and plots only the populated series when one has data", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			const detail = url.includes("/api/players/1?")
				? makeDetail(1, "Mbeumo", "Man Utd", [
						makeGameweek(1, { rolling_xgi90: 0.4, rolling_defcon: null }),
						makeGameweek(2, { rolling_xgi90: 0.5, rolling_defcon: null }),
					])
				: makeDetail(2, "Saka", "Arsenal", [
						makeGameweek(1, { rolling_xgi90: null, rolling_defcon: null }),
						makeGameweek(2, { rolling_xgi90: null, rolling_defcon: null }),
					]);
			return Promise.resolve(
				new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}),
	);

	renderCompare();

	const trendsSection = await screen.findByRole("region", {
		name: "Rolling Trend Comparison",
	});
	const xgiHeading = within(trendsSection).getByRole("heading", {
		name: "Rolling xGI Per 90",
	});
	const defconHeading = within(trendsSection).getByRole("heading", {
		name: "Rolling DefCon (Mean Per Game)",
	});

	// DefCon has no values for either player, while xGI plots only Mbeumo.
	const xgiStrokes = Array.from(
		xgiHeading.parentElement?.querySelectorAll("path.recharts-line-curve") ??
			[],
	).map((path) => path.getAttribute("stroke"));
	expect(xgiStrokes).toEqual(["#2563eb"]);
	expect(
		within(defconHeading.parentElement as HTMLElement).getByText(
			"No rolling data available for either player.",
		),
	).toBeInTheDocument();
	expect(
		defconHeading.parentElement?.querySelectorAll("path.recharts-line-curve"),
	).toHaveLength(0);
});

test("swaps left and right players", async () => {
	const onSwap = vi.fn();
	renderCompare({ onSwap });

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await within(dialog).findByRole("region", {
		name: "Rolling Trend Comparison",
	});

	expect(within(dialog).getByLabelText("First Player")).toHaveValue(
		"Mbeumo - Man Utd - MID",
	);
	expect(within(dialog).getByLabelText("Second Player")).toHaveValue(
		"Saka - Arsenal - MID",
	);

	const swapButton = within(dialog).getByRole("button", { name: "Swap" });
	expect(swapButton).toBeEnabled();
	fireEvent.click(swapButton);

	expect(onSwap).toHaveBeenCalledTimes(1);
	expect(within(dialog).getByLabelText("First Player")).toHaveValue(
		"Saka - Arsenal - MID",
	);
	expect(within(dialog).getByLabelText("Second Player")).toHaveValue(
		"Mbeumo - Man Utd - MID",
	);

	const headers = within(dialog).getAllByRole("columnheader");
	expect(headers[1]).toHaveTextContent("Saka");
	expect(headers[2]).toHaveTextContent("Mbeumo");
});

test("disables Swap when only one player is selected", () => {
	renderCompare({ leftElement: 1, rightElement: null });
	expect(screen.getByRole("button", { name: "Swap" })).toBeDisabled();
});

test("opens player detail when clicking either player column header", async () => {
	const onOpenPlayer = vi.fn();
	renderCompare({ onOpenPlayer });

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	const leftButton = await within(dialog).findByRole("button", {
		name: "Mbeumo",
	});
	const rightButton = within(dialog).getByRole("button", { name: "Saka" });
	expect(leftButton).toHaveAttribute("title", "Open player detail");
	expect(rightButton).toHaveAttribute("title", "Open player detail");

	fireEvent.click(leftButton);
	fireEvent.click(rightButton);

	expect(onOpenPlayer).toHaveBeenNthCalledWith(1, 1);
	expect(onOpenPlayer).toHaveBeenNthCalledWith(2, 2);
});

test("renders both players' 5-GW fixture strips side by side in the Fixtures section", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			const detail = url.includes("/players/1")
				? makeDetail(1, "Saka", "Arsenal", [], {
						asOfGw: 10,
						nextFixtures: leftFixtures,
					})
				: makeDetail(2, "Palmer", "Chelsea", [], {
						asOfGw: 10,
						nextFixtures: rightFixtures,
					});
			return Promise.resolve(
				new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}),
	);

	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<PlayerComparePanel
				playerOptions={[
					{
						element: 1,
						web_name: "Saka",
						position: "MID",
						team_name: "Arsenal",
					},
					{
						element: 2,
						web_name: "Palmer",
						position: "MID",
						team_name: "Chelsea",
					},
				]}
				formPlayers={[
					makeFormPlayer(1, "Saka", "Arsenal", leftFixtures, 3.0),
					makeFormPlayer(2, "Palmer", "Chelsea", rightFixtures, 2.0),
				]}
				defconPlayers={[]}
				defconProbabilityPlayers={[]}
				clubForms={[]}
				contextLoading={false}
				contextError={false}
				leftElement={1}
				rightElement={2}
				window={5}
				asOfGw={10}
				latestGw={10}
				onWindowChange={() => {}}
				onAsOfGwChange={() => {}}
				onLeftChange={() => {}}
				onRightChange={() => {}}
				onSwap={() => {}}
				onOpenPlayer={() => {}}
				onClose={() => {}}
			/>
		</QueryClientProvider>,
	);

	const dialog = await screen.findByRole("dialog", {
		name: "Compare Players",
	});
	const row = (await within(dialog).findByText("Next 5 Fixtures")).closest(
		"tr",
	);
	expect(row).not.toBeNull();
	expect(within(dialog).getByText("Fixtures")).toBeInTheDocument();

	const cells = within(row as HTMLElement).getAllByRole("cell");
	expect(within(cells[0]).getByText("BOU (H)")).toHaveAttribute(
		"title",
		"GW11: Bournemouth (H) - FDR 2",
	);
	expect(within(cells[0]).getByText("CHE (A)")).toHaveAttribute(
		"title",
		"GW13: Chelsea (A) - FDR 4",
	);
	expect(within(cells[0]).getAllByText("BGW")).toHaveLength(3);

	expect(within(cells[1]).getByText("EVE (A)")).toBeInTheDocument();
	expect(within(cells[1]).getByText("FUL (H)")).toBeInTheDocument();
	expect(within(cells[1]).getByText("EVE (A)").parentElement).toHaveAttribute(
		"title",
		"GW11 (DGW): Everton (A) - FDR 2 / Fulham (H) - FDR 2",
	);
});

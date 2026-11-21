import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode, useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PlayerDetail, PlayerGameweek } from "../api";
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

function makeGameweek(
	round: number,
	overrides: Partial<PlayerGameweek> = {},
): PlayerGameweek {
	return {
		round,
		kickoff_time: null,
		minutes: 90,
		total_points: 6,
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
): PlayerDetail {
	return {
		element,
		code: element * 100,
		as_of_gw: 5,
		web_name: webName,
		position: "MID",
		team_name: teamName,
		rolling_window: 5,
		selected_season: "2025-26",
		available_seasons: ["2025-26"],
		gameweeks,
		seasons: [],
	};
}

function renderCompare({
	leftElement = 1,
	rightElement = 2,
}: {
	leftElement?: number | null;
	rightElement?: number | null;
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
				onClose={() => {}}
			/>
		);
	}

	render(
		<QueryClientProvider client={client}>
			<Wrapper />
		</QueryClientProvider>,
	);
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

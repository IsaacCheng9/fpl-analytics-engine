import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

const meta = { name: "fpl-analytics-engine", latest_gw: 38 };
const formRows = [
	{
		element: 1,
		web_name: "Mbeumo",
		position: "MID",
		team_name: "Man Utd",
		price: 8,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.5,
		window_xa90: 0.4,
		window_xgi90: 0.97,
		season_xg90: 0.3,
		season_xa90: 0.26,
		season_xgi90: 0.56,
		delta_xg90: 0.2,
		delta_xa90: 0.14,
		delta_xgi90: 0.41,
		window_xg90_per_million: 0.06,
		window_xa90_per_million: 0.05,
		window_xgi90_per_million: 0.12,
		season_points_per_million: 5.0,
		window_start_rate: 1.0,
		window_mins_per_appearance: 88,
		upcoming_fixtures: 5,
		avg_fdr: 2.6,
		current_ownership: 25.5,
		as_of_gw: 38,
	},
	{
		element: 2,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		price: 10,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.3,
		window_xa90: 0.5,
		window_xgi90: 0.8,
		season_xg90: 0.28,
		season_xa90: 0.34,
		season_xgi90: 0.62,
		delta_xg90: 0.02,
		delta_xa90: 0.16,
		delta_xgi90: 0.18,
		window_xg90_per_million: 0.03,
		window_xa90_per_million: 0.05,
		window_xgi90_per_million: 0.08,
		season_points_per_million: 4.2,
		window_start_rate: 0.8,
		window_mins_per_appearance: 79,
		upcoming_fixtures: 5,
		avg_fdr: 3.4,
		current_ownership: 40.1,
		as_of_gw: 38,
	},
];
const broadFormRows = [
	...formRows,
	{
		element: 3,
		web_name: "Haaland",
		position: "FWD",
		team_name: "Man City",
		price: 14,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.7,
		window_xa90: 0.1,
		window_xgi90: 0.8,
		season_xg90: 0.8,
		season_xa90: 0.15,
		season_xgi90: 0.95,
		delta_xg90: -0.1,
		delta_xa90: -0.05,
		delta_xgi90: -0.15,
		window_xg90_per_million: 0.05,
		window_xa90_per_million: 0.01,
		window_xgi90_per_million: 0.06,
		season_points_per_million: 4.8,
		window_start_rate: 1.0,
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		current_ownership: 55.2,
		as_of_gw: 38,
	},
];

// Deliberately omits the fixture/value context fields to mimic an older API
// payload; the view must degrade to dashes rather than crash on missing fields.
const probRows = [
	{
		element: 1,
		web_name: "Senesi",
		position: "DEF",
		team_name: "Bournemouth",
		games: 15,
		hits: 12,
		raw_rate: 0.8,
		prob: 0.52,
		prob_std: 0.1,
		as_of_gw: 38,
	},
];

const playerDetail = {
	element: 1,
	code: 9999,
	web_name: "Mbeumo",
	position: "MID",
	team_name: "Man Utd",
	rolling_window: 5,
	selected_season: "2025-26",
	gameweeks: [
		{
			round: 1,
			kickoff_time: null,
			minutes: 90,
			total_points: 6,
			price: 8,
			expected_goals: 0.5,
			expected_assists: 0.4,
			expected_goal_involvements: 0.9,
			defensive_contribution: 11,
			defcon_hit: false,
			rolling_xg90: 0.5,
			rolling_xa90: 0.4,
			rolling_xgi90: 0.9,
			rolling_defcon: 1.5,
		},
	],
	seasons: [
		{
			season: "2025-26",
			games: 1,
			minutes: 90,
			points: 6,
			xg90: 0.5,
			xa90: 0.4,
			xgi90: 0.9,
			points_per_million: 0.75,
			defcon_hit_rate: 0,
		},
		{
			season: "2024-25",
			games: 38,
			minutes: 3000,
			points: 200,
			xg90: 0.4,
			xa90: 0.3,
			xgi90: 0.7,
			points_per_million: 30,
			defcon_hit_rate: null,
		},
	],
};

beforeEach(() => {
	window.history.replaceState(null, "", "/");
	vi.stubGlobal(
		"fetch",
		vi.fn((input: string) => {
			let body: unknown = meta;
			if (input.includes("/players/form")) {
				const params = new URL(input, "http://test").searchParams;
				body = params.get("min_delta") === "-1000" ? broadFormRows : formRows;
			} else if (input.includes("/players/defcon-probability")) {
				body = probRows;
			} else if (/\/players\/\d+/.test(input)) {
				body = playerDetail;
			} else if (input.includes("/players/")) {
				body = [];
			}
			return Promise.resolve(
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}),
	);
});

function withProviders(children: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("renders the attacking form table with flagged players", async () => {
	render(withProviders(<App />));
	expect(screen.getByText("FPL Form Scout")).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
});

test("filters the table by the player search box", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Saka")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByPlaceholderText("e.g. Saka"), {
		target: { value: "Mbe" },
	});

	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(screen.queryByText("Saka")).not.toBeInTheDocument();
});

test("shows the full pool by default and search bypasses the Min Delta filter", async () => {
	render(withProviders(<App />));
	// No delta floor by default, so even a declining player is present.
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	// Applying a Min Delta filter drops the declining player from the pool.
	fireEvent.change(screen.getByPlaceholderText("Any"), {
		target: { value: "0.1" },
	});
	await waitFor(() => {
		expect(screen.queryByText("Haaland")).not.toBeInTheDocument();
	});

	// Searching queries the full pool, so the filtered-out player still appears.
	fireEvent.change(screen.getByPlaceholderText("e.g. Saka"), {
		target: { value: "Haaland" },
	});
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
});

test("toggles attacking form metric columns", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	expect(screen.getByText("Window xG Per 90")).toBeInTheDocument();
	expect(screen.queryByText("Window xA Per 90")).not.toBeInTheDocument();
	expect(screen.getByText("Window xGI Per 90")).toBeInTheDocument();
	expect(screen.getByText("Season xG Per 90")).toBeInTheDocument();
	expect(screen.getByText("Season xGI Per 90")).toBeInTheDocument();
	expect(screen.getByText("Delta xG Per 90")).toBeInTheDocument();
	expect(screen.getByText("Delta xGI Per 90")).toBeInTheDocument();
	expect(screen.getByText("xG Per 90 Per £m")).toBeInTheDocument();
	expect(screen.getByText("xGI Per 90 Per £m")).toBeInTheDocument();

	fireEvent.click(screen.getByLabelText("xA"));

	await waitFor(() => {
		expect(screen.getByText("Window xA Per 90")).toBeInTheDocument();
	});
	expect(screen.getByText("Season xA Per 90")).toBeInTheDocument();
	expect(screen.getByText("Delta xA Per 90")).toBeInTheDocument();
	expect(screen.getByText("xA Per 90 Per £m")).toBeInTheDocument();

	const headers = screen
		.getAllByRole("columnheader")
		.map((header) => header.textContent ?? "");
	const headerIndex = (text: string) =>
		headers.findIndex((header) => header.includes(text));
	const metricLabels = screen
		.getAllByRole("checkbox")
		.map((checkbox) => checkbox.parentElement?.textContent ?? "");
	expect(metricLabels).toEqual(["xGI", "xG", "xA"]);
	expect(headerIndex("Window xGI Per 90")).toBeLessThan(
		headerIndex("Season xGI Per 90"),
	);
	expect(headerIndex("Season xGI Per 90")).toBeLessThan(
		headerIndex("Delta xGI Per 90"),
	);
	expect(headerIndex("Delta xGI Per 90")).toBeLessThan(
		headerIndex("xGI Per 90 Per £m"),
	);
	expect(headerIndex("xGI Per 90 Per £m")).toBeLessThan(
		headerIndex("Window xG Per 90"),
	);
	expect(headerIndex("xG Per 90 Per £m")).toBeLessThan(
		headerIndex("Window xA Per 90"),
	);
});

test("renders the DefCon Probability tab even when context fields are absent", async () => {
	render(withProviders(<App />));
	fireEvent.click(screen.getByText("DefCon Probability"));
	await waitFor(() => {
		expect(screen.getByText("Senesi")).toBeInTheDocument();
	});
});

test("clicking a row opens the player detail panel", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	fireEvent.click(screen.getByText("Mbeumo"));

	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	expect(screen.getByText("Rolling xG Per 90")).toBeInTheDocument();
	expect(screen.getByText("Rolling xA Per 90")).toBeInTheDocument();
	expect(screen.getByText("Rolling xGI Per 90")).toBeInTheDocument();
	expect(screen.getAllByText("2024-25")).toHaveLength(2);
	const gameweekTable = screen.getByRole("heading", {
		name: "2025-26 by Gameweek",
	}).nextElementSibling as HTMLElement;
	expect(within(gameweekTable).getByText("11")).toBeInTheDocument();
});

test("initialises filters and player panel state from the URL", async () => {
	window.history.replaceState(
		null,
		"",
		"/?tab=defcon-prob&q=Sen&position=DEF&team=Bournemouth&min_games=10&as_of_gw=20&player=1&player_window=6&season=2024-25",
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Senesi")).toBeInTheDocument();
	});
	expect(screen.getByPlaceholderText("e.g. Saka")).toHaveValue("Sen");
	expect(screen.getByLabelText("Position")).toHaveValue("DEF");
	expect(screen.getByLabelText("Team")).toHaveValue("Bournemouth");
	expect(screen.getByLabelText("Min Games")).toHaveValue(10);
	expect(screen.getByLabelText(/As Of GW/)).toHaveValue("20");

	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
	expect(
		calls.some((input) =>
			input.includes("/api/players/1?window=6&season=2024-25"),
		),
	).toBe(true);
});

test("persists filter changes and player panel state to the URL", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByPlaceholderText("e.g. Saka"), {
		target: { value: "Saka" },
	});
	fireEvent.change(screen.getByLabelText("Position"), {
		target: { value: "MID" },
	});
	fireEvent.click(screen.getByLabelText("xA"));
	fireEvent.click(screen.getByText("DefCon Form"));
	fireEvent.change(screen.getByLabelText("Min Hit Rate"), {
		target: { value: "0.4" },
	});
	fireEvent.change(screen.getByLabelText(/As Of GW/), {
		target: { value: "20" },
	});

	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("tab")).toBe("defcon");
		expect(params.get("q")).toBe("Saka");
		expect(params.get("position")).toBe("MID");
		expect(params.get("min_hit_rate")).toBe("0.4");
		expect(params.get("as_of_gw")).toBe("20");
		expect(params.get("metrics")).toBe("xgi,xg,xa");
	});

	fireEvent.click(screen.getByText("Attacking Form"));
	await waitFor(() => {
		expect(screen.getByText("Saka")).toBeInTheDocument();
	});
	fireEvent.click(screen.getByText("Saka"));
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("player")).toBe("2");
	});
	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	fireEvent.change(screen.getByLabelText("Rolling Window (Games)"), {
		target: { value: "6" },
	});
	await waitFor(() => {
		expect(screen.getByLabelText("Season")).toBeInTheDocument();
	});
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: "2024-25" },
	});

	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("player")).toBe("2");
		expect(params.get("player_window")).toBe("6");
		expect(params.get("season")).toBe("2024-25");
	});

	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("player")).toBeNull();
		expect(params.get("player_window")).toBeNull();
		expect(params.get("season")).toBeNull();
	});
});

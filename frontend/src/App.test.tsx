import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
		season_xgi90: 0.56,
		delta_xgi90: 0.41,
		window_xgi90_per_million: 0.12,
		season_points_per_million: 5.0,
		window_start_rate: 1.0,
		upcoming_fixtures: 5,
		avg_fdr: 2.6,
		current_ownership: 25.5,
		current_chance_of_playing: 100,
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
		season_xgi90: 0.62,
		delta_xgi90: 0.18,
		window_xgi90_per_million: 0.08,
		season_points_per_million: 4.2,
		window_start_rate: 0.8,
		upcoming_fixtures: 5,
		avg_fdr: 3.4,
		current_ownership: 40.1,
		current_chance_of_playing: 75,
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

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: string) => {
			let body: unknown = meta;
			if (input.includes("/players/form")) {
				body = formRows;
			} else if (input.includes("/players/defcon-probability")) {
				body = probRows;
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

	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.queryByText("Saka")).not.toBeInTheDocument();
});

test("renders the DefCon Probability tab even when context fields are absent", async () => {
	render(withProviders(<App />));
	fireEvent.click(screen.getByText("DefCon Probability"));
	await waitFor(() => {
		expect(screen.getByText("Senesi")).toBeInTheDocument();
	});
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
		as_of_gw: 38,
	},
];

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: string) => {
			const body = input.includes("/players/form") ? formRows : meta;
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

test("renders the attacking form table with a flagged player", async () => {
	render(withProviders(<App />));
	expect(screen.getByText("FPL Form Scout")).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
});

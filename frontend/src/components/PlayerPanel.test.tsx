import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PlayerDetail } from "../api";
import { PlayerPanel } from "./PlayerPanel";

const currentSeason = "2026-27";
const previousSeason = "2025-26";
const olderSeason = "2024-25";

function mockApiFetch(input: RequestInfo | URL): Promise<Response> {
	const url = new URL(String(input), "http://test");
	const season = url.searchParams.get("season") ?? currentSeason;
	const detail: PlayerDetail = {
		element: 7,
		code: 500,
		as_of_gw:
			season === currentSeason
				? Number(url.searchParams.get("as_of_gw") ?? 2)
				: 38,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		rolling_window: Number(url.searchParams.get("window") ?? 5),
		selected_season: season,
		available_seasons: [olderSeason, previousSeason, currentSeason],
		gameweeks: [],
		seasons: [],
	};
	return Promise.resolve(
		new Response(
			JSON.stringify(
				url.pathname === "/api/"
					? { season: currentSeason, latest_gw: 2, data_status: "ready" }
					: detail,
			),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		),
	);
}

function Panel({
	initialSeason = null,
	asOfGw = 2,
}: {
	initialSeason?: string | null;
	asOfGw?: number;
}) {
	const [season, setSeason] = useState(initialSeason);
	const [window, setWindow] = useState(5);
	return (
		<PlayerPanel
			element={7}
			window={window}
			season={season}
			asOfGw={asOfGw}
			onWindowChange={setWindow}
			onSeasonChange={setSeason}
			onClose={() => {}}
		/>
	);
}

function renderPanel(
	initialSeason: string | null = null,
	client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	}),
) {
	render(
		<QueryClientProvider client={client}>
			<Panel initialSeason={initialSeason} />
		</QueryClientProvider>,
	);
	return client;
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn(mockApiFetch));
});

test("uses the historical season's latest cutoff and restores the current cutoff", async () => {
	renderPanel();
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith("/api/players/7?window=5&as_of_gw=2");

	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: previousSeason },
	});
	await screen.findByRole("heading", { name: `${previousSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith("/api/players/7?window=5&season=2025-26");
	expect(screen.getByText(/As Of GW 38/)).toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Rolling Window (Gameweeks)"), {
		target: { value: "6" },
	});
	await waitFor(() => {
		expect(fetch).toHaveBeenCalledWith(
			"/api/players/7?window=6&season=2025-26",
		);
	});
	await screen.findByRole("heading", { name: `${previousSeason} by Gameweek` });

	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: currentSeason },
	});
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=6&season=2026-27&as_of_gw=2",
	);
	expect(screen.getByText(/As Of GW 2/)).toBeInTheDocument();
});

test("preserves the cutoff when opening an explicitly selected current season", async () => {
	renderPanel(currentSeason);
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27&as_of_gw=2",
	);
	expect(fetch).not.toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27",
	);
});

test("keeps selectors usable after a failed season request without stale charts", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			if (String(input).includes(`season=${previousSeason}`)) {
				return Promise.resolve(new Response(null, { status: 404 }));
			}
			return mockApiFetch(input);
		}),
	);
	renderPanel();
	await screen.findByText("Season History");
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: previousSeason },
	});
	await screen.findByText("Failed to load player.");
	expect(screen.getByLabelText("Season")).toHaveValue(previousSeason);
	expect(screen.getByLabelText("Season")).toBeEnabled();
	expect(screen.getByRole("option", { name: olderSeason })).toBeInTheDocument();
	expect(screen.queryByText("Season History")).not.toBeInTheDocument();
	expect(screen.queryByText("Rolling xG Per 90")).not.toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Rolling Window (Gameweeks)"), {
		target: { value: "6" },
	});
	await waitFor(() => {
		expect(fetch).toHaveBeenCalledWith(
			"/api/players/7?window=6&season=2025-26",
		);
	});
	await screen.findByText("Failed to load player.");
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: olderSeason },
	});
	await screen.findByRole("heading", { name: `${olderSeason} by Gameweek` });
	expect(screen.queryByText("Failed to load player.")).not.toBeInTheDocument();
});

test("can return to the current season after an initial historical request fails", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			if (String(input).includes(`season=${previousSeason}`)) {
				return Promise.resolve(new Response(null, { status: 422 }));
			}
			return mockApiFetch(input);
		}),
	);
	renderPanel(previousSeason);
	await screen.findByText("Failed to load player.");
	expect(screen.getByLabelText("Season")).toHaveValue(previousSeason);
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: currentSeason },
	});
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27&as_of_gw=2",
	);
});

test("shows current detail and its selected season when metadata fails", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) =>
			String(input) === "/api/"
				? Promise.resolve(new Response(null, { status: 503 }))
				: mockApiFetch(input),
		),
	);
	const client = renderPanel();
	await waitFor(() => {
		expect(client.getQueryState(["meta"])?.status).toBe("error");
	});
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(screen.getByLabelText("Season")).toHaveValue(currentSeason);
	expect(screen.queryByText("Failed to load player.")).not.toBeInTheDocument();
});

test("keeps cached metadata usable after a failed refetch", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	client.setQueryData(["meta"], { season: currentSeason, latest_gw: 2 });
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) =>
			String(input) === "/api/"
				? Promise.resolve(new Response(null, { status: 503 }))
				: mockApiFetch(input),
		),
	);
	renderPanel(previousSeason, client);
	await waitFor(() => {
		expect(client.getQueryState(["meta"])?.status).toBe("error");
	});
	await screen.findByRole("heading", { name: `${previousSeason} by Gameweek` });
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: currentSeason },
	});
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27&as_of_gw=2",
	);
});

test("retries missing metadata before requesting an explicit current season", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockImplementation(mockApiFetch),
	);
	renderPanel(currentSeason);
	await screen.findByText("Failed to load player.");
	expect(fetch).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await screen.findByRole("heading", { name: `${currentSeason} by Gameweek` });
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27&as_of_gw=2",
	);
	expect(fetch).not.toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27",
	);
});

test("keeps selectors usable while loading and ignores a superseded response", async () => {
	let resolvePrevious!: (response: Response) => void;
	const previousResponse = new Promise<Response>((resolve) => {
		resolvePrevious = resolve;
	});
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) =>
			String(input).includes(`season=${previousSeason}`)
				? previousResponse
				: mockApiFetch(input),
		),
	);
	const client = renderPanel();
	await screen.findByText("Season History");
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: previousSeason },
	});
	await screen.findByText("Loading...");
	expect(screen.getByLabelText("Season")).toHaveValue(previousSeason);
	expect(screen.getByLabelText("Season")).toBeEnabled();
	expect(screen.getByLabelText("Rolling Window (Gameweeks)")).toBeEnabled();
	expect(screen.queryByText("Season History")).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: olderSeason },
	});
	await screen.findByRole("heading", { name: `${olderSeason} by Gameweek` });
	await act(async () => {
		resolvePrevious(await mockApiFetch("/api/players/7?season=2025-26"));
	});
	await waitFor(() => {
		expect(
			client.getQueryState(["player", 7, 5, previousSeason, null])?.status,
		).toBe("success");
	});
	expect(screen.getByLabelText("Season")).toHaveValue(olderSeason);
	expect(
		screen.getByRole("heading", { name: `${olderSeason} by Gameweek` }),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("heading", { name: `${previousSeason} by Gameweek` }),
	).not.toBeInTheDocument();
});

test("does not reuse cached live detail after the main cutoff changes", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	const view = render(
		<QueryClientProvider client={client}>
			<Panel initialSeason={currentSeason} />
		</QueryClientProvider>,
	);
	await screen.findByText(/As Of GW 2/);
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: previousSeason },
	});
	await screen.findByText(/As Of GW 38/);
	view.rerender(
		<QueryClientProvider client={client}>
			<Panel initialSeason={currentSeason} asOfGw={1} />
		</QueryClientProvider>,
	);
	expect(screen.getByText(/As Of GW 38/)).toBeInTheDocument();
	expect(fetch).not.toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2025-26&as_of_gw=1",
	);
	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: currentSeason },
	});
	await screen.findByText(/As Of GW 1/);
	expect(fetch).toHaveBeenCalledWith(
		"/api/players/7?window=5&season=2026-27&as_of_gw=1",
	);
});

test("retries a failed player request without changing the selection", async () => {
	let failed = false;
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL) => {
			if (String(input).includes("/api/players/") && !failed) {
				failed = true;
				return Promise.resolve(new Response(null, { status: 503 }));
			}
			return mockApiFetch(input);
		}),
	);
	renderPanel(previousSeason);
	await screen.findByText("Failed to load player.");
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await screen.findByRole("heading", { name: `${previousSeason} by Gameweek` });
	expect(screen.getByLabelText("Season")).toHaveValue(previousSeason);
});

test("labels each chart's season average beside its title", async () => {
	vi.mocked(fetch).mockImplementation(async (input) => {
		const response = await mockApiFetch(input);
		if (new URL(String(input), "http://test").pathname === "/api/") {
			return response;
		}
		const detail = (await response.json()) as PlayerDetail;
		const gameweek = {
			round: 1,
			kickoff_time: null,
			minutes: 90,
			total_points: 2,
			price: 10,
			expected_goals: 0.3,
			expected_assists: 0.2,
			expected_goal_involvements: 0.5,
			defensive_contribution: 6,
			defcon_hit: false,
			rolling_xg90: 0.3,
			rolling_xa90: 0.2,
			rolling_xgi90: 0.5,
			rolling_defcon: 6,
		};
		return new Response(
			JSON.stringify({
				...detail,
				gameweeks: [
					gameweek,
					{ ...gameweek, round: 2, defensive_contribution: 10 },
				],
				seasons: [
					{
						season: currentSeason,
						games: 2,
						minutes: 180,
						points: 4,
						xg90: 0.32,
						xa90: 0.21,
						xgi90: 0.53,
						points_per_million: 0.4,
						defcon_hit_rate: 0,
					},
				],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	renderPanel();

	expect(await screen.findByText("Season 0.32")).toBeInTheDocument();
	expect(screen.getByText("Season 0.21")).toBeInTheDocument();
	expect(screen.getByText("Season 0.53")).toBeInTheDocument();
	expect(screen.getByText("Season 8.00")).toBeInTheDocument();
});

test("exposes dialog semantics and closes on Escape", async () => {
	const onClose = vi.fn();
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<PlayerPanel
				element={7}
				window={5}
				season={null}
				asOfGw={2}
				onWindowChange={() => {}}
				onSeasonChange={() => {}}
				onClose={onClose}
			/>
		</QueryClientProvider>,
	);

	const dialog = await screen.findByRole("dialog", { name: "Saka" });
	expect(dialog).toHaveAttribute("aria-modal", "true");
	fireEvent.keyDown(document, { key: "Escape" });
	expect(onClose).toHaveBeenCalledTimes(1);
});

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
		next_fixtures:
			season === currentSeason
				? [
						{
							gw: Number(url.searchParams.get("as_of_gw") ?? 2) + 1,
							opponent_name: "Bournemouth",
							opponent_short_name: "BOU",
							was_home: true,
							fdr: 2,
						},
					]
				: [],
		gameweeks: [],
		seasons: [],
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
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
			opponent_name: "Bournemouth",
			opponent_short_name: "BOU",
			was_home: true,
			minutes: 90,
			total_points: 2,
			goals_scored: 0,
			assists: 0,
			bonus: 0,
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

test("shows upcoming fixture strip on live season and match context or dashes by season", async () => {
	vi.mocked(fetch).mockImplementation(async (input) => {
		const response = await mockApiFetch(input);
		const url = new URL(String(input), "http://test");
		if (url.pathname === "/api/") {
			return response;
		}
		const detail = (await response.json()) as PlayerDetail;
		const isOlder = detail.selected_season === olderSeason;
		return new Response(
			JSON.stringify({
				...detail,
				gameweeks: [
					{
						round: 1,
						kickoff_time: "2026-08-15T15:00:00Z",
						opponent_name: isOlder ? null : "Bournemouth",
						opponent_short_name: isOlder ? null : "BOU",
						was_home: isOlder ? null : true,
						minutes: 90,
						total_points: 11,
						goals_scored: isOlder ? null : 1,
						assists: isOlder ? null : 1,
						bonus: isOlder ? null : 3,
						price: 10,
						expected_goals: 0.5,
						expected_assists: 0.3,
						expected_goal_involvements: 0.8,
						defensive_contribution: isOlder ? null : 6,
						defcon_hit: isOlder ? null : false,
						rolling_xg90: 0.5,
						rolling_xa90: 0.3,
						rolling_xgi90: 0.8,
						rolling_defcon: isOlder ? null : 6,
					},
				],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	renderPanel();

	expect(
		await screen.findByText("Upcoming Fixtures (Next 5)"),
	).toBeInTheDocument();
	expect(screen.getAllByText("BOU (H)").length).toBeGreaterThanOrEqual(2);
	expect(screen.getByTitle("Bournemouth (H)")).toBeInTheDocument();
	expect(screen.getByRole("columnheader", { name: "Opp" })).toBeInTheDocument();
	expect(screen.getByRole("columnheader", { name: "G" })).toBeInTheDocument();
	expect(screen.getByRole("columnheader", { name: "A" })).toBeInTheDocument();
	expect(
		screen.getByRole("columnheader", { name: "Bonus" }),
	).toBeInTheDocument();

	const liveTables = screen.getAllByRole("table");
	const gwRows = liveTables[1].querySelectorAll("tbody tr");
	const liveCells = Array.from(gwRows[0].querySelectorAll("td")).map(
		(cell) => cell.textContent,
	);
	expect(liveCells.slice(0, 7)).toEqual([
		"1",
		"BOU (H)",
		"90",
		"11",
		"1",
		"1",
		"3",
	]);

	fireEvent.change(screen.getByLabelText("Season"), {
		target: { value: olderSeason },
	});
	await screen.findByRole("heading", { name: `${olderSeason} by Gameweek` });
	expect(
		screen.queryByText("Upcoming Fixtures (Next 5)"),
	).not.toBeInTheDocument();
	const olderTables = screen.getAllByRole("table");
	const olderCells = Array.from(
		olderTables[1].querySelectorAll("tbody tr")[0].querySelectorAll("td"),
	).map((cell) => cell.textContent);
	expect(olderCells.slice(0, 7)).toEqual(["1", "-", "90", "11", "-", "-", "-"]);
});

test("displays live availability banner, set-piece duties, and yellow cards", async () => {
	vi.mocked(fetch).mockImplementation(async (input) => {
		const response = await mockApiFetch(input);
		if (new URL(String(input), "http://test").pathname === "/api/") {
			return response;
		}
		const detail = (await response.json()) as PlayerDetail;
		return new Response(
			JSON.stringify({
				...detail,
				status: "i",
				chance_of_playing_next_round: 0,
				news: "Hamstring injury - Expected back in GW14",
				yellow_cards: 4,
				penalties_order: 1,
				corners_order: 1,
				direct_freekicks_order: 1,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	renderPanel();

	const banner = await screen.findByRole("status");
	expect(banner).toHaveTextContent("Injured - 0% chance of playing");
	expect(banner).toHaveTextContent("Hamstring injury - Expected back in GW14");
	expect(screen.getByText("P")).toHaveAttribute(
		"title",
		"Primary penalty taker",
	);
	expect(screen.getByText("C")).toHaveAttribute(
		"title",
		"Primary corner and indirect free-kick taker",
	);
	expect(screen.getByText("FK")).toHaveAttribute(
		"title",
		"Primary direct free-kick taker",
	);
	expect(
		screen.getByText("Set Pieces: Penalties, Corners, Free Kicks"),
	).toBeInTheDocument();
	expect(
		screen.getByText("Yellow Cards: 4 (suspension watch)"),
	).toBeInTheDocument();
});

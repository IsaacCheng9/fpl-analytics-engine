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
import type { CurrentPlayerContext } from "./api";

const meta = {
	name: "fpl-analytics-engine",
	season: "2025-26",
	latest_gw: 38,
	data_status: "ready",
	next_deadline: null,
};
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
		est_xg90: 0.32,
		est_xa90: 0.28,
		est_xgi90: 0.6,
		projected_minutes: 85,
		projected_xgi: 0.57,
		window_start_rate: 1.0,
		window_mins_per_appearance: 88,
		upcoming_fixtures: 5,
		avg_fdr: 2.6,
		next_fixture_gw: 39,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
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
		est_xg90: 0.3,
		est_xa90: 0.33,
		est_xgi90: 0.63,
		projected_minutes: 76,
		projected_xgi: 0.53,
		window_start_rate: 0.8,
		window_mins_per_appearance: 79,
		upcoming_fixtures: 5,
		avg_fdr: 3.4,
		next_fixture_gw: 39,
		next_opponent_name: "Chelsea",
		next_was_home: false,
		next_fdr: 4,
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
		est_xg90: 0.78,
		est_xa90: 0.16,
		est_xgi90: 0.94,
		projected_minutes: 90,
		projected_xgi: 0.94,
		window_start_rate: 1.0,
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 39,
		next_opponent_name: "Brighton",
		next_was_home: true,
		next_fdr: 3,
		current_ownership: 55.2,
		as_of_gw: 38,
	},
];
const withHistoricalFixtureContext = <T extends typeof broadFormRows>(
	rows: T,
): T =>
	rows.map((row) => ({
		...row,
		next_fixture_gw: 31,
		next_opponent_name: "Historical",
		next_was_home: true,
		next_fdr: 5,
	})) as T;
const currentPlayerContexts: CurrentPlayerContext[] = broadFormRows.map(
	(row) => ({
		element: row.element,
		web_name: row.web_name,
		position: row.position,
		team_name: row.team_name,
		price: row.price,
		current_ownership: row.current_ownership,
		upcoming_fixtures: row.upcoming_fixtures,
		avg_fdr: row.avg_fdr,
		next_fixture_gw: row.next_fixture_gw,
		next_opponent_name: row.next_opponent_name,
		next_was_home: row.next_was_home,
		next_fdr: row.next_fdr,
	}),
);
const clubRows = [
	{
		team: 1,
		team_name: "Arsenal",
		window_matches: 5,
		season_matches: 38,
		window_xg_per_match: 2.1,
		season_xg_per_match: 1.7,
		delta_xg_per_match: 0.4,
		window_goals_for_per_match: 2.4,
		season_goals_for_per_match: 1.9,
		delta_goals_for_per_match: 0.5,
		window_xgc_per_match: 0.8,
		season_xgc_per_match: 1.1,
		delta_xgc_per_match: -0.3,
		window_goals_against_per_match: 0.6,
		season_goals_against_per_match: 0.9,
		delta_goals_against_per_match: -0.3,
		window_finishing_delta: 0.3,
		window_concession_delta: -0.2,
		attack_form: 0.4,
		defence_form: 0.3,
		upcoming_fixtures: 5,
		avg_fdr: 2.4,
		as_of_gw: 38,
	},
	{
		team: 3,
		team_name: "Man Utd",
		window_matches: 5,
		season_matches: 38,
		window_xg_per_match: 1.8,
		season_xg_per_match: 1.5,
		delta_xg_per_match: 0.3,
		window_goals_for_per_match: 1.6,
		season_goals_for_per_match: 1.4,
		delta_goals_for_per_match: 0.2,
		window_xgc_per_match: 1.2,
		season_xgc_per_match: 1.3,
		delta_xgc_per_match: -0.1,
		window_goals_against_per_match: 1.0,
		season_goals_against_per_match: 1.2,
		delta_goals_against_per_match: -0.2,
		window_finishing_delta: -0.2,
		window_concession_delta: -0.2,
		attack_form: 0.3,
		defence_form: 0.1,
		upcoming_fixtures: 5,
		avg_fdr: 2.6,
		as_of_gw: 38,
	},
	{
		team: 2,
		team_name: "Chelsea",
		window_matches: 5,
		season_matches: 38,
		window_xg_per_match: 1.0,
		season_xg_per_match: 1.4,
		delta_xg_per_match: -0.4,
		window_goals_for_per_match: 0.8,
		season_goals_for_per_match: 1.5,
		delta_goals_for_per_match: -0.7,
		window_xgc_per_match: 1.7,
		season_xgc_per_match: 1.2,
		delta_xgc_per_match: 0.5,
		window_goals_against_per_match: 2.0,
		season_goals_against_per_match: 1.2,
		delta_goals_against_per_match: 0.8,
		window_finishing_delta: -0.2,
		window_concession_delta: 0.3,
		attack_form: -0.4,
		defence_form: -0.5,
		upcoming_fixtures: 5,
		avg_fdr: 3.2,
		as_of_gw: 38,
	},
].map((row) => ({
	...row,
	season_finishing_delta:
		row.season_goals_for_per_match - row.season_xg_per_match,
	season_concession_delta:
		row.season_goals_against_per_match - row.season_xgc_per_match,
	window_finishing_delta_total: row.window_finishing_delta * row.window_matches,
	season_finishing_delta_total:
		(row.season_goals_for_per_match - row.season_xg_per_match) *
		row.season_matches,
	window_concession_delta_total:
		row.window_concession_delta * row.window_matches,
	season_concession_delta_total:
		(row.season_goals_against_per_match - row.season_xgc_per_match) *
		row.season_matches,
	window_xgd_per_match: row.window_xg_per_match - row.window_xgc_per_match,
	season_xgd_per_match: row.season_xg_per_match - row.season_xgc_per_match,
	window_goal_difference_delta:
		row.window_finishing_delta - row.window_concession_delta,
	season_goal_difference_delta:
		row.season_goals_for_per_match -
		row.season_goals_against_per_match -
		(row.season_xg_per_match - row.season_xgc_per_match),
	window_goal_difference_delta_total:
		(row.window_finishing_delta - row.window_concession_delta) *
		row.window_matches,
	season_goal_difference_delta_total:
		(row.season_goals_for_per_match -
			row.season_goals_against_per_match -
			(row.season_xg_per_match - row.season_xgc_per_match)) *
		row.season_matches,
}));

const defconRows = [
	{
		element: 1,
		web_name: "Mbeumo",
		position: "MID",
		team_name: "Man Utd",
		price: 8,
		window_games: 5,
		window_minutes: 450,
		window_defcon_hits: 3,
		window_defcon_games: 5,
		window_defcon_hit_rate: 0.6,
		window_defcon: 8.2,
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
		window_defcon_hits: 2,
		window_defcon_games: 5,
		window_defcon_hit_rate: 0.4,
		window_defcon: 7.1,
		window_xgi90_per_million: 0.08,
		season_points_per_million: 4.2,
		window_start_rate: 0.8,
		window_mins_per_appearance: 79,
		upcoming_fixtures: 5,
		avg_fdr: 3.4,
		current_ownership: 40.1,
		as_of_gw: 38,
	},
	{
		element: 3,
		web_name: "Haaland",
		position: "FWD",
		team_name: "Man City",
		price: 14,
		window_games: 5,
		window_minutes: 450,
		window_defcon_hits: 0,
		window_defcon_games: 5,
		window_defcon_hit_rate: 0,
		window_defcon: 1.2,
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
		web_name: "Mbeumo",
		position: "MID",
		team_name: "Man Utd",
		games: 10,
		hits: 6,
		raw_rate: 0.6,
		prob: 0.52,
		as_of_gw: 38,
	},
	{
		element: 2,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		games: 10,
		hits: 4,
		raw_rate: 0.4,
		prob: 0.45,
		as_of_gw: 38,
	},
	{
		element: 4,
		web_name: "Senesi",
		position: "DEF",
		team_name: "Bournemouth",
		games: 15,
		hits: 12,
		raw_rate: 0.8,
		prob: 0.52,
		as_of_gw: 38,
	},
];
const defconValidation = {
	n_predictions: 100,
	model_brier: 0.139,
	binary_model_brier: 0.141,
	count_model_brier: 0.139,
	raw_rate_brier: 0.151,
	constant_brier: 0.162,
	model_ece: 0.007,
	binary_model_ece: 0.013,
	count_model_ece: 0.032,
	raw_rate_ece: 0.032,
	model_improvement_vs_raw: 0.073,
	model_improvement_vs_binary: 0.014,
	model_improvement_vs_count: 0.004,
	model_improvement_vs_constant: 0.136,
	calibration: [
		{
			bin: 2,
			n: 40,
			mean_predicted: 0.25,
			observed_rate: 0.27,
			abs_error: 0.02,
		},
		{
			bin: 5,
			n: 60,
			mean_predicted: 0.54,
			observed_rate: 0.53,
			abs_error: 0.01,
		},
	],
};
const formValidation = {
	window: 5,
	horizon: 4,
	top_k: 20,
	n_predictions: 8028,
	n_gameweeks: 30,
	swing_persistence: 0.028,
	swing_persistence_low: -0.034,
	swing_persistence_high: 0.083,
	minutes_persistence: 0.428,
	minutes_forecast: [
		{ forecast: "season_mpg", mean_absolute_error: 22.8 },
		{ forecast: "projected_minutes", mean_absolute_error: 21.5 },
		{ forecast: "window_mpg", mean_absolute_error: 22.4 },
	],
	signals: [
		{
			signal: "projected_xgi",
			mean_rank_correlation: 0.566,
			top_future_xgi: 1.71,
			top_future_points: 14.75,
		},
		{
			signal: "projected_xgi_season_minutes",
			mean_rank_correlation: 0.549,
			top_future_xgi: 1.5,
			top_future_points: 14.52,
		},
		{
			signal: "delta_xgi90",
			mean_rank_correlation: 0.032,
			top_future_xgi: 1.02,
			top_future_points: 10.62,
		},
	],
};

const clubValidationRows = [
	{
		target: "future_xg_per_match",
		n_predictions: 48,
		baseline_mae: 0.42,
		baseline_plus_form_mae: 0.39,
		mae_improvement: 0.03,
		mae_improvement_pct: 0.071,
		baseline_rmse: 0.55,
		baseline_plus_form_rmse: 0.52,
		rmse_improvement: 0.03,
		rmse_improvement_pct: 0.055,
	},
	{
		target: "future_xgc_per_match",
		n_predictions: 48,
		baseline_mae: 0.44,
		baseline_plus_form_mae: 0.445,
		mae_improvement: -0.005,
		mae_improvement_pct: -0.011,
		baseline_rmse: 0.57,
		baseline_plus_form_rmse: 0.568,
		rmse_improvement: 0.002,
		rmse_improvement_pct: 0.004,
	},
];
const importedTeam = {
	entry_id: 123,
	as_of_gw: 38,
	owned_elements: [1, 2],
	picks: [
		{
			element: 1,
			web_name: "Mbeumo",
			position: "MID",
			team_name: "Man Utd",
			squad_position: 1,
			multiplier: 1,
			is_captain: false,
			is_vice_captain: true,
			is_starting: true,
		},
		{
			element: 2,
			web_name: "Saka",
			position: "MID",
			team_name: "Arsenal",
			squad_position: 2,
			multiplier: 2,
			is_captain: true,
			is_vice_captain: false,
			is_starting: true,
		},
	],
};

const playerDetail = {
	element: 1,
	code: 9999,
	as_of_gw: 38,
	web_name: "Mbeumo",
	position: "MID",
	team_name: "Man Utd",
	rolling_window: 5,
	selected_season: "2025-26",
	available_seasons: ["2022-23", "2023-24", "2024-25", "2025-26"],
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
		{
			round: 2,
			kickoff_time: null,
			minutes: 70,
			total_points: 4,
			price: 8,
			expected_goals: 0.2,
			expected_assists: 0.1,
			expected_goal_involvements: 0.3,
			defensive_contribution: 6,
			defcon_hit: false,
			rolling_xg90: 0.39,
			rolling_xa90: 0.28,
			rolling_xgi90: 0.68,
			rolling_defcon: 1.2,
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

const playerDetails = {
	1: playerDetail,
	2: {
		...playerDetail,
		element: 2,
		code: 8888,
		web_name: "Saka",
		team_name: "Arsenal",
		gameweeks: [
			{
				round: 1,
				kickoff_time: null,
				minutes: 80,
				total_points: 5,
				price: 10,
				expected_goals: 0.3,
				expected_assists: 0.5,
				expected_goal_involvements: 0.8,
				defensive_contribution: 8,
				defcon_hit: true,
				rolling_xg90: 0.3,
				rolling_xa90: 0.5,
				rolling_xgi90: 0.8,
				rolling_defcon: 1.8,
			},
			{
				round: 2,
				kickoff_time: null,
				minutes: 90,
				total_points: 8,
				price: 10,
				expected_goals: 0.6,
				expected_assists: 0.2,
				expected_goal_involvements: 0.8,
				defensive_contribution: 9,
				defcon_hit: true,
				rolling_xg90: 0.45,
				rolling_xa90: 0.35,
				rolling_xgi90: 0.8,
				rolling_defcon: 1.6,
			},
		],
		seasons: [
			{
				season: "2025-26",
				games: 1,
				minutes: 80,
				points: 5,
				xg90: 0.3,
				xa90: 0.5,
				xgi90: 0.8,
				points_per_million: 0.5,
				defcon_hit_rate: 1,
			},
			{
				season: "2024-25",
				games: 35,
				minutes: 2900,
				points: 190,
				xg90: 0.35,
				xa90: 0.34,
				xgi90: 0.69,
				points_per_million: 19,
				defcon_hit_rate: null,
			},
		],
	},
	3: {
		...playerDetail,
		element: 3,
		code: 7777,
		web_name: "Haaland",
		position: "FWD",
		team_name: "Man City",
		gameweeks: [
			{
				round: 1,
				kickoff_time: null,
				minutes: 90,
				total_points: 7,
				price: 14,
				expected_goals: 0.7,
				expected_assists: 0.1,
				expected_goal_involvements: 0.8,
				defensive_contribution: 1,
				defcon_hit: false,
				rolling_xg90: 0.7,
				rolling_xa90: 0.1,
				rolling_xgi90: 0.8,
				rolling_defcon: 0.4,
			},
		],
		seasons: [
			{
				season: "2025-26",
				games: 1,
				minutes: 90,
				points: 7,
				xg90: 0.7,
				xa90: 0.1,
				xgi90: 0.8,
				points_per_million: 0.5,
				defcon_hit_rate: 0,
			},
		],
	},
};

function mockLocalStorage() {
	const storage = new Map<string, string>();
	const localStorageMock: Storage = {
		get length() {
			return storage.size;
		},
		clear: () => storage.clear(),
		getItem: (key) => storage.get(key) ?? null,
		key: (index) => Array.from(storage.keys())[index] ?? null,
		removeItem: (key) => {
			storage.delete(key);
		},
		setItem: (key, value) => {
			storage.set(key, value);
		},
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: localStorageMock,
	});
}

function mockApiFetch(input: RequestInfo | URL): Promise<Response> {
	const url = String(input);
	let body: unknown = meta;
	if (url.includes("/players/form-validation")) {
		body = formValidation;
	} else if (url.includes("/players/form")) {
		const params = new URL(url, "http://test").searchParams;
		body =
			params.get("as_of_gw") === "30"
				? withHistoricalFixtureContext(broadFormRows)
				: broadFormRows;
	} else if (url.includes("/players/current-context")) {
		body = currentPlayerContexts;
	} else if (url.includes("/fpl-team/")) {
		body = importedTeam;
	} else if (url.includes("/clubs/form-validation")) {
		body = clubValidationRows;
	} else if (url.includes("/clubs/form")) {
		body = clubRows;
	} else if (url.includes("/players/defcon-probability-validation")) {
		body = defconValidation;
	} else if (url.includes("/players/defcon-probability")) {
		body = probRows;
	} else if (url.includes("/players/defcon?")) {
		body = defconRows;
	} else if (/\/players\/\d+/.test(url)) {
		const element = Number(url.match(/\/players\/(\d+)/)?.[1]);
		body = playerDetails[element as keyof typeof playerDetails] ?? playerDetail;
	} else if (url.includes("/players/")) {
		body = [];
	}
	return Promise.resolve(
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

beforeEach(() => {
	mockLocalStorage();
	window.history.replaceState(null, "", "/");
	window.localStorage.clear();
	vi.stubGlobal("fetch", vi.fn(mockApiFetch));
});

// Presets, threat and transfer filters sit behind the 'More Filters' toggle.
function openMoreFilters() {
	fireEvent.click(screen.getByRole("button", { name: /More Filters/ }));
}

function withProviders(children: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("renders the attacking form table with flagged players", async () => {
	render(withProviders(<App />));
	expect(screen.getByText("FPL Analytics Engine")).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
});

test("shows the live preseason status without requesting analytics", async () => {
	const preseason = {
		name: "fpl-analytics-engine",
		season: "2026-27",
		latest_gw: 0,
		data_status: "preseason",
		next_deadline: "2026-08-21T17:30:00Z",
	};
	const fetchMock = vi.mocked(fetch);
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify(preseason), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	);

	render(withProviders(<App />));

	expect(
		await screen.findByRole("heading", { name: "Waiting For GW1 Data" }),
	).toBeInTheDocument();
	expect(screen.getByText("2026-27")).toBeInTheDocument();
	expect(screen.getByText(/Friday 21 August/)).toBeInTheDocument();
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(fetchMock).toHaveBeenCalledWith("/api/");
});

test("starts the attacking form chart collapsed and remembers opening it", async () => {
	const firstRender = render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(
		screen.queryByRole("region", { name: "Attacking Form Scatter Chart" }),
	).not.toBeInTheDocument();

	const showButton = screen.getByRole("button", { name: "Show Chart" });
	expect(showButton).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(showButton);

	expect(
		screen.getByRole("region", { name: "Attacking Form Scatter Chart" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Hide Chart" })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	expect(window.localStorage.getItem("fpl-form-scatter-collapsed")).toBe(
		"false",
	);

	firstRender.unmount();
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Hide Chart" }),
	).toBeInTheDocument();
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

test("filters attacking form candidates by explicit threat thresholds", async () => {
	render(withProviders(<App />));
	// No threat threshold by default, so even a recently declining player is present.
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	openMoreFilters();
	expect(screen.getByLabelText("Min Window xGI/90")).toBeInTheDocument();
	expect(screen.getByLabelText("Min Season xGI/90")).toBeInTheDocument();
	expect(screen.getByLabelText("Min Window xG/90")).toBeInTheDocument();
	expect(screen.getByLabelText("Min Season xG/90")).toBeInTheDocument();
	expect(screen.queryByLabelText("Min Window xA/90")).not.toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Min Window xGI/90"), {
		target: { value: "0.9" },
	});
	await waitFor(() => {
		expect(screen.queryByText("Haaland")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.queryByText("Saka")).not.toBeInTheDocument();
	expect(
		new URLSearchParams(window.location.search).get("min_window_xgi90"),
	).toBe("0.9");

	// Threat filters are hard candidate constraints, so search does not bypass them.
	fireEvent.change(screen.getByPlaceholderText("e.g. Saka"), {
		target: { value: "Haaland" },
	});
	await waitFor(() => {
		expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
	});
	expect(screen.queryByText("Haaland")).not.toBeInTheDocument();

	fireEvent.click(screen.getByLabelText("xA"));
	expect(screen.getByLabelText("Min Window xA/90")).toBeInTheDocument();
	expect(screen.getByLabelText("Min Season xA/90")).toBeInTheDocument();
});

test("filters player tables with transfer candidate controls", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	openMoreFilters();
	fireEvent.change(screen.getByLabelText("Max Price"), {
		target: { value: "9" },
	});
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(screen.queryByText("Saka")).not.toBeInTheDocument();
	expect(screen.queryByText("Haaland")).not.toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Max Price"), {
		target: { value: "" },
	});
	await waitFor(() => {
		expect(screen.getByText("Saka")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText("Max FDR"), {
		target: { value: "3" },
	});
	await waitFor(() => {
		expect(screen.queryByText("Saka")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.getByText("Haaland")).toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Max FDR"), {
		target: { value: "" },
	});
	fireEvent.change(screen.getByLabelText("Min Start %"), {
		target: { value: "90" },
	});
	await waitFor(() => {
		expect(screen.queryByText("Saka")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.getByText("Haaland")).toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Min Start %"), {
		target: { value: "" },
	});
	fireEvent.change(screen.getByLabelText("Min Owned %"), {
		target: { value: "50" },
	});
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
	expect(screen.queryByText("Saka")).not.toBeInTheDocument();
});

test("surfaces active filters with reset controls and presets", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("columnheader", { name: /Shortlist/ }),
	).toBeInTheDocument();

	openMoreFilters();
	fireEvent.click(screen.getByRole("button", { name: "Value Attack" }));
	expect(screen.getByLabelText("Max Price")).toHaveValue(7.5);
	expect(screen.getByLabelText("Min Window xGI/90")).toHaveValue(0.35);
	expect(screen.getByLabelText("Min Season xGI/90")).toHaveValue(0.25);
	expect(
		screen.getByRole("button", { name: /Price <= £7.5m/ }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Min Window xGI\/90 >= 0.35/ }),
	).toBeInTheDocument();

	fireEvent.click(
		screen.getByRole("button", { name: "Reset Transfer Filters" }),
	);
	expect(screen.getByLabelText("Max Price")).toHaveValue(null);
	expect(
		screen.queryByRole("button", { name: /Price <= £7.5m/ }),
	).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Min Window xGI\/90 >= 0.35/ }),
	).toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Min Window xGI/90"), {
		target: { value: "99" },
	});
	await waitFor(() => {
		expect(
			screen.getByText("No Players Match These Filters"),
		).toBeInTheDocument();
	});

	fireEvent.click(
		screen.getAllByRole("button", { name: "Clear Active Filters" })[0],
	);
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	expect(
		screen.queryByText("No Players Match These Filters"),
	).not.toBeInTheDocument();
	expect(screen.queryByText("Active Filters")).not.toBeInTheDocument();
});

test("keeps the current page when shortlisting and resets it when searching", async () => {
	const manyPlayers = Array.from({ length: 60 }, (_, index) => ({
		...formRows[0],
		element: index + 1,
		web_name: `Candidate ${index + 1}`,
	}));
	vi.mocked(fetch).mockImplementation((input) =>
		String(input).includes("/players/form")
			? Promise.resolve(new Response(JSON.stringify(manyPlayers)))
			: mockApiFetch(input),
	);
	render(withProviders(<App />));
	await screen.findByText("Candidate 1");
	fireEvent.click(screen.getAllByRole("button", { name: "Next Page" })[0]);
	fireEvent.click(
		screen.getByRole("button", { name: "Add Candidate 26 to shortlist" }),
	);
	await screen.findByRole("button", {
		name: "Remove Candidate 26 from shortlist",
	});
	expect(screen.getAllByText("Page 2 of 3")).toHaveLength(2);
	fireEvent.change(screen.getByPlaceholderText("e.g. Saka"), {
		target: { value: "Candidate 60" },
	});
	await screen.findByText("Candidate 60");
	expect(screen.getAllByText("1-1 of 1 rows")).toHaveLength(2);
	expect(screen.getAllByText("Page 1 of 1")).toHaveLength(2);
});

test("retains the page-size choice across filters and table remounts", async () => {
	render(withProviders(<App />));
	await screen.findByText("Mbeumo");
	fireEvent.change(
		screen.getAllByRole("combobox", { name: "Rows Per Page" })[0],
		{
			target: { value: "10" },
		},
	);
	fireEvent.change(screen.getByRole("combobox", { name: "Position" }), {
		target: { value: "MID" },
	});
	await waitFor(() =>
		expect(
			screen.getAllByRole("combobox", { name: "Rows Per Page" })[0],
		).toHaveValue("10"),
	);
	fireEvent.click(screen.getByRole("button", { name: "Club Form" }));
	await waitFor(() =>
		expect(
			screen.getAllByRole("combobox", { name: "Rows Per Page" })[0],
		).toHaveValue("10"),
	);
	fireEvent.change(
		screen.getAllByRole("combobox", { name: "Rows Per Page" })[0],
		{
			target: { value: "all" },
		},
	);
	fireEvent.click(screen.getByRole("button", { name: "Attacking Form" }));
	await waitFor(() =>
		expect(
			screen.getAllByRole("combobox", { name: "Rows Per Page" })[0],
		).toHaveValue("all"),
	);
});

test("shortlists players and filters the interactive table", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Shortlisted (0)" }),
	).toBeDisabled();

	fireEvent.click(
		screen.getByRole("button", { name: "Add Mbeumo to shortlist" }),
	);

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Shortlisted (1)" }),
		).toBeEnabled();
	});
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("shortlist")).toBe(
			"1",
		);
	});
	expect(screen.queryByText("Season History")).not.toBeInTheDocument();

	fireEvent.click(
		screen.getByRole("button", { name: "Add Saka to shortlist" }),
	);
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("shortlist")).toBe(
			"1,2",
		);
	});
	expect(screen.getByRole("button", { name: "Shortlisted (2)" })).toBeEnabled();

	fireEvent.click(screen.getByRole("button", { name: "Shortlisted (2)" }));
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("shortlist")).toBe("1,2");
		expect(params.get("shortlist_only")).toBe("1");
	});
	expect(screen.getByText("Showing 2 shortlisted players")).toBeInTheDocument();
	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.getByText("Saka")).toBeInTheDocument();
	expect(screen.queryByText("Haaland")).not.toBeInTheDocument();

	fireEvent.click(screen.getByText("Mbeumo"));
	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await waitFor(() => {
		expect(screen.queryByText("Season History")).not.toBeInTheDocument();
	});

	fireEvent.click(
		screen.getByRole("button", { name: "Remove Mbeumo from shortlist" }),
	);
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("shortlist")).toBe("2");
		expect(params.get("shortlist_only")).toBe("1");
	});
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
	expect(screen.getByText("Saka")).toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "Clear Shortlist" }));
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Shortlisted (0)" }),
		).toBeDisabled();
	});
	const params = new URLSearchParams(window.location.search);
	expect(params.get("shortlist")).toBeNull();
	expect(params.get("shortlist_only")).toBeNull();
});

test("imports an FPL team and filters owned players", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText("FPL Team ID"), {
		target: { value: "123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Import" }));

	await waitFor(() => {
		expect(screen.getByText("Currently Owned (2)")).toBeInTheDocument();
	});
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("fpl_team")).toBe("123");
	});
	const mbeumoRow = screen.getByText("Mbeumo").closest("tr");
	expect(mbeumoRow).not.toBeNull();
	const mbeumoElement = mbeumoRow as HTMLElement;
	expect(mbeumoElement).toHaveClass("bg-sky-50/50");
	const mbeumoCells = within(mbeumoElement).getAllByRole("cell");
	for (const cell of mbeumoCells.slice(0, 5)) {
		expect(cell).toHaveClass("bg-sky-100");
	}
	expect(mbeumoCells[5]).not.toHaveClass("bg-sky-100");

	fireEvent.click(screen.getByRole("button", { name: "Owned (2)" }));
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("fpl_team")).toBe("123");
		expect(params.get("squad")).toBe("owned");
	});
	expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	expect(screen.getByText("Saka")).toBeInTheDocument();
	expect(screen.queryByText("Haaland")).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "Not Owned" }));
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("squad")).toBe(
			"not-owned",
		);
	});
	expect(screen.getByText("Haaland")).toBeInTheDocument();
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "Clear" }));
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("fpl_team")).toBeNull();
		expect(params.get("squad")).toBeNull();
	});
});

test("does not render previous rows while a new gameweek is loading", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url.includes("/players/form") && url.includes("as_of_gw=30")) {
			return new Promise<Response>(() => {});
		}
		return mockApiFetch(input);
	});

	fireEvent.change(screen.getByLabelText(/As Of GW/), {
		target: { value: "30" },
	});

	await waitFor(() => {
		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
});

test("rejects imported-team data whose returned entry ID does not match", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText("FPL Team ID"), {
		target: { value: "123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Import" }));
	await waitFor(() => {
		expect(screen.getByText("Currently Owned (2)")).toBeInTheDocument();
	});

	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("/fpl-team/456")) {
			return Promise.resolve(
				new Response(JSON.stringify(importedTeam), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return mockApiFetch(input);
	});
	fireEvent.change(screen.getByLabelText("FPL Team ID"), {
		target: { value: "456" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Import" }));

	await waitFor(() => {
		expect(screen.getByText("Team Import Failed")).toBeInTheDocument();
	});
	expect(screen.queryByText("Currently Owned (2)")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Owned (0)" })).toBeDisabled();
});

test("opens a current squad inspection view from an imported FPL team", async () => {
	window.history.replaceState(null, "", "/?as_of_gw=30");
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText("FPL Team ID"), {
		target: { value: "123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Import" }));
	await waitFor(() => {
		expect(screen.getByText("Currently Owned (2)")).toBeInTheDocument();
	});

	fireEvent.click(screen.getByRole("button", { name: "Squad View (2)" }));

	await waitFor(() => {
		expect(screen.getByText("Next-GW Squad Inspection")).toBeInTheDocument();
	});
	await waitFor(() => {
		expect(screen.getByText("GW39 H Everton")).toBeInTheDocument();
	});
	expect(screen.getByText("GW39 A Chelsea")).toBeInTheDocument();
	expect(screen.queryByText("GW31 H Historical")).not.toBeInTheDocument();
	expect(screen.getByText("Starting XI")).toBeInTheDocument();
	expect(screen.queryByText("Bench")).not.toBeInTheDocument();
	expect(screen.queryByText("Slot")).not.toBeInTheDocument();
	expect(screen.getByText("Fixture Risk")).toBeInTheDocument();
	expect(screen.getAllByText("DefCon Upside").length).toBeGreaterThan(0);
	expect(
		screen.getByRole("columnheader", { name: "P(Hit | 60+ Mins)" }),
	).toBeInTheDocument();
	expect(screen.queryByText("Haaland")).not.toBeInTheDocument();
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("as_of_gw")).toBe("30");
		expect(params.get("fpl_team")).toBe("123");
		expect(params.get("squad_view")).toBe("1");
		expect(params.get("squad")).toBeNull();
	});

	fireEvent.click(screen.getByRole("button", { name: "Not Owned" }));
	await waitFor(() => {
		expect(
			screen.queryByText("Next-GW Squad Inspection"),
		).not.toBeInTheDocument();
	});
	const params = new URLSearchParams(window.location.search);
	expect(params.get("squad_view")).toBeNull();
	expect(params.get("squad")).toBe("not-owned");
});

test("keeps the snapshot club and fixture when the analytical gameweek changes", async () => {
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url.includes("/players/current-context")) {
			return Promise.resolve(
				new Response(
					JSON.stringify(
						currentPlayerContexts.map((row) => ({
							...row,
							team_name: "New Club",
							price: 9.5,
							next_fixture_gw: 7,
							next_opponent_name: "New Opponent",
						})),
					),
				),
			);
		}
		if (url.includes("/players/form")) {
			const historical = url.includes("as_of_gw=30");
			return Promise.resolve(
				new Response(
					JSON.stringify(
						broadFormRows.map((row) => ({
							...row,
							team_name: "Old Club",
							next_opponent_name: "Old Opponent",
							window_xgi90: historical ? 0.11 : 0.97,
						})),
					),
				),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(null, "", "/?fpl_team=123&squad_view=1");
	render(withProviders(<App />));

	const player = await screen.findByText("Mbeumo");
	let row = within(player.closest("tr") as HTMLElement);
	expect(row.getByText("New Club")).toBeInTheDocument();
	expect(row.getByText("\u00a39.5m")).toBeInTheDocument();
	expect(row.getByText("GW7 H New Opponent")).toBeInTheDocument();
	expect(row.getByText("0.97")).toBeInTheDocument();
	expect(row.queryByText("Old Club")).not.toBeInTheDocument();

	fireEvent.change(screen.getByLabelText(/As Of GW/), {
		target: { value: "30" },
	});
	await waitFor(() => {
		row = within(screen.getByText("Mbeumo").closest("tr") as HTMLElement);
		expect(row.getByText("0.11")).toBeInTheDocument();
	});
	expect(row.getByText("New Club")).toBeInTheDocument();
	expect(row.getByText("GW7 H New Opponent")).toBeInTheDocument();
	expect(screen.queryByText(/Old Opponent/)).not.toBeInTheDocument();
	const contextCalls = vi
		.mocked(fetch)
		.mock.calls.map(([input]) => String(input))
		.filter((url) => url.includes("/players/current-context"));
	expect(contextCalls).toEqual(["/api/players/current-context"]);
});

test.each([
	false,
	true,
])("does not fall back to historical fixtures when current context is missing: %s", async (missingPlayer) => {
	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("/players/current-context")) {
			const rows = currentPlayerContexts
				.filter((row) => !missingPlayer || row.element !== 1)
				.map((row) => ({
					...row,
					upcoming_fixtures: null,
					avg_fdr: null,
					next_fixture_gw: null,
					next_opponent_name: null,
					next_was_home: null,
					next_fdr: null,
				}));
			return Promise.resolve(new Response(JSON.stringify(rows)));
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(
		null,
		"",
		"/?as_of_gw=30&fpl_team=123&squad_view=1",
	);
	render(withProviders(<App />));

	const player = await screen.findByText("Mbeumo");
	const row = within(player.closest("tr") as HTMLElement);
	expect(row.getByText("Man Utd")).toBeInTheDocument();
	expect(row.getAllByRole("cell")[4]).toHaveTextContent("-");
	expect(row.getAllByRole("cell")[5]).toHaveTextContent("-");
	expect(screen.queryByText("Fixture Risk")).not.toBeInTheDocument();
	expect(screen.queryByText(/Historical/)).not.toBeInTheDocument();
});

test("reports a failed current-context request instead of using old fixtures", async () => {
	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("/players/current-context")) {
			return Promise.resolve(new Response(null, { status: 500 }));
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(null, "", "/?fpl_team=123&squad_view=1");
	render(withProviders(<App />));

	expect(
		await screen.findByText("Failed to load squad context."),
	).toBeInTheDocument();
	expect(screen.queryByText("GW39 H Everton")).not.toBeInTheDocument();
});

test("preserves unknown snapshot labels and venue instead of guessing", async () => {
	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("/players/current-context")) {
			return Promise.resolve(
				new Response(
					JSON.stringify(
						currentPlayerContexts.map((row) => ({
							...row,
							web_name: null,
							position: null,
							team_name: null,
							price: null,
							current_ownership: null,
							next_was_home: null,
						})),
					),
				),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(null, "", "/?fpl_team=123&squad_view=1");
	render(withProviders(<App />));

	const player = await screen.findByText("#1");
	const row = within(player.closest("tr") as HTMLElement);
	const cells = row.getAllByRole("cell");
	for (const index of [1, 2, 3, 15]) {
		expect(cells[index]).toHaveTextContent(/^-$/);
	}
	expect(cells[4]).toHaveTextContent("GW39 Everton");
	expect(cells[4]).not.toHaveTextContent("H Everton");
	expect(cells[4]).not.toHaveTextContent("A Everton");
});

test("shows no-form state instead of low threat for missing historical data", async () => {
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url.includes("/players/form") && url.includes("as_of_gw=30")) {
			const body = withHistoricalFixtureContext(
				broadFormRows.filter((row) => row.element !== 2),
			);
			return Promise.resolve(
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(
		null,
		"",
		"/?as_of_gw=30&fpl_team=123&squad_view=1",
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Next-GW Squad Inspection")).toBeInTheDocument();
	});
	const noFormFlag = await screen.findByText("No Form Data");
	const sakaRow = noFormFlag.closest("tr");
	expect(sakaRow).not.toBeNull();
	expect(within(sakaRow as HTMLElement).getByText("Saka")).toBeInTheDocument();
	expect(
		within(sakaRow as HTMLElement).getByText("No Form Data"),
	).toBeInTheDocument();
	expect(
		within(sakaRow as HTMLElement).queryByText("Low Threat"),
	).not.toBeInTheDocument();
});

test("flags low threat on the estimated rate, not recent form", async () => {
	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("/players/form?")) {
			const body = broadFormRows.map((row) =>
				row.element === 1
					? // A quiet spell, but last season's rate keeps the estimate up.
						{ ...row, window_xgi90: 0.1, season_xgi90: 0.15, est_xgi90: 0.35 }
					: row.element === 2
						? // A hot spell that the estimate does not believe.
							{ ...row, window_xgi90: 0.5, season_xgi90: 0.3, est_xgi90: 0.15 }
						: row,
			);
			return Promise.resolve(
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(null, "", "/?fpl_team=123&squad_view=1");

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Next-GW Squad Inspection")).toBeInTheDocument();
	});
	const squadRow = async (name: string) =>
		within((await screen.findByText(name)).closest("tr") as HTMLElement);
	const mbeumo = await squadRow("Mbeumo");
	expect(mbeumo.queryByText("Low Threat")).not.toBeInTheDocument();
	// Projected xGI sits after FDR, then the estimated rate.
	expect(mbeumo.getAllByRole("cell")[6]).toHaveTextContent(/^0\.57$/);
	expect(mbeumo.getAllByRole("cell")[7]).toHaveTextContent(/^0\.35$/);
	expect((await squadRow("Saka")).getByText("Low Threat")).toBeInTheDocument();
});

test("hides stale squad rows while historical context is loading", async () => {
	window.history.replaceState(null, "", "/?fpl_team=123&squad_view=1");
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Next-GW Squad Inspection")).toBeInTheDocument();
	});
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (
			url.includes("as_of_gw=30") &&
			(url.includes("/players/form") ||
				url.includes("/players/defcon-probability"))
		) {
			return new Promise<Response>(() => {});
		}
		return mockApiFetch(input);
	});
	fireEvent.change(screen.getByLabelText(/As Of GW/), {
		target: { value: "30" },
	});

	await waitFor(() => {
		expect(screen.getByText("Loading squad context...")).toBeInTheDocument();
	});
	expect(screen.queryByText("Mbeumo")).not.toBeInTheDocument();
});

test("normalises contradictory squad, ownership and shortlist URL state", async () => {
	window.history.replaceState(
		null,
		"",
		"/?fpl_team=123&squad_view=1&squad=not-owned&shortlist=1&shortlist_only=1",
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Next-GW Squad Inspection")).toBeInTheDocument();
	});
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("squad")).toBeNull();
		expect(params.get("shortlist_only")).toBeNull();
	});

	fireEvent.click(screen.getByRole("button", { name: "Shortlisted (1)" }));
	await waitFor(() => {
		expect(
			screen.queryByText("Next-GW Squad Inspection"),
		).not.toBeInTheDocument();
	});
	const params = new URLSearchParams(window.location.search);
	expect(params.get("squad_view")).toBeNull();
	expect(params.get("shortlist_only")).toBe("1");
});

test("finds replacements from squad inspection with position, price plus bank, and not-owned filters", async () => {
	const unownedMidUnderBudget = {
		...formRows[0],
		element: 4,
		web_name: "Gordon",
		position: "MID",
		team_name: "Newcastle",
		price: 9.5,
	};
	const unownedMidOverBudget = {
		...formRows[0],
		element: 5,
		web_name: "Salah",
		position: "MID",
		team_name: "Liverpool",
		price: 12.5,
	};
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url.includes("/players/form?")) {
			return Promise.resolve(
				new Response(
					JSON.stringify([
						...broadFormRows,
						unownedMidUnderBudget,
						unownedMidOverBudget,
					]),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(
		null,
		"",
		"/?tab=defcon&fpl_team=123&squad_view=1&q=OldSearch&team=Arsenal&shortlist=1&sort=window_defcon:desc",
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Find replacement for Saka" }),
		).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText(/Bank/), {
		target: { value: "1.5" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Find replacement for Saka" }),
	);

	await waitFor(() => {
		expect(
			screen.queryByText("Next-GW Squad Inspection"),
		).not.toBeInTheDocument();
	});
	await waitFor(() => {
		const table = screen.getByRole("table");
		expect(within(table).getByText("Gordon")).toBeInTheDocument();
	});
	const table = screen.getByRole("table");
	// Owned MIDs (Mbeumo, Saka), over-budget MID (Salah), and FWD (Haaland) are filtered out.
	expect(within(table).queryByText("Mbeumo")).not.toBeInTheDocument();
	expect(within(table).queryByText("Saka")).not.toBeInTheDocument();
	expect(within(table).queryByText("Salah")).not.toBeInTheDocument();
	expect(within(table).queryByText("Haaland")).not.toBeInTheDocument();

	expect(screen.getByRole("button", { name: "Attacking Form" })).toHaveClass(
		"bg-zinc-900",
	);
	expect(screen.getByLabelText("Position")).toHaveValue("MID");
	expect(screen.getByPlaceholderText("e.g. Saka")).toHaveValue("");
	expect(screen.getByLabelText("Team")).toHaveValue("");
	expect(screen.getByRole("button", { name: "Not Owned" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(screen.queryByText("Season History")).not.toBeInTheDocument();

	const params = new URLSearchParams(window.location.search);
	expect(params.get("tab")).toBeNull();
	expect(params.get("squad_view")).toBeNull();
	expect(params.get("position")).toBe("MID");
	expect(params.get("max_price")).toBe("11.5");
	expect(params.get("squad")).toBe("not-owned");
	expect(params.get("q")).toBeNull();
	expect(params.get("team")).toBeNull();
	expect(params.get("shortlist_only")).toBeNull();
	expect(params.get("sort")).toBeNull();
});

test("clears invalid position and omits null price when finding replacement for a manager pick", async () => {
	const teamWithManager = {
		...importedTeam,
		owned_elements: [1, 99],
		picks: [
			importedTeam.picks[0],
			{
				element: 99,
				web_name: "Arteta",
				position: "MNG",
				team_name: "Arsenal",
				squad_position: 12,
				multiplier: 0,
				is_captain: false,
				is_vice_captain: false,
				is_starting: false,
			},
		],
	};
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url.includes("/fpl-team/")) {
			return Promise.resolve(
				new Response(JSON.stringify(teamWithManager), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		if (url.includes("/players/current-context")) {
			return Promise.resolve(
				new Response(
					JSON.stringify([
						...currentPlayerContexts,
						{
							...currentPlayerContexts[0],
							element: 99,
							web_name: "Arteta",
							position: "MNG",
							price: null,
						},
					]),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(
		null,
		"",
		"/?fpl_team=123&squad_view=1&position=DEF&max_price=7",
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Find replacement for Arteta" }),
		).toBeInTheDocument();
	});

	fireEvent.click(
		screen.getByRole("button", { name: "Find replacement for Arteta" }),
	);

	await waitFor(() => {
		expect(
			screen.queryByText("Next-GW Squad Inspection"),
		).not.toBeInTheDocument();
	});
	const params = new URLSearchParams(window.location.search);
	expect(params.get("position")).toBeNull();
	expect(params.get("max_price")).toBeNull();
	expect(params.get("squad")).toBe("not-owned");
});

test.each([
	["doubles", [26, 27, 28, 29, 30, 30]],
	["blanks", [26, 28, 29]],
])("compares GW26-30 without backfilling across %s", async (_label, rounds) => {
	const gameweeks = [25, ...rounds, 31].map((round) => ({
		...playerDetail.gameweeks[0],
		round,
		minutes: 90,
		expected_goal_involvements: round === 25 || round === 31 ? 10 : 0.6,
	}));
	vi.mocked(fetch).mockImplementation((input) => {
		if (/\/players\/[12]\?/.test(String(input))) {
			return Promise.resolve(
				new Response(JSON.stringify({ ...playerDetail, gameweeks }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return mockApiFetch(input);
	});
	window.history.replaceState(
		null,
		"",
		"/?compare=1&compare_a=1&compare_b=2&compare_window=5&compare_as_of_gw=30",
	);
	render(withProviders(<App />));
	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(within(dialog).getAllByText("GW26-GW30")).toHaveLength(2);
	});
	expect(within(dialog).getByLabelText("Window (Gameweeks)")).toHaveValue("5");
	for (const [label, expected] of [
		["Window Minutes", String(rounds.length * 90)],
		["Window xGI", (rounds.length * 0.6).toFixed(2)],
		["Window xGI Per 90", "0.60"],
	]) {
		const row = within(dialog).getByText(label).closest("tr");
		expect(row).not.toBeNull();
		for (const cell of within(row as HTMLElement).getAllByRole("cell")) {
			expect(cell).toHaveTextContent(expected);
		}
	}
});

test("opens the compare panel without arbitrary default players", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.click(screen.getByRole("button", { name: "Compare Players" }));

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(within(dialog).getByLabelText("First Player")).toHaveValue("");
		expect(within(dialog).getByLabelText("Second Player")).toHaveValue("");
	});
	expect(
		within(dialog).getByText("Select two players to compare."),
	).toBeInTheDocument();
});

test("defaults player comparison to imported owned players", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.change(screen.getByLabelText("FPL Team ID"), {
		target: { value: "123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Import" }));
	await waitFor(() => {
		expect(screen.getByText("Currently Owned (2)")).toBeInTheDocument();
	});

	fireEvent.click(screen.getByRole("button", { name: "Compare Players" }));

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(
			within(dialog).getByDisplayValue("Mbeumo - Man Utd - MID"),
		).toBeInTheDocument();
		expect(
			within(dialog).getByDisplayValue("Saka - Arsenal - MID"),
		).toBeInTheDocument();
	});
});

test("compares two shortlisted players in a side-by-side panel", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});

	fireEvent.click(
		screen.getByRole("button", { name: "Add Mbeumo to shortlist" }),
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Add Saka to shortlist" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Compare Players" }));

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(
			within(dialog).getByDisplayValue("Mbeumo - Man Utd - MID"),
		).toBeInTheDocument();
		expect(
			within(dialog).getByDisplayValue("Saka - Arsenal - MID"),
		).toBeInTheDocument();
	});
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("compare")).toBe("1");
		expect(params.get("compare_a")).toBe("1");
		expect(params.get("compare_b")).toBe("2");
	});

	fireEvent.change(within(dialog).getByLabelText("Window (Gameweeks)"), {
		target: { value: "2" },
	});
	fireEvent.change(within(dialog).getByLabelText("As Of GW"), {
		target: { value: "2" },
	});
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("compare_window")).toBe("2");
		expect(params.get("compare_as_of_gw")).toBe("2");
	});
	await waitFor(() => {
		expect(
			within(dialog).queryByText("Loading comparison..."),
		).not.toBeInTheDocument();
	});

	function expectCompareRow(label: string, left: string, right: string) {
		const row = within(dialog).getByText(label).closest("tr");
		expect(row).not.toBeNull();
		const cells = within(row as HTMLElement).getAllByRole("cell");
		expect(cells[0]).toHaveTextContent(left);
		expect(cells[1]).toHaveTextContent(right);
		return { row: row as HTMLElement, cells };
	}

	expectCompareRow("Price", "£8.0m", "£10.0m");
	expectCompareRow("Window Range", "GW1-GW2", "GW1-GW2");
	const xgiRow = expectCompareRow("Window xGI", "1.20", "1.60");
	expect(xgiRow.cells[0]).not.toHaveClass("bg-emerald-50");
	expect(xgiRow.cells[1]).toHaveClass("bg-emerald-50");
	expectCompareRow("Window xGI Per 90", "0.67", "0.85");
	expectCompareRow("Window DefCon Hit Rate", "0%", "100%");
	expectCompareRow("Season Range", "GW1-GW2", "GW1-GW2");
	expectCompareRow("Season Points", "10", "13");
	expectCompareRow("Season xGI", "1.20", "1.60");
	expectCompareRow("P(Hit | 60+ Mins)", "52%", "45%");
	const projectedRow = expectCompareRow("Projected xGI", "0.57", "0.53");
	expect(projectedRow.cells[0]).toHaveClass("bg-emerald-50");
	expectCompareRow("Projected Mins", "85", "76");
	const deltaRow = expectCompareRow("Delta xGI Per 90", "+0.41", "+0.18");
	expect(deltaRow.cells[0]).not.toHaveClass("bg-emerald-50");
	expect(deltaRow.cells[1]).not.toHaveClass("bg-emerald-50");
	const attackFormRow = expectCompareRow("Attack Form", "+0.30", "+0.40");
	expect(attackFormRow.cells[0]).not.toHaveClass("bg-emerald-50");
	expect(attackFormRow.cells[1]).toHaveClass("bg-emerald-50");
	expect(within(dialog).queryByText("Gameweek Detail")).not.toBeInTheDocument();
	expect(within(dialog).queryByText("GW1 xGI")).not.toBeInTheDocument();
	expect(within(dialog).queryByText("GW2 xGI")).not.toBeInTheDocument();

	fireEvent.change(within(dialog).getByLabelText("Second Player"), {
		target: { value: "Haaland - Man City - FWD" },
	});
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("compare_b")).toBe(
			"3",
		);
	});
	await waitFor(() => {
		expect(
			within(dialog).getByRole("columnheader", { name: "Haaland" }),
		).toBeInTheDocument();
	});

	fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
	await waitFor(() => {
		expect(
			new URLSearchParams(window.location.search).get("compare"),
		).toBeNull();
	});
});

test("swaps compared players and opens player detail from a compare column header", async () => {
	window.history.replaceState(
		null,
		"",
		"/?compare=1&compare_a=1&compare_b=2&compare_window=2&compare_as_of_gw=2",
	);

	render(withProviders(<App />));

	const compareDialog = await screen.findByRole("dialog", {
		name: "Compare Players",
	});
	await within(compareDialog).findByRole("button", { name: "Mbeumo" });

	fireEvent.click(within(compareDialog).getByRole("button", { name: "Swap" }));
	await waitFor(() => {
		const params = new URLSearchParams(window.location.search);
		expect(params.get("compare_a")).toBe("2");
		expect(params.get("compare_b")).toBe("1");
	});
	const headers = within(compareDialog).getAllByRole("columnheader");
	expect(headers[1]).toHaveTextContent("Saka");
	expect(headers[2]).toHaveTextContent("Mbeumo");

	fireEvent.click(within(compareDialog).getByRole("button", { name: "Saka" }));

	await waitFor(() => {
		expect(
			screen.queryByRole("dialog", { name: "Compare Players" }),
		).not.toBeInTheDocument();
	});
	const playerDialog = await screen.findByRole("dialog", { name: "Saka" });
	expect(playerDialog).toBeInTheDocument();
	const params = new URLSearchParams(window.location.search);
	expect(params.get("compare")).toBeNull();
	expect(params.get("player")).toBe("2");
});

test("hides stale comparison rows while a new as-of context is loading", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Haaland")).toBeInTheDocument();
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Add Mbeumo to shortlist" }),
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Add Saka to shortlist" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Compare Players" }));
	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(within(dialog).getByText("Window xGI")).toBeInTheDocument();
	});

	vi.mocked(fetch).mockImplementation((input) => {
		if (String(input).includes("as_of_gw=20")) {
			return new Promise<Response>(() => {});
		}
		return mockApiFetch(input);
	});
	fireEvent.change(within(dialog).getByLabelText("As Of GW"), {
		target: { value: "20" },
	});

	await waitFor(() => {
		expect(
			within(dialog).getByText("Loading comparison..."),
		).toBeInTheDocument();
	});
	expect(within(dialog).queryByText("Window xGI")).not.toBeInTheDocument();
});

test("initialises the player compare panel from the URL", async () => {
	window.history.replaceState(
		null,
		"",
		"/?compare=1&compare_a=2&compare_b=3&compare_window=3&compare_as_of_gw=20",
	);

	render(withProviders(<App />));

	const dialog = await screen.findByRole("dialog", { name: "Compare Players" });
	await waitFor(() => {
		expect(
			within(dialog).getByDisplayValue("Saka - Arsenal - MID"),
		).toBeInTheDocument();
		expect(
			within(dialog).getByDisplayValue("Haaland - Man City - FWD"),
		).toBeInTheDocument();
	});
	expect(within(dialog).getByLabelText("Window (Gameweeks)")).toHaveValue("3");
	expect(within(dialog).getByLabelText("As Of GW")).toHaveValue("20");
	await waitFor(() => {
		const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
		expect(
			calls.some((input) =>
				input.includes("/api/players/2?window=3&as_of_gw=20"),
			),
		).toBe(true);
		expect(
			calls.some((input) =>
				input.includes("/api/players/3?window=3&as_of_gw=20"),
			),
		).toBe(true);
		expect(
			calls.some((input) =>
				input.endsWith("/api/players/form?window=3&min_minutes=0&as_of_gw=20"),
			),
		).toBe(true);
	});
});

test("sorts players without window minutes last on a signed column", async () => {
	const benched = {
		...broadFormRows[2],
		element: 4,
		web_name: "Benched",
		window_minutes: 0,
		window_xg90: null,
		window_xa90: null,
		window_xgi90: null,
		delta_xg90: null,
		delta_xa90: null,
		delta_xgi90: null,
	};
	vi.mocked(fetch).mockImplementation((input) =>
		String(input).includes("/players/form?")
			? Promise.resolve(
					new Response(JSON.stringify([benched, ...broadFormRows]), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
			: mockApiFetch(input),
	);
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Benched")).toBeInTheDocument();
	});
	const formCalls = vi
		.mocked(fetch)
		.mock.calls.map(([input]) => String(input))
		.filter((url) => url.includes("/players/form?"));
	// The delta filter is opt-in, so the dashboard never sends it.
	expect(formCalls.length).toBeGreaterThan(0);
	expect(formCalls.some((url) => url.includes("min_delta"))).toBe(false);

	const playerOrder = () =>
		screen
			.getAllByRole("row")
			.slice(1)
			.map((row) => within(row).queryAllByRole("cell")[1]?.textContent);
	const deltaHeader = screen.getByText("Delta xGI Per 90");
	fireEvent.click(deltaHeader);
	await waitFor(() => {
		expect(playerOrder()).toEqual(["Mbeumo", "Saka", "Haaland", "Benched"]);
	});
	fireEvent.click(deltaHeader);
	await waitFor(() => {
		expect(playerOrder()).toEqual(["Haaland", "Saka", "Mbeumo", "Benched"]);
	});
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
	expect(headerIndex("Price")).toBeLessThan(headerIndex("FDR (Next 5)"));
	expect(headerIndex("FDR (Next 5)")).toBeLessThan(headerIndex("Owned %"));
	// Match the start so "Projected Mins" does not count as "Mins".
	expect(headerIndex("Owned %")).toBeLessThan(
		headers.findIndex((header) => header.startsWith("Mins")),
	);
	expect(headerIndex("Projected Mins")).toBeGreaterThan(0);
	expect(headerIndex("Price")).toBe(headerIndex("Projected xGI") - 1);
	expect(headerIndex("Projected xGI")).toBe(headerIndex("Projected Mins") - 1);
	expect(headerIndex("Projected Mins")).toBeLessThan(
		headerIndex("Est. xGI Per 90"),
	);
	expect(headerIndex("Est. xGI Per 90")).toBeLessThan(
		headerIndex("Window xGI Per 90"),
	);
	const mbeumoCells = within(
		screen.getByText("Mbeumo").closest("tr") as HTMLElement,
	).getAllByRole("cell");
	const cellUnder = (text: string) => {
		const header = screen
			.getAllByRole("columnheader")
			.find((cell) => (cell.textContent ?? "").includes(text));
		return mbeumoCells[(header as HTMLTableCellElement).cellIndex];
	};
	expect(cellUnder("Projected xGI")).toHaveTextContent(/^0\.57$/);
	expect(cellUnder("Projected Mins")).toHaveTextContent(/^85$/);
	expect(cellUnder("Est. xGI Per 90")).toHaveTextContent(/^0\.60$/);
	expect(cellUnder("Projected xGI").style.backgroundColor).not.toBe("");
	// The delta is descriptive, so it carries no favourable shading.
	expect(cellUnder("Delta xGI Per 90")).toHaveTextContent(/^\+0\.41$/);
	expect(cellUnder("Delta xGI Per 90").style.backgroundColor).toBe("");
	const metricLabels = screen
		.getAllByRole("checkbox")
		.map((checkbox) => checkbox.parentElement?.textContent ?? "")
		.filter((label) => ["xGI", "xG", "xA"].includes(label));
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
	fireEvent.click(await screen.findByText("DefCon Probability"));
	await waitFor(() => {
		expect(screen.getByText("Senesi")).toBeInTheDocument();
	});
	expect(screen.getByText("P(Hit | 60+ Mins)")).toBeInTheDocument();
});

test("renders the research tab with backtest summaries", async () => {
	render(withProviders(<App />));
	fireEvent.click(await screen.findByText("Research"));

	await waitFor(() => {
		expect(screen.getByText("Backtested Evidence")).toBeInTheDocument();
	});
	expect(screen.getByText("Player Form Signals")).toBeInTheDocument();
	expect(screen.getByText("+2.8%")).toBeInTheDocument();
	expect(screen.getByText("95% interval -3.4% to +8.3%")).toBeInTheDocument();
	expect(screen.getByText("+42.8%")).toBeInTheDocument();
	expect(screen.getByText("Projected xGI (Default Sort)")).toBeInTheDocument();
	expect(
		screen.getByText("Projected xGI (Ignoring Recent Minutes)"),
	).toBeInTheDocument();
	expect(screen.getByText("Even Blend (Projected Mins)")).toBeInTheDocument();
	expect(screen.getByText("14.8")).toBeInTheDocument();
	expect(screen.getByText("DefCon Probability Model")).toBeInTheDocument();
	expect(screen.getByText("Calibrated Count Brier")).toBeInTheDocument();
	expect(screen.getByText("0.139")).toBeInTheDocument();
	expect(screen.getByText("+1.4% vs binary")).toBeInTheDocument();
	expect(screen.getByText("Future Club xG")).toBeInTheDocument();
	expect(screen.getByText("Future Club xGC")).toBeInTheDocument();
	expect(screen.getByText("Recent Club Form")).toBeInTheDocument();
	expect(screen.getByText("Baseline MAE")).toBeInTheDocument();
	expect(screen.getByText(/Historical FDR is excluded/)).toBeInTheDocument();
	const bucketHeader = screen.getByRole("columnheader", { name: /Bucket/ });
	fireEvent.click(
		within(bucketHeader).getByRole("button", { name: "Show explanation" }),
	);
	expect(
		screen.getByText(/Buckets group predicted probabilities/),
	).toBeInTheDocument();
	await waitFor(() => {
		const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
		expect(
			calls.some((input) =>
				input.includes("/api/players/defcon-probability-validation"),
			),
		).toBe(true);
		expect(
			calls.some((input) => input.includes("/api/clubs/form-validation")),
		).toBe(true);
	});
});

test("defaults research to the last complete season early in a live season", async () => {
	window.history.replaceState(null, "", "/?tab=evidence");
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		if (url !== "/api/") {
			return mockApiFetch(input);
		}
		return Promise.resolve(
			new Response(
				JSON.stringify({ ...meta, season: "2026-27", latest_gw: 4 }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
	});
	const validationCalls = () =>
		vi
			.mocked(fetch)
			.mock.calls.map(([input]) => String(input))
			.filter((url) => url.includes("validation"));

	render(withProviders(<App />));

	const seasonSelect = await screen.findByLabelText("Season");
	expect(seasonSelect).toHaveValue("2025-26");
	expect(
		within(seasonSelect).getByRole("option", { name: "2026-27 (Live)" }),
	).toBeInTheDocument();
	expect(
		within(seasonSelect).queryByRole("option", { name: "2024-25" }),
	).not.toBeInTheDocument();
	expect(
		screen.getByText(/until the live season reaches GW19/),
	).toBeInTheDocument();
	await waitFor(() => {
		expect(validationCalls()).toHaveLength(3);
	});
	expect(validationCalls().every((url) => url.includes("season=2025-26"))).toBe(
		true,
	);

	fireEvent.change(seasonSelect, { target: { value: "2026-27" } });

	await waitFor(() => {
		expect(
			validationCalls().filter((url) => url.includes("season=2026-27")),
		).toHaveLength(3);
	});
	expect(screen.getByLabelText("Season")).toHaveValue("2026-27");
});

test("shows a load error when the form backtest fails", async () => {
	window.history.replaceState(null, "", "/?tab=evidence");
	vi.mocked(fetch).mockImplementation((input) =>
		String(input).includes("/players/form-validation")
			? Promise.resolve(new Response("{}", { status: 500 }))
			: mockApiFetch(input),
	);

	render(withProviders(<App />));

	expect(await screen.findByText(/Failed to load/)).toBeInTheDocument();
	expect(screen.queryByText("Player Form Signals")).not.toBeInTheDocument();
});

test("hides point-in-time table filters on the research tab", async () => {
	window.history.replaceState(null, "", "/?tab=evidence&as_of_gw=20");

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Backtested Evidence")).toBeInTheDocument();
	});
	expect(
		screen.getByText(/replaying historic as-of gameweeks/),
	).toBeInTheDocument();
	expect(
		screen.queryByText(/Figures are point-in-time as of GW 20/),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /As Of GW 20/ }),
	).not.toBeInTheDocument();
	await waitFor(() => {
		expect(
			new URLSearchParams(window.location.search).get("as_of_gw"),
		).toBeNull();
	});
});

test("renders the Club Form tab with team-level context", async () => {
	render(withProviders(<App />));
	fireEvent.click(await screen.findByText("Club Form"));

	await waitFor(() => {
		expect(screen.getAllByText("Arsenal").length).toBeGreaterThan(0);
	});
	expect(screen.getByText("Window xG")).toBeInTheDocument();
	expect(screen.getByText("Delta xGC")).toBeInTheDocument();
	expect(screen.queryByText("Defence Form")).not.toBeInTheDocument();
	expect(screen.getAllByRole("columnheader")).toHaveLength(11);
	expect(screen.getByText("FDR (Next 5)")).toBeInTheDocument();
	expect(screen.queryByText("Window Goals")).not.toBeInTheDocument();
	expect(screen.queryByText("Delta Goals")).not.toBeInTheDocument();
	expect(screen.queryByText("Window Goals Conceded")).not.toBeInTheDocument();
	expect(screen.queryByText("Delta Goals Conceded")).not.toBeInTheDocument();

	fireEvent.change(screen.getByLabelText("Team"), {
		target: { value: "Chelsea" },
	});
	await waitFor(() => {
		expect(screen.getAllByText("Chelsea").length).toBeGreaterThan(0);
	});
});

test("shows signed club overperformance totals and rates with numeric sorting", async () => {
	render(withProviders(<App />));
	fireEvent.click(await screen.findByText("Club Form"));
	await screen.findByRole("cell", { name: "Arsenal" });
	fireEvent.click(screen.getByText("Columns (11)"));
	for (const label of [
		"xG +/- Totals",
		"xG +/- Per Match",
		"xGC +/- Totals",
		"xGC +/- Per Match",
		"xGD +/- Totals",
		"xGD +/- Per Match",
	]) {
		fireEvent.click(screen.getByLabelText(label));
	}
	const table = screen.getByRole("table");
	const headers = within(table).getAllByRole("columnheader");
	const cellFor = (club: string, header: string) => {
		const index = headers.findIndex((cell) =>
			cell.textContent?.includes(header),
		);
		expect(index).toBeGreaterThan(-1);
		const row = within(table).getByRole("row", { name: new RegExp(club) });
		return within(row).getAllByRole("cell")[index];
	};
	const values = [
		["Window xG +/- Total", "+1.50"],
		["Window xG +/- Per Match", "+0.30"],
		["Season xG +/- Total", "+7.60"],
		["Season xG +/- Per Match", "+0.20"],
		["Window xGC +/- Total", "+1.00"],
		["Window xGC +/- Per Match", "+0.20"],
		["Season xGC +/- Total", "+7.60"],
		["Season xGC +/- Per Match", "+0.20"],
		["Window xGD +/- Total", "+2.50"],
		["Window xGD +/- Per Match", "+0.50"],
		["Season xGD +/- Total", "+15.20"],
		["Season xGD +/- Per Match", "+0.40"],
	];
	for (const [header, value] of values) {
		expect(cellFor("Arsenal", header)).toHaveTextContent(value);
	}
	expect(cellFor("Chelsea", "Window xGC +/- Total")).toHaveTextContent("-1.50");
	expect(cellFor("Chelsea", "Window xG +/- Total")).toHaveTextContent("-1.00");
	expect(cellFor("Chelsea", "Window xGD +/- Total")).toHaveTextContent("-2.50");
	expect(
		cellFor("Arsenal", "Window xGC +/- Total").style.backgroundColor,
	).not.toBe(cellFor("Chelsea", "Window xGC +/- Total").style.backgroundColor);
	const header = within(table).getByRole("button", {
		name: "Window xGC +/- Total",
	});
	fireEvent.click(header);
	expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Arsenal");
	fireEvent.click(header);
	expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Chelsea");
});

test("shows club xGD by default just before FDR", async () => {
	render(withProviders(<App />));
	fireEvent.click(await screen.findByText("Club Form"));
	await screen.findByRole("cell", { name: "Arsenal" });
	const table = screen.getByRole("table");
	const headers = within(table).getAllByRole("columnheader");
	const headerIndex = (name: string) =>
		headers.findIndex((cell) => cell.textContent?.includes(name));
	expect(headerIndex("Window xGD")).toBe(headerIndex("FDR (Next 5)") - 2);
	expect(headerIndex("Season xGD")).toBe(headerIndex("FDR (Next 5)") - 1);
	const arsenal = within(table).getByRole("row", { name: /Arsenal/ });
	const cells = within(arsenal).getAllByRole("cell");
	expect(cells[headerIndex("Window xGD")]).toHaveTextContent("+1.30");
	expect(cells[headerIndex("Season xGD")]).toHaveTextContent("+0.60");
	const chelsea = within(table).getByRole("row", { name: /Chelsea/ });
	expect(
		within(chelsea).getAllByRole("cell")[headerIndex("Window xGD")],
	).toHaveTextContent("-0.70");
});

test("shows club actual goal columns only when toggled on", async () => {
	render(withProviders(<App />));
	fireEvent.click(await screen.findByText("Club Form"));

	await waitFor(() => {
		expect(screen.getAllByText("Arsenal").length).toBeGreaterThan(0);
	});

	fireEvent.click(screen.getByText("Columns (11)"));
	const goalsToggle = screen.getByLabelText("Goals");
	const goalsConcededToggle = screen.getByLabelText("Goals Conceded");
	expect(goalsToggle).not.toBeChecked();
	expect(goalsConcededToggle).not.toBeChecked();

	fireEvent.click(goalsToggle);
	expect(screen.getByText("Window Goals")).toBeInTheDocument();
	expect(screen.getByText("Delta Goals")).toBeInTheDocument();
	expect(screen.queryByText("Window Goals Conceded")).not.toBeInTheDocument();

	fireEvent.click(goalsConcededToggle);
	expect(screen.getByText("Window Goals Conceded")).toBeInTheDocument();
	expect(screen.getByText("Delta Goals Conceded")).toBeInTheDocument();
});

test("persists club column groups and resets to the compact defaults", async () => {
	window.history.replaceState(
		null,
		"",
		"/?tab=clubs&club_columns=xg,finishing_total",
	);
	const view = render(withProviders(<App />));
	await screen.findByRole("cell", { name: "Arsenal" });
	expect(screen.getAllByRole("columnheader")).toHaveLength(6);
	expect(
		screen.queryByRole("button", { name: "Window xGC" }),
	).not.toBeInTheDocument();
	fireEvent.click(screen.getByText("Columns (6)"));
	fireEvent.click(screen.getByLabelText("xG"));
	fireEvent.click(screen.getByLabelText("xG +/- Totals"));
	expect(screen.getAllByRole("columnheader")).toHaveLength(1);
	await waitFor(() =>
		expect(
			new URLSearchParams(window.location.search).get("club_columns"),
		).toBe(""),
	);
	view.unmount();
	render(withProviders(<App />));
	await screen.findByRole("cell", { name: "Arsenal" });
	expect(screen.getAllByRole("columnheader")).toHaveLength(1);
	fireEvent.click(screen.getByText("Columns (1)"));
	fireEvent.click(screen.getByRole("button", { name: "Reset Columns" }));
	expect(screen.getAllByRole("columnheader")).toHaveLength(11);
	await waitFor(() =>
		expect(
			new URLSearchParams(window.location.search).has("club_columns"),
		).toBe(false),
	);
});

test("preserves actual goals from legacy club column links", async () => {
	window.history.replaceState(null, "", "/?tab=clubs&club_actuals=goals,ga");
	render(withProviders(<App />));
	await screen.findByRole("cell", { name: "Arsenal" });
	expect(screen.getByText("Window Goals")).toBeInTheDocument();
	expect(screen.getByText("Window Goals Conceded")).toBeInTheDocument();
	expect(screen.getByText("Window xG")).toBeInTheDocument();
	expect(screen.getAllByRole("columnheader")).toHaveLength(15);
});

test("toggles club context groups independently and can hide the sorted group", async () => {
	window.history.replaceState(null, "", "/?tab=clubs");
	render(withProviders(<App />));
	await screen.findByRole("cell", { name: "Arsenal" });
	fireEvent.click(screen.getByText("Columns (11)"));
	fireEvent.click(screen.getByRole("button", { name: "Window xGC" }));
	for (const [label, headers] of [
		["Matches", ["Matches"]],
		["xGC", ["Window xGC", "Season xGC", "Delta xGC"]],
		["xGD", ["Window xGD", "Season xGD"]],
		["FDR", ["FDR (Next 5)"]],
	] as const) {
		fireEvent.click(screen.getByLabelText(label));
		for (const name of headers) {
			expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
		}
	}
	fireEvent.click(screen.getByLabelText("Form Summaries"));
	expect(
		screen.getByRole("button", { name: "Attack Form" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Defence Form" }),
	).toBeInTheDocument();
	expect(screen.getAllByRole("columnheader")).toHaveLength(6);
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
		"/?tab=defcon-prob&q=Sen&position=DEF&team=Bournemouth&min_games=10&as_of_gw=20&shortlist=1,3&player=1&player_window=6&season=2024-25",
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
	expect(screen.getByRole("button", { name: "Shortlisted (2)" })).toBeEnabled();

	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
	expect(calls).toContain("/api/players/1?window=6&season=2024-25");
	expect(calls).not.toContain(
		"/api/players/1?window=6&season=2024-25&as_of_gw=20",
	);
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
	openMoreFilters();
	fireEvent.change(screen.getByLabelText("Max Price"), {
		target: { value: "11" },
	});
	fireEvent.change(screen.getByLabelText("Max FDR"), {
		target: { value: "4" },
	});
	fireEvent.change(screen.getByLabelText("Min Start %"), {
		target: { value: "80" },
	});
	fireEvent.change(screen.getByLabelText("Min Mins/App"), {
		target: { value: "75" },
	});
	fireEvent.change(screen.getByLabelText("Min Owned %"), {
		target: { value: "10" },
	});
	fireEvent.change(screen.getByLabelText("Max Owned %"), {
		target: { value: "45" },
	});
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Add Saka to shortlist" }),
		).toBeInTheDocument();
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Add Saka to shortlist" }),
	);
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
		expect(params.get("max_price")).toBe("11");
		expect(params.get("max_fdr")).toBe("4");
		expect(params.get("min_start_pct")).toBe("80");
		expect(params.get("min_mins_app")).toBe("75");
		expect(params.get("min_owned")).toBe("10");
		expect(params.get("max_owned")).toBe("45");
		expect(params.get("shortlist")).toBe("2");
	});
	await waitFor(() => {
		expect(screen.getByText("Saka")).toBeInTheDocument();
	});

	fireEvent.click(screen.getByText("Attacking Form"));
	await waitFor(() => {
		expect(screen.getAllByText("Saka").length).toBeGreaterThan(0);
	});
	const tableSaka = screen
		.getAllByText("Saka")
		.find((element) => element.closest("tbody") !== null);
	expect(tableSaka).toBeDefined();
	fireEvent.click(tableSaka as HTMLElement);
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("player")).toBe("2");
	});
	await waitFor(() => {
		expect(screen.getByText("Season History")).toBeInTheDocument();
	});
	fireEvent.change(screen.getByLabelText("Rolling Window (Gameweeks)"), {
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

function mockEarlySeasonFetch(
	overrides: (url: string) => unknown = () => undefined,
) {
	vi.mocked(fetch).mockImplementation((input) => {
		const url = String(input);
		const body = url === "/api/" ? { ...meta, latest_gw: 4 } : overrides(url);
		if (body === undefined) {
			return mockApiFetch(input);
		}
		return Promise.resolve(
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	});
}

test("limits the default window and min games to gameweeks played", async () => {
	mockEarlySeasonFetch((url) =>
		url.includes("/players/defcon-probability?")
			? probRows.map((row) =>
					row.web_name === "Saka" ? { ...row, games: 2 } : row,
				)
			: undefined,
	);

	render(withProviders(<App />));

	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	const formCalls = vi
		.mocked(fetch)
		.mock.calls.map(([input]) => String(input))
		.filter((url) => url.includes("/players/form"));
	expect(formCalls.length).toBeGreaterThan(0);
	expect(formCalls.every((url) => url.includes("window=3"))).toBe(true);
	expect(screen.getByLabelText("Window size in gameweeks")).toHaveValue(3);
	expect(new URLSearchParams(window.location.search).get("window")).toBeNull();
	expect(
		screen.queryByText(/covers every gameweek up to GW4/),
	).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "DefCon Probability" }));

	expect(await screen.findByLabelText("Min Games")).toHaveValue(3);
	await waitFor(() => {
		expect(
			within(screen.getByRole("table")).getByText("Mbeumo"),
		).toBeInTheDocument();
	});
	// Saka's two games fall below the automatic three-game floor.
	expect(
		within(screen.getByRole("table")).queryByText("Saka"),
	).not.toBeInTheDocument();
	expect(
		new URLSearchParams(window.location.search).get("min_games"),
	).toBeNull();
});

test("explains when an explicit window covers every gameweek played", async () => {
	window.history.replaceState(null, "", "/?window=5");
	mockEarlySeasonFetch();

	render(withProviders(<App />));

	expect(
		await screen.findByText(/covers every gameweek up to GW4/),
	).toHaveTextContent("Use a window of 3 or fewer to compare them.");

	fireEvent.click(screen.getByRole("button", { name: /Clear Window 5/ }));

	await waitFor(() => {
		expect(
			screen.queryByText(/covers every gameweek up to GW4/),
		).not.toBeInTheDocument();
	});
	expect(screen.getByLabelText("Window size in gameweeks")).toHaveValue(3);
	expect(new URLSearchParams(window.location.search).get("window")).toBeNull();
});

test("explains an empty DefCon probability table when min games exceeds gameweeks played", async () => {
	window.history.replaceState(null, "", "/?tab=defcon-prob&min_games=6");
	mockEarlySeasonFetch((url) =>
		url.includes("/players/defcon-probability?") ? [] : undefined,
	);

	render(withProviders(<App />));

	expect(
		await screen.findAllByText(
			"Min Games 6 exceeds the 4 gameweeks played up to GW4. Lower it to see players.",
		),
	).not.toHaveLength(0);
});

test("fetches each player table once and filters position in the browser", async () => {
	render(withProviders(<App />));
	const table = await screen.findByRole("table");
	await waitFor(() => {
		expect(within(table).getByText("Haaland")).toBeInTheDocument();
	});
	const formCalls = () =>
		vi
			.mocked(fetch)
			.mock.calls.map(([input]) => String(input))
			.filter((url) => url.includes("/players/form"));
	expect(formCalls()).toHaveLength(1);
	expect(formCalls()[0]).not.toContain("position=");

	fireEvent.change(screen.getByLabelText("Position"), {
		target: { value: "FWD" },
	});

	await waitFor(() => {
		expect(within(table).queryByText("Mbeumo")).not.toBeInTheDocument();
	});
	expect(within(table).getByText("Haaland")).toBeInTheDocument();
	expect(formCalls()).toHaveLength(1);
});

test("restores dashboard state and the team ID draft on back navigation", async () => {
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});

	window.history.replaceState(null, "", "/?tab=defcon&window=4&fpl_team=123");
	fireEvent(window, new PopStateEvent("popstate"));

	expect(
		await screen.findByRole("button", { name: "DefCon Form" }),
	).toHaveClass("bg-zinc-900");
	expect(screen.getByLabelText("Window size in gameweeks")).toHaveValue(4);
	expect(screen.getByLabelText("FPL Team ID")).toHaveValue(123);
});

test("explains an empty club-form backtest instead of showing bare headers", async () => {
	window.history.replaceState(null, "", "/?tab=evidence");
	mockEarlySeasonFetch((url) =>
		url.includes("/clubs/form-validation") ? [] : undefined,
	);

	render(withProviders(<App />));

	expect(
		await screen.findByText(/results start once GW16 is complete/),
	).toHaveTextContent("No gameweeks can be scored yet");
});

test("shades FDR on its fixed scale without a league-wide range", async () => {
	render(withProviders(<App />));
	const table = await screen.findByRole("table");
	await waitFor(() => {
		expect(within(table).getByText("Mbeumo")).toBeInTheDocument();
	});
	const headers = within(table).getAllByRole("columnheader");
	const fdrIndex = headers.findIndex((cell) =>
		cell.textContent?.includes("FDR (Next 5)"),
	);
	const fdrCell = (player: string) =>
		within(within(table).getByRole("row", { name: new RegExp(player) }))
			.getAllByRole("cell")
			.at(fdrIndex);

	// 2.6 is easier than the neutral 3, and 3.4 is harder.
	expect(fdrCell("Mbeumo")).toHaveTextContent("2.6");
	expect(fdrCell("Mbeumo")?.style.backgroundColor).toMatch(/^rgb/);
	expect(fdrCell("Saka")).toHaveTextContent("3.4");
	expect(fdrCell("Saka")?.style.backgroundColor).toMatch(/^rgb/);
	expect(fdrCell("Mbeumo")?.style.backgroundColor).not.toBe(
		fdrCell("Saka")?.style.backgroundColor,
	);
});

test("folds advanced filters behind a toggle that counts the ones in use", async () => {
	window.history.replaceState(null, "", "/?max_price=7&min_window_xgi90=0.3");
	render(withProviders(<App />));

	const toggle = await screen.findByRole("button", {
		name: "More Filters (2)",
	});
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	expect(screen.queryByLabelText("Max Price")).not.toBeInTheDocument();
	expect(screen.getByLabelText("Position")).toBeInTheDocument();

	fireEvent.click(toggle);

	expect(
		screen.getByRole("button", { name: "Fewer Filters (2)" }),
	).toHaveAttribute("aria-expanded", "true");
	expect(screen.getByLabelText("Max Price")).toHaveValue(7);
	expect(screen.getByLabelText("Min Window xGI/90")).toHaveValue(0.3);
});

test("keeps the table sort in the URL and clears it when switching tabs", async () => {
	window.history.replaceState(null, "", "/?sort=price:asc");
	render(withProviders(<App />));
	await waitFor(() => {
		expect(
			within(screen.getByRole("table")).getByText("Haaland"),
		).toBeInTheDocument();
	});
	const firstPlayer = () =>
		within(
			within(screen.getByRole("table")).getAllByRole("row")[1],
		).getAllByRole("cell")[1];
	// Mbeumo is the cheapest of the three fixture players.
	expect(firstPlayer()).toHaveTextContent("Mbeumo");

	fireEvent.click(screen.getByRole("button", { name: "DefCon Form" }));
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("sort")).toBeNull();
	});

	fireEvent.click(screen.getByRole("button", { name: "Attacking Form" }));
	await waitFor(() => {
		expect(
			within(screen.getByRole("table")).getByText("Haaland"),
		).toBeInTheDocument();
	});
	// Numeric columns sort descending first.
	fireEvent.click(
		within(screen.getByRole("table")).getByRole("button", { name: /^Price/ }),
	);
	await waitFor(() => {
		expect(new URLSearchParams(window.location.search).get("sort")).toBe(
			"price:desc",
		);
	});
	expect(firstPlayer()).toHaveTextContent("Haaland");
});

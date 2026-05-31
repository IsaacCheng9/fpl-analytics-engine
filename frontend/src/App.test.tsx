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
];

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
		prob_std: 0.1,
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
		prob_std: 0.11,
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
		prob_std: 0.1,
		as_of_gw: 38,
	},
];
const defconValidation = {
	n_predictions: 100,
	model_brier: 0.14,
	raw_rate_brier: 0.151,
	constant_brier: 0.162,
	model_ece: 0.013,
	raw_rate_ece: 0.032,
	model_improvement_vs_raw: 0.073,
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
const clubValidationRows = [
	{
		target: "future_xg_per_match",
		n_predictions: 48,
		fdr_mae: 0.42,
		fdr_plus_form_mae: 0.39,
		mae_improvement: 0.03,
		mae_improvement_pct: 0.071,
		fdr_rmse: 0.55,
		fdr_plus_form_rmse: 0.52,
		rmse_improvement: 0.03,
		rmse_improvement_pct: 0.055,
	},
	{
		target: "future_xgc_per_match",
		n_predictions: 48,
		fdr_mae: 0.44,
		fdr_plus_form_mae: 0.445,
		mae_improvement: -0.005,
		mae_improvement_pct: -0.011,
		fdr_rmse: 0.57,
		fdr_plus_form_rmse: 0.568,
		rmse_improvement: 0.002,
		rmse_improvement_pct: 0.004,
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

beforeEach(() => {
	mockLocalStorage();
	window.history.replaceState(null, "", "/");
	window.localStorage.clear();
	vi.stubGlobal(
		"fetch",
		vi.fn((input: string) => {
			let body: unknown = meta;
			if (input.includes("/players/form")) {
				const params = new URL(input, "http://test").searchParams;
				body = params.get("min_delta") === "-1000" ? broadFormRows : formRows;
			} else if (input.includes("/clubs/form-validation")) {
				body = clubValidationRows;
			} else if (input.includes("/clubs/form")) {
				body = clubRows;
			} else if (input.includes("/players/defcon-probability-validation")) {
				body = defconValidation;
			} else if (input.includes("/players/defcon-probability")) {
				body = probRows;
			} else if (input.includes("/players/defcon?")) {
				body = defconRows;
			} else if (/\/players\/\d+/.test(input)) {
				const element = Number(input.match(/\/players\/(\d+)/)?.[1]);
				body =
					playerDetails[element as keyof typeof playerDetails] ?? playerDetail;
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

test("collapses the attacking form chart and remembers the preference", async () => {
	const firstRender = render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("region", { name: "Attacking Form Scatter Chart" }),
	).toBeInTheDocument();

	const hideButton = screen.getByRole("button", { name: "Hide Chart" });
	expect(hideButton).toHaveAttribute("aria-expanded", "true");
	fireEvent.click(hideButton);

	expect(
		screen.queryByRole("region", { name: "Attacking Form Scatter Chart" }),
	).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Show Chart" })).toHaveAttribute(
		"aria-expanded",
		"false",
	);
	expect(window.localStorage.getItem("fpl-form-scatter-collapsed")).toBe(
		"true",
	);

	firstRender.unmount();
	render(withProviders(<App />));
	await waitFor(() => {
		expect(screen.getByText("Mbeumo")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Show Chart" }),
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

	fireEvent.change(within(dialog).getByLabelText("Window (Games)"), {
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
	expect(within(dialog).getByLabelText("Window (Games)")).toHaveValue("3");
	expect(within(dialog).getByLabelText("As Of GW")).toHaveValue("20");
	await waitFor(() => {
		const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
		expect(
			calls.some((input) => input.includes("/api/players/2?window=3")),
		).toBe(true);
		expect(
			calls.some((input) => input.includes("/api/players/3?window=3")),
		).toBe(true);
		expect(
			calls.some((input) =>
				input.includes(
					"/api/players/form?window=3&min_minutes=0&as_of_gw=20&min_delta=-1000",
				),
			),
		).toBe(true);
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
	expect(headerIndex("Owned %")).toBeLessThan(headerIndex("Mins"));
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
	fireEvent.click(screen.getByText("DefCon Probability"));
	await waitFor(() => {
		expect(screen.getByText("Senesi")).toBeInTheDocument();
	});
});

test("renders the model evidence tab with backtest summaries", async () => {
	render(withProviders(<App />));
	fireEvent.click(screen.getByText("Model Evidence"));

	await waitFor(() => {
		expect(screen.getByText("Backtested Evidence")).toBeInTheDocument();
	});
	expect(screen.getByText("DefCon Probability Model")).toBeInTheDocument();
	expect(screen.getByText("Model Brier")).toBeInTheDocument();
	expect(screen.getByText("0.140")).toBeInTheDocument();
	expect(screen.getByText("+7.3% vs raw rate")).toBeInTheDocument();
	expect(screen.getByText("Future Club xG")).toBeInTheDocument();
	expect(screen.getByText("Future Club xGC")).toBeInTheDocument();
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

test("hides point-in-time table filters on the model evidence tab", async () => {
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
	fireEvent.click(screen.getByText("Club Form"));

	await waitFor(() => {
		expect(screen.getAllByText("Arsenal").length).toBeGreaterThan(0);
	});
	expect(screen.getByText("Window xG")).toBeInTheDocument();
	expect(screen.getByText("Delta xGC")).toBeInTheDocument();
	expect(screen.getByText("Defence Form")).toBeInTheDocument();
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

test("shows club actual goal columns only when toggled on", async () => {
	render(withProviders(<App />));
	fireEvent.click(screen.getByText("Club Form"));

	await waitFor(() => {
		expect(screen.getAllByText("Arsenal").length).toBeGreaterThan(0);
	});

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

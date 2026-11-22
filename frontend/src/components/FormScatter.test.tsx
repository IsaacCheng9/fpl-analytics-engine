import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { cloneElement, isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FormPlayer } from "../api";
import { FormScatter } from "./FormScatter";
import { type ScatterPoint, ScatterTooltip } from "./FormScatterPlot";

vi.mock("recharts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("recharts")>();
	return {
		...actual,
		// JSDOM has no layout engine, so give Recharts fixed dimensions in tests.
		ResponsiveContainer: ({
			children,
		}: {
			children: ReactElement<{ width?: number; height?: number }>;
		}) =>
			isValidElement(children) ? (
				<div style={{ width: 640, height: 340 }}>
					{cloneElement(children, { width: 640, height: 340 })}
				</div>
			) : null,
	};
});

function makePlayer(overrides: Partial<FormPlayer> = {}): FormPlayer {
	return {
		element: 1,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		price: 10.2,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.45,
		window_xa90: 0.35,
		window_xgi90: 0.8,
		season_xg90: 0.4,
		season_xa90: 0.3,
		season_xgi90: 0.7,
		delta_xg90: 0.05,
		delta_xa90: 0.05,
		delta_xgi90: 0.1,
		est_xg90: 0.42,
		est_xa90: 0.32,
		est_xgi90: 0.74,
		projected_minutes: 84,
		projected_xgi: 0.69,
		window_xg90_per_million: 0.04,
		window_xa90_per_million: 0.03,
		window_xgi90_per_million: 0.08,
		season_points_per_million: 12.5,
		window_start_rate: 1,
		window_mins_per_appearance: 90,
		upcoming_fixtures: 5,
		avg_fdr: 2.6,
		next_fixture_gw: 10,
		next_opponent_name: "Fulham",
		next_was_home: true,
		next_fdr: 2,
		next_fixtures: [],
		current_ownership: 35.4,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		as_of_gw: 9,
		...overrides,
	};
}

const samplePlayers: FormPlayer[] = [
	makePlayer({
		element: 1,
		web_name: "Raya",
		position: "GK",
		team_name: "Arsenal",
		price: 5.5,
		projected_xgi: 0.02,
		est_xgi90: 0.02,
		projected_minutes: 90,
		window_xgi90: 0.01,
		season_xgi90: 0.02,
	}),
	makePlayer({
		element: 2,
		web_name: "Gabriel",
		position: "DEF",
		team_name: "Arsenal",
		price: 6.2,
		projected_xgi: 0.18,
		est_xgi90: 0.19,
		projected_minutes: 86,
		window_xgi90: 0.22,
		season_xgi90: 0.17,
	}),
	makePlayer({
		element: 3,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		price: 10.2,
		projected_xgi: 0.69,
		est_xgi90: 0.74,
		projected_minutes: 84,
		window_xgi90: 0.8,
		season_xgi90: 0.7,
	}),
	makePlayer({
		element: 4,
		web_name: "Haaland",
		position: "FWD",
		team_name: "Man City",
		price: 15.0,
		projected_xgi: 0.92,
		est_xgi90: 0.96,
		projected_minutes: 86,
		window_xgi90: 1.05,
		season_xgi90: 0.95,
	}),
];

function mockLocalStorage(overrides?: Partial<Storage>) {
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
		...overrides,
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: localStorageMock,
	});
}

beforeEach(() => {
	mockLocalStorage();
});

afterEach(() => {
	vi.restoreAllMocks();
});

test("starts collapsed by default and hides mode switcher until expanded", async () => {
	render(<FormScatter players={samplePlayers} />);

	const showButton = screen.getByRole("button", { name: "Show Chart" });
	expect(showButton).toHaveAttribute("aria-expanded", "false");
	expect(
		screen.queryByRole("region", { name: "Attacking Form Scatter Chart" }),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	).not.toBeInTheDocument();

	fireEvent.click(showButton);

	expect(screen.getByRole("button", { name: "Hide Chart" })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	expect(
		screen.getByRole("region", { name: "Attacking Form Scatter Chart" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Projected xGI vs Price" }),
	).toHaveAttribute("aria-pressed", "true");
	expect(window.localStorage.getItem("fpl-form-scatter-collapsed")).toBe(
		"false",
	);
	// Let the lazy FormScatterPlot chunk settle inside the test.
	await screen.findByText("Projected xGI");
});

test("switches across all three modes and persists mode selection", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const firstRender = render(<FormScatter players={samplePlayers} />);

	expect(
		screen.getByRole("heading", { name: "Projected xGI vs Price" }),
	).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByText("Projected xGI")).toBeInTheDocument();
	});
	expect(screen.getByText("Price (\u00a3m)")).toBeInTheDocument();
	expect(screen.getByText(/Median \(/)).toBeInTheDocument();

	fireEvent.click(
		screen.getByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	);
	expect(
		screen.getByRole("heading", { name: "Est. xGI/90 vs Projected Minutes" }),
	).toBeInTheDocument();
	expect(screen.getByText("Projected Minutes")).toBeInTheDocument();
	expect(screen.getByText("Est. xGI/90")).toBeInTheDocument();
	expect(screen.getByText(/60 Mins & Median \(/)).toBeInTheDocument();
	expect(window.localStorage.getItem("fpl-form-scatter-mode")).toBe("role");

	fireEvent.click(
		screen.getByRole("button", { name: "Recent vs Season xGI/90" }),
	);
	expect(
		screen.getByRole("heading", { name: "Recent vs Season xGI/90" }),
	).toBeInTheDocument();
	expect(screen.getByText("Season xGI/90")).toBeInTheDocument();
	expect(screen.getByText("Window xGI/90")).toBeInTheDocument();
	expect(screen.getByText("Equal Rate (y = x)")).toBeInTheDocument();
	expect(window.localStorage.getItem("fpl-form-scatter-mode")).toBe("swing");

	firstRender.unmount();
	render(<FormScatter players={samplePlayers} />);
	expect(
		screen.getByRole("heading", { name: "Recent vs Season xGI/90" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Recent vs Season xGI/90" }),
	).toHaveAttribute("aria-pressed", "true");
});

test("falls back safely when localStorage is invalid or throws", () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	window.localStorage.setItem("fpl-form-scatter-mode", "unknown-mode");

	const { unmount } = render(<FormScatter players={samplePlayers} />);
	expect(
		screen.getByRole("heading", { name: "Projected xGI vs Price" }),
	).toBeInTheDocument();
	unmount();

	mockLocalStorage({
		getItem: () => {
			throw new Error("storage blocked");
		},
		setItem: () => {
			throw new Error("storage blocked");
		},
	});

	render(<FormScatter players={samplePlayers} />);
	fireEvent.click(screen.getByRole("button", { name: "Show Chart" }));
	fireEvent.click(
		screen.getByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	);
	expect(
		screen.getByRole("heading", { name: "Est. xGI/90 vs Projected Minutes" }),
	).toBeInTheDocument();
});

test("filters out players with null or non-finite values for the active mode", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const partialPlayers: FormPlayer[] = [
		makePlayer({
			element: 10,
			web_name: "MissingProjected",
			position: "MID",
			projected_xgi: null,
			est_xgi90: 0.5,
			season_xgi90: 0.4,
			window_xgi90: 0.5,
		}),
		makePlayer({
			element: 11,
			web_name: "MissingEst",
			position: "FWD",
			projected_xgi: 0.6,
			est_xgi90: null,
			season_xgi90: 0.4,
			window_xgi90: 0.5,
		}),
		makePlayer({
			element: 12,
			web_name: "MissingSwing",
			position: "DEF",
			projected_xgi: 0.2,
			est_xgi90: 0.22,
			season_xgi90: null,
			window_xgi90: 0.25,
		}),
		makePlayer({
			element: 13,
			web_name: "NonFinite",
			position: "GK",
			price: Number.NaN,
			projected_xgi: Number.POSITIVE_INFINITY,
			est_xgi90: Number.NaN,
			projected_minutes: Number.POSITIVE_INFINITY,
			season_xgi90: Number.NaN,
			window_xgi90: Number.POSITIVE_INFINITY,
		}),
	];

	const { container } = render(<FormScatter players={partialPlayers} />);

	// Value mode excludes MissingProjected and NonFinite -> 2 dots plotted (DEF, FWD).
	await waitFor(() => {
		expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
			2,
		);
	});
	expect(screen.queryByText("GK")).not.toBeInTheDocument();
	expect(screen.queryByText("MID")).not.toBeInTheDocument();
	expect(screen.getByText("DEF")).toBeInTheDocument();
	expect(screen.getByText("FWD")).toBeInTheDocument();

	// Role mode excludes MissingEst and NonFinite -> 2 dots plotted (DEF, MID).
	fireEvent.click(
		screen.getByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	);
	expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
		2,
	);
	expect(screen.getByText("MID")).toBeInTheDocument();
	expect(screen.getByText("DEF")).toBeInTheDocument();
	expect(screen.queryByText("GK")).not.toBeInTheDocument();
	expect(screen.queryByText("FWD")).not.toBeInTheDocument();

	// Swing mode excludes MissingSwing and NonFinite -> 2 dots plotted (MID, FWD).
	fireEvent.click(
		screen.getByRole("button", { name: "Recent vs Season xGI/90" }),
	);
	expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
		2,
	);
	expect(screen.getByText("MID")).toBeInTheDocument();
	expect(screen.getByText("FWD")).toBeInTheDocument();
	expect(screen.queryByText("GK")).not.toBeInTheDocument();
	expect(screen.queryByText("DEF")).not.toBeInTheDocument();
});

test("handles single-point geometry cleanly across all three modes", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const solo = [makePlayer({ element: 50, web_name: "Solo", price: 6.5 })];
	const { container } = render(<FormScatter players={solo} />);

	await waitFor(() => {
		expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
			1,
		);
	});
	// Value mode omits median reference lines when fewer than 2 players qualify.
	expect(screen.queryByText(/Median/)).not.toBeInTheDocument();
	expect(screen.getByText("\u00a36m")).toBeInTheDocument();
	expect(screen.getByText("\u00a37m")).toBeInTheDocument();

	// Role mode keeps the 60-minute threshold line without a median line.
	fireEvent.click(
		screen.getByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	);
	expect(screen.getByText("60 Mins")).toBeInTheDocument();
	expect(screen.queryByText(/60 Mins & Median/)).not.toBeInTheDocument();

	// Swing mode keeps the equal-rate diagonal.
	fireEvent.click(
		screen.getByRole("button", { name: "Recent vs Season xGI/90" }),
	);
	expect(screen.getByText("Equal Rate (y = x)")).toBeInTheDocument();
});

test("renders empty state when no players qualify for the active mode", () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const { rerender } = render(<FormScatter players={[]} />);

	expect(
		screen.getByText("No qualifying players for this mode and filter."),
	).toBeInTheDocument();

	rerender(
		<FormScatter
			players={[
				makePlayer({
					element: 99,
					projected_xgi: null,
					est_xgi90: 0.4,
				}),
			]}
		/>,
	);
	expect(
		screen.getByText("No qualifying players for this mode and filter."),
	).toBeInTheDocument();

	// Switching to a mode where the player has valid data renders the chart.
	fireEvent.click(
		screen.getByRole("button", { name: "Est. xGI/90 vs Projected Minutes" }),
	);
	expect(
		screen.queryByText("No qualifying players for this mode and filter."),
	).not.toBeInTheDocument();
});

test("groups points by position, supports squad/shortlist colour mode, and handles edge cases", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const withUnknownPos = [
		...samplePlayers,
		makePlayer({
			element: 5,
			web_name: "Manager",
			position: null,
			price: 4.5,
			projected_xgi: 0.1,
		}),
	];
	const { container, rerender } = render(
		<FormScatter players={withUnknownPos} />,
	);

	const region = screen.getByRole("region", {
		name: "Attacking Form Scatter Chart",
	});
	await waitFor(() => {
		expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
			5,
		);
	});
	expect(within(region).getByText("GK")).toBeInTheDocument();
	expect(within(region).getByText("DEF")).toBeInTheDocument();
	expect(within(region).getByText("MID")).toBeInTheDocument();
	expect(within(region).getByText("FWD")).toBeInTheDocument();
	expect(within(region).getByText("Other")).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Squad / Shortlist" }),
	).not.toBeInTheDocument();

	// Owned/shortlisted elements outside the plotted filter do not show the ring legend.
	rerender(
		<FormScatter players={samplePlayers} ownedElements={new Set([999])} />,
	);
	expect(
		screen.getByRole("button", { name: "Squad / Shortlist" }),
	).toBeInTheDocument();
	expect(
		within(region).queryByText("In Squad / Shortlist"),
	).not.toBeInTheDocument();

	// Matching owned/shortlisted players get a dark highlight ring in position mode.
	rerender(
		<FormScatter
			players={samplePlayers}
			ownedElements={new Set([2, 3])}
			shortlist={[3, 4]}
		/>,
	);

	expect(within(region).getByText("In Squad / Shortlist")).toBeInTheDocument();
	const circles = Array.from(
		container.querySelectorAll(".recharts-scatter-symbol circle"),
	);
	expect(circles.filter((c) => c.getAttribute("r") === "6")).toHaveLength(3);
	expect(
		circles.filter(
			(c) => c.getAttribute("stroke") === "var(--chart-tooltip-text)",
		),
	).toHaveLength(3);
	expect(circles.filter((c) => c.getAttribute("r") === "5")).toHaveLength(1);

	const squadButton = screen.getByRole("button", {
		name: "Squad / Shortlist",
	});
	fireEvent.click(squadButton);

	expect(squadButton).toHaveAttribute("aria-pressed", "true");
	expect(within(region).getByText("Owned")).toBeInTheDocument();
	expect(within(region).getByText("Shortlisted")).toBeInTheDocument();
	expect(within(region).getByText("Owned & Shortlisted")).toBeInTheDocument();
	expect(within(region).getByText("Other")).toBeInTheDocument();
	expect(within(region).queryByText("MID")).not.toBeInTheDocument();

	// Clearing both squad and shortlist falls back to position colour mode.
	rerender(
		<FormScatter
			players={samplePlayers}
			ownedElements={new Set()}
			shortlist={[]}
		/>,
	);
	expect(
		screen.queryByRole("button", { name: "Squad / Shortlist" }),
	).not.toBeInTheDocument();
	expect(within(region).getByText("MID")).toBeInTheDocument();
	expect(within(region).queryByText("Owned")).not.toBeInTheDocument();
});

test("highlights only the hovered dot across series and handles hover-then-click", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const onPlayerClick = vi.fn();
	const { container } = render(
		<FormScatter players={samplePlayers} onPlayerClick={onPlayerClick} />,
	);

	await waitFor(() => {
		expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
			4,
		);
	});
	expect(screen.getByText(/Click any dot for details\./)).toBeInTheDocument();

	const getCircles = () =>
		Array.from(container.querySelectorAll(".recharts-scatter-symbol circle"));
	expect(getCircles().every((c) => c.getAttribute("r") === "5")).toBe(true);
	expect(getCircles()[0]).toHaveStyle({ cursor: "pointer" });

	// Hover the first series dot (GK, element 1); index-0 dots in other series stay r=5.
	fireEvent.mouseEnter(getCircles()[0]);
	expect(getCircles().map((c) => c.getAttribute("r"))).toEqual([
		"7",
		"5",
		"5",
		"5",
	]);

	// Hovering another dot and receiving a late mouseLeave from the first keeps the second active.
	fireEvent.mouseEnter(getCircles()[2]);
	fireEvent.mouseLeave(getCircles()[0]);
	expect(getCircles().map((c) => c.getAttribute("r"))).toEqual([
		"5",
		"5",
		"7",
		"5",
	]);

	// Clicking the hovered dot fires onPlayerClick and clears the hover ring.
	fireEvent.click(getCircles()[2]);
	expect(onPlayerClick).toHaveBeenCalledTimes(1);
	expect(onPlayerClick).toHaveBeenCalledWith(3);
	expect(getCircles().every((c) => c.getAttribute("r") === "5")).toBe(true);

	// Hover then leave resets radius cleanly.
	fireEvent.mouseEnter(getCircles()[1]);
	expect(getCircles()[1].getAttribute("r")).toBe("7");
	fireEvent.mouseLeave(getCircles()[1]);
	expect(getCircles().every((c) => c.getAttribute("r") === "5")).toBe(true);
});

test("omits click affordances when onPlayerClick is not provided", async () => {
	window.localStorage.setItem("fpl-form-scatter-collapsed", "false");
	const { container } = render(<FormScatter players={[samplePlayers[0]]} />);

	await waitFor(() => {
		expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(
			1,
		);
	});
	expect(
		screen.queryByText(/Click any dot for details/),
	).not.toBeInTheDocument();
	const dot = container.querySelector(".recharts-scatter-symbol circle");
	expect(dot).not.toBeNull();
	expect((dot as HTMLElement).style.cursor).toBe("");
});

test("renders rich tooltip metrics across all modes and handles inactive state", () => {
	const point: ScatterPoint = {
		element: 3,
		name: "Saka",
		team: "Arsenal",
		position: "MID",
		price: 10.2,
		projectedXgi: 0.69,
		estXgi90: 0.74,
		projectedMinutes: 84,
		windowXgi90: 0.8,
		seasonXgi90: 0.7,
		isOwned: true,
		isShortlisted: true,
		x: 10.2,
		y: 0.69,
	};

	const { container, rerender } = render(
		<ScatterTooltip
			active
			payload={[{ payload: point }]}
			mode="value"
			clickable
		/>,
	);
	const tooltip = within(container);

	expect(tooltip.getByText("Saka")).toBeInTheDocument();
	expect(tooltip.getByText("Owned")).toBeInTheDocument();
	expect(tooltip.getByText("Shortlisted")).toBeInTheDocument();
	expect(tooltip.getByText("Arsenal / MID / \u00a310.2m")).toBeInTheDocument();
	expect(tooltip.getByText("Projected xGI")).toBeInTheDocument();
	expect(tooltip.getByText("0.69")).toBeInTheDocument();
	expect(tooltip.getByText("Est. xGI/90")).toBeInTheDocument();
	expect(tooltip.getByText("0.74")).toBeInTheDocument();
	expect(tooltip.getByText("Projected Mins")).toBeInTheDocument();
	expect(tooltip.getByText("84")).toBeInTheDocument();
	expect(
		tooltip.getByText("Click dot to open player details"),
	).toBeInTheDocument();

	rerender(
		<ScatterTooltip
			active
			payload={[{ payload: point }]}
			mode="role"
			clickable={false}
		/>,
	);
	expect(tooltip.getByText("Est. xGI/90")).toBeInTheDocument();
	expect(tooltip.getByText("0.74")).toBeInTheDocument();
	expect(tooltip.getByText("Projected Mins")).toBeInTheDocument();
	expect(tooltip.getByText("84")).toBeInTheDocument();
	expect(
		tooltip.queryByText("Click dot to open player details"),
	).not.toBeInTheDocument();

	rerender(
		<ScatterTooltip active payload={[{ payload: point }]} mode="swing" />,
	);
	expect(tooltip.getByText("Window xGI/90")).toBeInTheDocument();
	expect(tooltip.getByText("0.80")).toBeInTheDocument();
	expect(tooltip.getByText("Season xGI/90")).toBeInTheDocument();
	expect(tooltip.getByText("0.70")).toBeInTheDocument();

	rerender(
		<ScatterTooltip
			active={false}
			payload={[{ payload: point }]}
			mode="value"
		/>,
	);
	expect(container).toBeEmptyDOMElement();

	rerender(<ScatterTooltip active payload={[]} mode="value" />);
	expect(container).toBeEmptyDOMElement();
});

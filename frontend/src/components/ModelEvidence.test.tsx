import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { DefconProbabilityValidation, FormValidation } from "../api";
import { ModelEvidence } from "./ModelEvidence";

const validation: DefconProbabilityValidation = {
	n_predictions: 3002,
	model_brier: 0.138,
	binary_model_brier: 0.14,
	count_model_brier: 0.138,
	raw_rate_brier: 0.15,
	constant_brier: 0.162,
	model_ece: 0.008,
	binary_model_ece: 0.012,
	count_model_ece: 0.032,
	raw_rate_ece: 0.063,
	model_improvement_vs_raw: 0.08,
	model_improvement_vs_binary: 0.014,
	model_improvement_vs_count: 0,
	model_improvement_vs_constant: 0.15,
	calibration: [
		{
			bin: 0,
			n: 3000,
			mean_predicted: 0.07,
			observed_rate: 0.06,
			abs_error: 0.01,
		},
		{
			bin: 7,
			n: 2,
			mean_predicted: 0.71,
			observed_rate: 0,
			abs_error: 0.71,
		},
	],
};

function renderEvidence(
	defconValidation = validation,
	formValidation: FormValidation | undefined = undefined,
) {
	render(
		<ModelEvidence
			formValidation={formValidation}
			defconValidation={defconValidation}
			clubValidation={[]}
			season="2025-26"
			seasons={["2026-27", "2025-26"]}
			liveSeason="2026-27"
			onSeasonChange={vi.fn()}
		/>,
	);
}

test("greys out calibration buckets with too few predictions", () => {
	renderEvidence();

	const smallRow = screen.getByText("2 (small sample)").closest("tr");
	const largeRow = screen.getByText("3000").closest("tr");
	expect(smallRow).toHaveClass("text-zinc-400");
	expect(largeRow).not.toHaveClass("text-zinc-400");
	expect(
		screen.getByText(/Greyed buckets have fewer than 30/),
	).toBeInTheDocument();
});

test("plots a reliability diagram beside the calibration table", () => {
	renderEvidence();

	const chart = screen.getByRole("region", {
		name: "DefCon Reliability Diagram",
	});
	expect(within(chart).getByText("Perfect Calibration")).toBeInTheDocument();
	expect(
		within(chart).getByText("Fewer Than 30 Predictions"),
	).toBeInTheDocument();
});

test("omits the diagram and small-sample note when nothing is scored", () => {
	renderEvidence({ ...validation, n_predictions: 0, calibration: [] });

	expect(
		screen.queryByRole("region", { name: "DefCon Reliability Diagram" }),
	).not.toBeInTheDocument();
	expect(screen.queryByText(/Greyed buckets/)).not.toBeInTheDocument();
	expect(
		screen.getByText(/No predictions can be scored yet/),
	).toBeInTheDocument();
});

test("explains when no form-signal gameweeks can be scored", () => {
	renderEvidence(validation, {
		window: 5,
		horizon: 4,
		top_k: 20,
		n_predictions: 0,
		n_gameweeks: 0,
		swing_persistence: null,
		swing_persistence_low: null,
		swing_persistence_high: null,
		minutes_persistence: null,
		signals: [],
	});

	expect(
		screen.getByText(/results start once GW10 is complete/),
	).toBeInTheDocument();
	expect(
		screen.getByText("Not enough scored gameweeks yet"),
	).toBeInTheDocument();
});

test("shows a single-slate persistence estimate without an interval", () => {
	renderEvidence(validation, {
		window: 5,
		horizon: 4,
		top_k: 20,
		n_predictions: 250,
		n_gameweeks: 1,
		swing_persistence: -0.0004,
		swing_persistence_low: null,
		swing_persistence_high: null,
		minutes_persistence: 0.5,
		signals: [
			{
				signal: "projected_xgi",
				mean_rank_correlation: 0.6,
				top_future_xgi: 1.5,
				top_future_points: 15,
			},
		],
	});

	const card = (label: string) =>
		within(screen.getByText(label).parentElement as HTMLElement);
	const swing = card("Recent xGI Per 90 Swing That Persists");
	// A near-zero estimate reads as 0.0%, not -0.0%.
	expect(swing.getByText("0.0%")).toBeInTheDocument();
	expect(
		swing.getByText("Too few gameweeks for an interval"),
	).toBeInTheDocument();
	expect(
		card("Recent Minutes Swing That Persists").getByText("+50.0%"),
	).toBeInTheDocument();
});

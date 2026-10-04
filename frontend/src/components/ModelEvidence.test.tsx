import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { DefconProbabilityValidation } from "../api";
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

function renderEvidence(defconValidation = validation) {
	render(
		<ModelEvidence
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

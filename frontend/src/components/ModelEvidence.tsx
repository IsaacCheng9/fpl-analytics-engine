import type { ClubFormValidation, DefconProbabilityValidation } from "../api";
import { fmtNum } from "../lib/format";
import { InfoTooltip } from "./InfoTooltip";

type Tone = "good" | "bad" | "neutral";

function fmtRate(value: number | null | undefined): string {
	return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function fmtSignedRate(value: number | null | undefined): string {
	if (value == null) {
		return "-";
	}
	const sign = value > 0 ? "+" : "";
	return `${sign}${(value * 100).toFixed(1)}%`;
}

function fmtSignedNum(value: number | null | undefined): string {
	if (value == null) {
		return "-";
	}
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(3)}`;
}

function toneFromValue(value: number | null | undefined): Tone {
	if (value == null || value === 0) {
		return "neutral";
	}
	return value > 0 ? "good" : "bad";
}

function toneClass(tone: Tone): string {
	if (tone === "good") {
		return "text-emerald-700";
	}
	if (tone === "bad") {
		return "text-red-700";
	}
	return "text-zinc-700";
}

function targetLabel(target: string): string {
	if (target === "future_xg_per_match") {
		return "Future Club xG";
	}
	if (target === "future_xgc_per_match") {
		return "Future Club xGC";
	}
	return target;
}

function MetricCard({
	label,
	value,
	detail,
	tone = "neutral",
}: {
	label: string;
	value: string;
	detail?: string;
	tone?: Tone;
}) {
	return (
		<div className="rounded-md border border-zinc-200 bg-white px-3 py-3">
			<div className="font-medium text-xs text-zinc-500">{label}</div>
			<div className={`mt-1 font-semibold text-2xl ${toneClass(tone)}`}>
				{value}
			</div>
			{detail ? (
				<div className="mt-1 text-xs text-zinc-500">{detail}</div>
			) : null}
		</div>
	);
}

export function ModelEvidence({
	defconValidation,
	clubValidation,
}: {
	defconValidation: DefconProbabilityValidation | undefined;
	clubValidation: ClubFormValidation[];
}) {
	const clubRows = [...clubValidation].sort((left, right) =>
		targetLabel(left.target).localeCompare(targetLabel(right.target)),
	);

	return (
		<div className="space-y-4">
			<section className="rounded-lg border border-zinc-200 bg-white p-4">
				<h2 className="font-semibold text-lg">Backtested Evidence</h2>
				<p className="mt-1 max-w-3xl text-sm text-zinc-500">
					Historic as-of gameweeks are replayed, then scored against what
					happened next. This keeps the scouting signals accountable to the same
					point-in-time rules used by the transfer tables.
				</p>
			</section>

			<section className="rounded-lg border border-zinc-200 bg-white p-4">
				<div className="mb-3">
					<h3 className="font-semibold text-base">DefCon Probability Model</h3>
					<p className="mt-1 text-sm text-zinc-500">
						Calibrated contribution-count predictions, scored against the
						following gameweek among appearances of at least 60 minutes.
					</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MetricCard
						label="Calibrated Count Brier"
						value={fmtNum(defconValidation?.model_brier, 3)}
						detail={`${fmtSignedRate(defconValidation?.model_improvement_vs_binary)} vs binary`}
						tone={toneFromValue(defconValidation?.model_improvement_vs_binary)}
					/>
					<MetricCard
						label="Binary Brier"
						value={fmtNum(defconValidation?.binary_model_brier, 3)}
						detail="Previous surfaced model"
					/>
					<MetricCard
						label="Calibration Error"
						value={fmtNum(defconValidation?.model_ece, 3)}
						detail={`Raw count ${fmtNum(defconValidation?.count_model_ece, 3)}`}
					/>
					<MetricCard
						label="Predictions"
						value={fmtNum(defconValidation?.n_predictions, 0)}
						detail={`${fmtSignedRate(defconValidation?.model_improvement_vs_constant)} vs constant`}
						tone={toneFromValue(
							defconValidation?.model_improvement_vs_constant,
						)}
					/>
				</div>

				<div className="mt-4 overflow-x-auto rounded-md border border-zinc-200">
					<table className="w-full min-w-[36rem] border-collapse text-sm">
						<thead className="bg-zinc-100 text-left text-zinc-600">
							<tr>
								<th className="px-3 py-2 font-medium">
									<span className="flex items-center gap-1">
										Bucket
										<InfoTooltip text="Buckets group predicted probabilities into 10 percentage point bands: 0 = 0% to under 10%, 1 = 10% to under 20%, etc. Mean Predicted is compared with Observed Rate." />
									</span>
								</th>
								<th className="px-3 py-2 font-medium">Predictions</th>
								<th className="px-3 py-2 font-medium">Mean Predicted</th>
								<th className="px-3 py-2 font-medium">Observed Rate</th>
								<th className="px-3 py-2 font-medium">Abs Error</th>
							</tr>
						</thead>
						<tbody>
							{defconValidation?.calibration.map((row) => (
								<tr key={row.bin} className="border-zinc-100 border-t">
									<td className="px-3 py-2">{row.bin}</td>
									<td className="px-3 py-2">{fmtNum(row.n, 0)}</td>
									<td className="px-3 py-2">{fmtRate(row.mean_predicted)}</td>
									<td className="px-3 py-2">{fmtRate(row.observed_rate)}</td>
									<td className="px-3 py-2">{fmtRate(row.abs_error)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-lg border border-zinc-200 bg-white p-4">
				<div className="mb-3">
					<h3 className="font-semibold text-base">Recent Club Form</h3>
					<p className="mt-1 text-sm text-zinc-500">
						Season-to-date baselines compared with those baselines plus recent
						club-form context. Historical FDR is excluded because point-in-time
						rating snapshots are unavailable.
					</p>
				</div>
				<div className="overflow-x-auto rounded-md border border-zinc-200">
					<table className="w-full min-w-[46rem] border-collapse text-sm">
						<thead className="bg-zinc-100 text-left text-zinc-600">
							<tr>
								<th className="px-3 py-2 font-medium">Target</th>
								<th className="px-3 py-2 font-medium">Predictions</th>
								<th className="px-3 py-2 font-medium">Baseline MAE</th>
								<th className="px-3 py-2 font-medium">
									Baseline Plus Form MAE
								</th>
								<th className="px-3 py-2 font-medium">MAE Improvement</th>
								<th className="px-3 py-2 font-medium">RMSE Improvement</th>
							</tr>
						</thead>
						<tbody>
							{clubRows.map((row) => (
								<tr key={row.target} className="border-zinc-100 border-t">
									<th className="px-3 py-2 text-left font-medium text-zinc-700">
										{targetLabel(row.target)}
									</th>
									<td className="px-3 py-2">{fmtNum(row.n_predictions, 0)}</td>
									<td className="px-3 py-2">{fmtNum(row.baseline_mae, 3)}</td>
									<td className="px-3 py-2">
										{fmtNum(row.baseline_plus_form_mae, 3)}
									</td>
									<td
										className={`px-3 py-2 font-semibold ${toneClass(
											toneFromValue(row.mae_improvement),
										)}`}
									>
										{fmtSignedNum(row.mae_improvement)} (
										{fmtSignedRate(row.mae_improvement_pct)})
									</td>
									<td
										className={`px-3 py-2 font-semibold ${toneClass(
											toneFromValue(row.rmse_improvement),
										)}`}
									>
										{fmtSignedNum(row.rmse_improvement)} (
										{fmtSignedRate(row.rmse_improvement_pct)})
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

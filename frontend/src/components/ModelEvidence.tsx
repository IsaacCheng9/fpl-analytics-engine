import type {
	ClubFormValidation,
	DefconProbabilityValidation,
	FormValidation,
} from "../api";
import {
	EVIDENCE_MIN_LIVE_GW,
	EVIDENCE_START_SEASON,
} from "../lib/evidenceSeason";
import { fmtDelta, fmtNum } from "../lib/format";
import { fieldClass, labelClass } from "../styles";
import {
	CalibrationChart,
	isSmallBucket,
	MIN_BUCKET_PREDICTIONS,
} from "./CalibrationChart";
import { InfoTooltip } from "./InfoTooltip";

type Tone = "good" | "bad" | "neutral";

function fmtRate(value: number | null | undefined): string {
	return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

// Persistence sits near zero by design, so reuse fmtDelta to avoid "-0.0%".
function fmtSignedRate(value: number | null | undefined): string {
	return value == null ? "-" : `${fmtDelta(value * 100, 1)}%`;
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
		return "text-emerald-700 dark:text-emerald-400";
	}
	if (tone === "bad") {
		return "text-red-700 dark:text-red-400";
	}
	return "text-zinc-700 dark:text-zinc-200";
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

const FORM_SIGNAL_LABELS: Record<string, string> = {
	projected_xgi: "Projected xGI (Default Sort)",
	projected_xgi_season_minutes: "Projected xGI (Ignoring Recent Minutes)",
	est_xgi90: "Est. xGI Per 90",
	season_xgi90: "Season xGI Per 90",
	window_xgi90: "Window xGI Per 90",
	delta_xgi90: "Delta xGI Per 90",
};

// Explain the two projections, which differ only in how minutes are expected.
const FORM_SIGNAL_TOOLTIPS: Record<string, string> = {
	projected_xgi:
		"Estimated xGI per 90 times projected minutes, which blend recent-window and season-average minutes per gameweek evenly",
	projected_xgi_season_minutes:
		"The same projection with expected minutes taken from the season average alone, ignoring recent playing time. The gap to the default sort shows what recent minutes add",
};

const MINUTES_FORECAST_LABELS: Record<string, string> = {
	season_mpg: "Season Average Only",
	projected_minutes: "Even Blend (Projected Mins)",
	window_mpg: "Recent Window Only",
};

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
		<div className="rounded-md border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
			<div className="font-medium text-xs text-zinc-500 dark:text-zinc-400">
				{label}
			</div>
			<div className={`mt-1 font-semibold text-2xl ${toneClass(tone)}`}>
				{value}
			</div>
			{detail ? (
				<div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
					{detail}
				</div>
			) : null}
		</div>
	);
}

// Explain an empty backtest table rather than leaving bare headers.
function EmptyTableRow({
	columns,
	message,
}: {
	columns: number;
	message: string;
}) {
	return (
		<tr className="border-zinc-100 border-t dark:border-zinc-800">
			<td
				colSpan={columns}
				className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400"
			>
				{message}
			</td>
		</tr>
	);
}

function FormSignalSection({
	validation,
	className,
	isLoading,
}: {
	validation: FormValidation | undefined;
	className: string;
	isLoading: boolean;
}) {
	const formWindow = validation?.window ?? 5;
	const horizon = validation?.horizon ?? 4;
	const topK = validation?.top_k ?? 20;
	const signals = validation?.signals ?? [];
	const forecasts = validation?.minutes_forecast ?? [];
	// The first as-of gameweek scored is the one after the window first fits,
	// and it needs the following horizon of results.
	const firstCompleteGw = formWindow + 1 + horizon;
	const swingInterval =
		validation?.swing_persistence == null
			? "Not enough scored gameweeks yet"
			: validation.swing_persistence_low == null ||
					validation.swing_persistence_high == null
				? "Too few gameweeks for an interval"
				: `95% interval ${fmtSignedRate(validation.swing_persistence_low)} to ${fmtSignedRate(validation.swing_persistence_high)}`;
	const topTooltip = (stat: string) =>
		`Mean ${stat} per player over the next ${horizon} gameweeks among each signal's top ${topK} picks, averaged across as-of gameweeks.`;
	return (
		<section aria-busy={isLoading} className={className}>
			<div className="mb-3">
				<h3 className="font-semibold text-base">Player Form Signals</h3>
				<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
					After each as-of gameweek, every signal ranks the same outfield
					players – those with 450+ season minutes and some minutes in the
					window – then is scored on their xGI over the next {horizon}{" "}
					gameweeks. Persistence is the share of a recent swing above or below
					the season rate that carried into those gameweeks: 100% means it fully
					persisted, 0% means players reverted. The xGI swing counts only
					players with 270+ window minutes and 180+ later minutes, so both sides
					are real rates. The minutes forecasts compare three ways to expect a
					player's minutes per gameweek: the season average, the recent window,
					and the even blend of both that Projected Mins uses.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<MetricCard
					label="Recent xGI Per 90 Swing That Persists"
					value={fmtSignedRate(validation?.swing_persistence)}
					detail={swingInterval}
				/>
				<MetricCard
					label="Recent Minutes Swing That Persists"
					value={fmtSignedRate(validation?.minutes_persistence)}
					detail="Minutes per gameweek, window versus season"
				/>
				<MetricCard
					label="Predictions"
					value={fmtNum(validation?.n_predictions, 0)}
					detail={`${fmtNum(validation?.n_gameweeks, 0)} as-of gameweeks`}
				/>
			</div>
			<div className="mt-4 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
				<table className="w-full min-w-[40rem] border-collapse text-sm">
					<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
						<tr>
							<th className="px-3 py-2 font-medium">Signal</th>
							<th className="px-3 py-2 font-medium">
								<span className="flex items-center gap-1">
									Rank Correlation
									<InfoTooltip
										text={`Mean Spearman correlation between the signal and each player's total xGI over the next ${horizon} gameweeks, computed per as-of gameweek. Higher means the signal orders players better.`}
									/>
								</span>
							</th>
							<th className="px-3 py-2 font-medium">
								<span className="flex items-center gap-1">
									Top {topK} Next-{horizon} xGI
									<InfoTooltip text={topTooltip("xGI")} />
								</span>
							</th>
							<th className="px-3 py-2 font-medium">
								<span className="flex items-center gap-1">
									Top {topK} Next-{horizon} Points
									<InfoTooltip text={topTooltip("points")} />
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{signals.length === 0 ? (
							<EmptyTableRow
								columns={4}
								message={`No gameweeks can be scored yet. Each needs the following ${horizon} gameweeks of results, so results start once GW${firstCompleteGw} is complete.`}
							/>
						) : null}
						{signals.map((row) => (
							<tr
								key={row.signal}
								className="border-zinc-100 border-t dark:border-zinc-800"
							>
								<th className="px-3 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">
									<span className="flex items-center gap-1">
										{FORM_SIGNAL_LABELS[row.signal] ?? row.signal}
										{FORM_SIGNAL_TOOLTIPS[row.signal] ? (
											<InfoTooltip text={FORM_SIGNAL_TOOLTIPS[row.signal]} />
										) : null}
									</span>
								</th>
								<td className="px-3 py-2">
									{fmtNum(row.mean_rank_correlation, 3)}
								</td>
								<td className="px-3 py-2">{fmtNum(row.top_future_xgi, 2)}</td>
								<td className="px-3 py-2">
									{fmtNum(row.top_future_points, 1)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="mt-4 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
				<table className="w-full min-w-[32rem] border-collapse text-sm">
					<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
						<tr>
							<th className="px-3 py-2 font-medium">Minutes Forecast</th>
							<th className="px-3 py-2 font-medium">
								<span className="flex items-center gap-1">
									Mean Absolute Error (Mins Per GW)
									<InfoTooltip
										text={`Average gap between each forecast and a player's actual minutes per gameweek over the next ${horizon} gameweeks, across every scored player, including those who dropped out of the side. Lower is better.`}
									/>
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{forecasts.length === 0 ? (
							<EmptyTableRow
								columns={2}
								message="No gameweeks can be scored yet."
							/>
						) : null}
						{forecasts.map((row) => (
							<tr
								key={row.forecast}
								className="border-zinc-100 border-t dark:border-zinc-800"
							>
								<th className="px-3 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">
									{MINUTES_FORECAST_LABELS[row.forecast] ?? row.forecast}
								</th>
								<td className="px-3 py-2">
									{fmtNum(row.mean_absolute_error, 1)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function ModelEvidence({
	formValidation,
	defconValidation,
	clubValidation,
	season,
	seasons,
	liveSeason,
	isLoadingSeason = false,
	onSeasonChange,
}: {
	formValidation: FormValidation | undefined;
	defconValidation: DefconProbabilityValidation | undefined;
	clubValidation: ClubFormValidation[];
	season: string;
	seasons: string[];
	liveSeason: string;
	isLoadingSeason?: boolean;
	onSeasonChange: (season: string) => void;
}) {
	const clubRows = [...clubValidation].sort((left, right) =>
		targetLabel(left.target).localeCompare(targetLabel(right.target)),
	);
	const calibration = defconValidation?.calibration ?? [];
	const hasSmallBuckets = calibration.some(isSmallBucket);
	// Dim the previous season's results while a newly selected season loads.
	const resultSectionClass = `rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${
		isLoadingSeason ? "opacity-60" : ""
	}`;

	return (
		<div className="space-y-4">
			<section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="font-semibold text-lg">Backtested Evidence</h2>
						<p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
							Historic as-of gameweeks are replayed, then scored against what
							happened next. This keeps the scouting signals accountable to the
							same point-in-time rules used by the transfer tables.
						</p>
					</div>
					<label className={`${labelClass} w-40`}>
						Season
						<select
							className={`mt-1 ${fieldClass}`}
							value={season}
							onChange={(event) => onSeasonChange(event.target.value)}
						>
							{seasons.map((option) => (
								<option key={option} value={option}>
									{option === liveSeason ? `${option} (Live)` : option}
								</option>
							))}
						</select>
					</label>
				</div>
				<p className="mt-2 max-w-3xl text-xs text-zinc-500 dark:text-zinc-400">
					Defaults to the last complete season until the live season reaches GW
					{EVIDENCE_MIN_LIVE_GW} (halfway), because earlier samples are too
					small to judge the models. Evidence starts in {EVIDENCE_START_SEASON},
					when DefCon was introduced.
				</p>
			</section>

			<FormSignalSection
				validation={formValidation}
				className={resultSectionClass}
				isLoading={isLoadingSeason}
			/>

			<section aria-busy={isLoadingSeason} className={resultSectionClass}>
				<div className="mb-3">
					<h3 className="font-semibold text-base">DefCon Probability Model</h3>
					<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
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

				<div
					className={`mt-4 grid items-start gap-4 ${
						calibration.length > 0 ? "xl:grid-cols-2" : ""
					}`}
				>
					{calibration.length > 0 ? (
						<CalibrationChart buckets={calibration} />
					) : null}
					<div>
						<div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
							<table className="w-full min-w-[36rem] border-collapse text-sm">
								<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
									<tr>
										<th className="px-3 py-2 font-medium">
											<span className="flex items-center gap-1">
												Bucket
												<InfoTooltip
													text={`Buckets group predicted probabilities into 10 percentage point bands: 0 = 0% to under 10%, 1 = 10% to under 20%, etc. Mean Predicted is compared with Observed Rate. Buckets with fewer than ${MIN_BUCKET_PREDICTIONS} predictions are greyed out because their observed rate is too noisy to read as calibration error.`}
												/>
											</span>
										</th>
										<th className="px-3 py-2 font-medium">Predictions</th>
										<th className="px-3 py-2 font-medium">Mean Predicted</th>
										<th className="px-3 py-2 font-medium">Observed Rate</th>
										<th className="px-3 py-2 font-medium">Abs Error</th>
									</tr>
								</thead>
								<tbody>
									{defconValidation?.calibration.length === 0 ? (
										<EmptyTableRow
											columns={5}
											message="No predictions can be scored yet. Each needs the following gameweek's results, so the first appear once GW2 is complete."
										/>
									) : null}
									{calibration.map((row) => {
										const isSmall = isSmallBucket(row);
										return (
											<tr
												key={row.bin}
												className={`border-zinc-100 border-t dark:border-zinc-800 ${
													isSmall ? "text-zinc-400 dark:text-zinc-500" : ""
												}`}
											>
												<td className="px-3 py-2">{row.bin}</td>
												<td className="px-3 py-2">
													{fmtNum(row.n, 0)}
													{isSmall ? " (small sample)" : null}
												</td>
												<td className="px-3 py-2">
													{fmtRate(row.mean_predicted)}
												</td>
												<td className="px-3 py-2">
													{fmtRate(row.observed_rate)}
												</td>
												<td className="px-3 py-2">{fmtRate(row.abs_error)}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{hasSmallBuckets ? (
							<p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
								Greyed buckets have fewer than {MIN_BUCKET_PREDICTIONS}{" "}
								predictions, so their error is mostly noise rather than
								miscalibration.
							</p>
						) : null}
					</div>
				</div>
			</section>

			<section aria-busy={isLoadingSeason} className={resultSectionClass}>
				<div className="mb-3">
					<h3 className="font-semibold text-base">Recent Club Form</h3>
					<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
						Season-to-date baselines compared with those baselines plus recent
						club-form context. Historical FDR is excluded because point-in-time
						rating snapshots are unavailable.
					</p>
				</div>
				<div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
					<table className="w-full min-w-[46rem] border-collapse text-sm">
						<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
							{clubRows.length === 0 ? (
								// With the default 5-gameweek window and horizon and 40 training
								// rows, GW11 is the first scorable gameweek, needing results to GW16.
								<EmptyTableRow
									columns={6}
									message="No gameweeks can be scored yet. Each needs the following five gameweeks of results and enough earlier club rows to train on, so results start once GW16 is complete."
								/>
							) : null}
							{clubRows.map((row) => (
								<tr
									key={row.target}
									className="border-zinc-100 border-t dark:border-zinc-800"
								>
									<th className="px-3 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">
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

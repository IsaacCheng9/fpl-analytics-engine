import {
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { DefconCalibrationBin } from "../api";

// A bucket rate from fewer predictions is too noisy to read as calibration
// error: at 50%, 30 predictions already give a 95% interval of +/-18 points.
export const MIN_BUCKET_PREDICTIONS = 30;

export function isSmallBucket(bucket: DefconCalibrationBin): boolean {
	return bucket.n < MIN_BUCKET_PREDICTIONS;
}

function fmtPercentTick(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function CalibrationTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: DefconCalibrationBin }>;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}
	const bucket = payload[0].payload;
	return (
		<div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
			<div className="font-medium text-zinc-900 dark:text-zinc-100">
				Bucket {bucket.bin} ({bucket.n} predictions)
			</div>
			<div className="text-zinc-500 dark:text-zinc-400">
				Predicted {fmtPercentTick(bucket.mean_predicted)} / Observed{" "}
				{fmtPercentTick(bucket.observed_rate)}
			</div>
		</div>
	);
}

export function CalibrationChart({
	buckets,
}: {
	buckets: DefconCalibrationBin[];
}) {
	const reliable = buckets.filter((bucket) => !isSmallBucket(bucket));
	const small = buckets.filter(isSmallBucket);

	return (
		<section aria-label="DefCon Reliability Diagram">
			<div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
				<h4 className="font-medium text-sm text-zinc-700 dark:text-zinc-200">
					Reliability Diagram
				</h4>
				{/* Label the marks outside the plot so data never covers them. */}
				<span className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="w-4 border-zinc-400 border-t border-dashed dark:border-zinc-500"
						/>
						Perfect Calibration
					</span>
					{small.length > 0 ? (
						<span className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600"
							/>
							Fewer Than {MIN_BUCKET_PREDICTIONS} Predictions
						</span>
					) : null}
				</span>
			</div>
			<ResponsiveContainer width="100%" height={280} debounce={50}>
				<ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
					<XAxis
						type="number"
						dataKey="mean_predicted"
						domain={[0, 1]}
						ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
						tickFormatter={fmtPercentTick}
						stroke="var(--chart-axis)"
						tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
						label={{
							value: "Mean Predicted Probability",
							position: "insideBottom",
							offset: -12,
							fontSize: 12,
							fill: "var(--chart-axis)",
						}}
					/>
					<YAxis
						type="number"
						dataKey="observed_rate"
						domain={[0, 1]}
						ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
						tickFormatter={fmtPercentTick}
						stroke="var(--chart-axis)"
						tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
						label={{
							value: "Observed Hit Rate",
							angle: -90,
							position: "insideLeft",
							fontSize: 12,
							fill: "var(--chart-axis)",
						}}
					/>
					<ReferenceLine
						segment={[
							{ x: 0, y: 0 },
							{ x: 1, y: 1 },
						]}
						stroke="var(--chart-ref)"
						strokeDasharray="4 4"
					/>
					<Tooltip
						content={<CalibrationTooltip />}
						cursor={{ stroke: "var(--chart-ref)", strokeDasharray: "3 3" }}
					/>
					<Scatter
						name="Buckets"
						data={reliable}
						fill="var(--chart-scatter)"
						fillOpacity={0.85}
						isAnimationActive={false}
					/>
					<Scatter
						name={`Fewer Than ${MIN_BUCKET_PREDICTIONS} Predictions`}
						data={small}
						fill="var(--chart-small-bucket)"
						isAnimationActive={false}
					/>
				</ScatterChart>
			</ResponsiveContainer>
		</section>
	);
}

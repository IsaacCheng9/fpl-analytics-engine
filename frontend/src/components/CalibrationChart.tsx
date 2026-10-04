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
		<div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm">
			<div className="font-medium text-zinc-900">
				Bucket {bucket.bin} ({bucket.n} predictions)
			</div>
			<div className="text-zinc-500">
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
				<h4 className="font-medium text-sm text-zinc-700">
					Reliability Diagram
				</h4>
				{/* Label the marks outside the plot so data never covers them. */}
				<span className="flex items-center gap-3 text-xs text-zinc-500">
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="w-4 border-zinc-400 border-t border-dashed"
						/>
						Perfect Calibration
					</span>
					{small.length > 0 ? (
						<span className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="size-2 rounded-full bg-zinc-300"
							/>
							Fewer Than {MIN_BUCKET_PREDICTIONS} Predictions
						</span>
					) : null}
				</span>
			</div>
			<ResponsiveContainer width="100%" height={280} debounce={50}>
				<ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
					<XAxis
						type="number"
						dataKey="mean_predicted"
						domain={[0, 1]}
						ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
						tickFormatter={fmtPercentTick}
						tick={{ fontSize: 12 }}
						label={{
							value: "Mean Predicted Probability",
							position: "insideBottom",
							offset: -12,
							fontSize: 12,
						}}
					/>
					<YAxis
						type="number"
						dataKey="observed_rate"
						domain={[0, 1]}
						ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
						tickFormatter={fmtPercentTick}
						tick={{ fontSize: 12 }}
						label={{
							value: "Observed Hit Rate",
							angle: -90,
							position: "insideLeft",
							fontSize: 12,
						}}
					/>
					<ReferenceLine
						segment={[
							{ x: 0, y: 0 },
							{ x: 1, y: 1 },
						]}
						stroke="#a1a1aa"
						strokeDasharray="4 4"
					/>
					<Tooltip
						content={<CalibrationTooltip />}
						cursor={{ strokeDasharray: "3 3" }}
					/>
					<Scatter
						name="Buckets"
						data={reliable}
						fill="#10b981"
						fillOpacity={0.8}
						isAnimationActive={false}
					/>
					<Scatter
						name={`Fewer Than ${MIN_BUCKET_PREDICTIONS} Predictions`}
						data={small}
						fill="#d4d4d8"
						isAnimationActive={false}
					/>
				</ScatterChart>
			</ResponsiveContainer>
		</section>
	);
}

import { useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { PlayerGameweek } from "../api";
import {
	alignCompareTrends,
	type CompareTrendPoint,
} from "../lib/playerTrends";

export const COMPARE_LEFT_COLOR = "#2563eb";
export const COMPARE_RIGHT_COLOR = "#ea580c";

type TrendMetricKey = Exclude<keyof CompareTrendPoint, "round">;

function OverlayTrendChart({
	points,
	leftKey,
	rightKey,
	leftName,
	rightName,
	title,
}: {
	points: CompareTrendPoint[];
	leftKey: TrendMetricKey;
	rightKey: TrendMetricKey;
	leftName: string;
	rightName: string;
	title: string;
}) {
	// Drop rounds where neither player has a value so the X-axis fits real data.
	const chartData = points.filter(
		(point) => point[leftKey] !== null || point[rightKey] !== null,
	);
	const hasLeftData = chartData.some((point) => point[leftKey] !== null);
	const hasRightData = chartData.some((point) => point[rightKey] !== null);

	return (
		<div className="rounded-md border border-zinc-200 bg-white p-3">
			<h3 className="mb-2 font-medium text-sm text-zinc-700">{title}</h3>
			{!hasLeftData && !hasRightData ? (
				<p className="flex h-[180px] items-center justify-center rounded bg-zinc-50 px-3 text-center text-xs text-zinc-500">
					No rolling data available for either player.
				</p>
			) : (
				<ResponsiveContainer width="100%" height={180}>
					<LineChart
						data={chartData}
						margin={{ top: 6, right: 12, bottom: 16, left: -8 }}
					>
						<CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
						{/* A numeric axis keeps blank gameweeks as visible gaps. */}
						<XAxis
							dataKey="round"
							type="number"
							domain={["dataMin", "dataMax"]}
							padding={{ left: 6, right: 6 }}
							allowDecimals={false}
							tick={{ fontSize: 11 }}
							label={{
								value: "Gameweek",
								position: "insideBottom",
								offset: -10,
								fontSize: 11,
							}}
						/>
						<YAxis tick={{ fontSize: 11 }} />
						<Tooltip
							labelFormatter={(round) => `GW ${round}`}
							formatter={(value) =>
								typeof value === "number" ? value.toFixed(2) : value
							}
						/>
						{hasLeftData ? (
							<Line
								type="linear"
								dataKey={leftKey}
								name={leftName}
								stroke={COMPARE_LEFT_COLOR}
								strokeWidth={2}
								dot={{ r: 2.5, fill: COMPARE_LEFT_COLOR }}
								activeDot={{ r: 4 }}
								connectNulls
								isAnimationActive={false}
							/>
						) : null}
						{hasRightData ? (
							<Line
								type="linear"
								dataKey={rightKey}
								name={rightName}
								stroke={COMPARE_RIGHT_COLOR}
								strokeWidth={2}
								dot={{ r: 2.5, fill: COMPARE_RIGHT_COLOR }}
								activeDot={{ r: 4 }}
								connectNulls
								isAnimationActive={false}
							/>
						) : null}
					</LineChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}

export function CompareTrendCharts({
	leftName,
	rightName,
	leftGameweeks,
	rightGameweeks,
}: {
	leftName: string;
	rightName: string;
	leftGameweeks: PlayerGameweek[];
	rightGameweeks: PlayerGameweek[];
}) {
	const points = useMemo(
		() => alignCompareTrends(leftGameweeks, rightGameweeks),
		[leftGameweeks, rightGameweeks],
	);

	return (
		<section aria-label="Rolling Trend Comparison" className="mb-4">
			<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-xs text-zinc-500 uppercase tracking-wide">
					Rolling Trends
				</span>
				<ul
					aria-label="Chart Legend"
					className="flex flex-wrap items-center gap-4 text-xs text-zinc-700"
				>
					<li className="inline-flex items-center gap-1.5 font-medium">
						<span
							aria-hidden="true"
							className="inline-block h-0.5 w-4 rounded-full"
							style={{ backgroundColor: COMPARE_LEFT_COLOR }}
						/>
						{leftName}
					</li>
					<li className="inline-flex items-center gap-1.5 font-medium">
						<span
							aria-hidden="true"
							className="inline-block h-0.5 w-4 rounded-full"
							style={{ backgroundColor: COMPARE_RIGHT_COLOR }}
						/>
						{rightName}
					</li>
				</ul>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<OverlayTrendChart
					points={points}
					leftKey="leftXgi90"
					rightKey="rightXgi90"
					leftName={leftName}
					rightName={rightName}
					title="Rolling xGI Per 90"
				/>
				<OverlayTrendChart
					points={points}
					leftKey="leftDefcon"
					rightKey="rightDefcon"
					leftName={leftName}
					rightName={rightName}
					title="Rolling DefCon (Mean Per Game)"
				/>
			</div>
		</section>
	);
}

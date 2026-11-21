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

export interface ScatterPoint {
	x: number;
	y: number;
	name: string;
}

function ScatterTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: ScatterPoint }>;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}
	const point = payload[0].payload;
	return (
		<div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
			<div className="font-medium text-zinc-900 dark:text-zinc-100">
				{point.name}
			</div>
			<div className="text-zinc-500 dark:text-zinc-400">
				Window {point.y.toFixed(2)} / Season {point.x.toFixed(2)}
			</div>
		</div>
	);
}

export function FormScatterPlot({
	points,
	domainMax,
}: {
	points: ScatterPoint[];
	domainMax: number;
}) {
	return (
		<ResponsiveContainer width="100%" height={320} debounce={50}>
			<ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
				<CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
				<XAxis
					type="number"
					dataKey="x"
					domain={[0, domainMax]}
					stroke="var(--chart-axis)"
					tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
					label={{
						value: "Season xGI/90",
						position: "insideBottom",
						offset: -12,
						fontSize: 12,
						fill: "var(--chart-axis)",
					}}
				/>
				<YAxis
					type="number"
					dataKey="y"
					domain={[0, domainMax]}
					stroke="var(--chart-axis)"
					tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
					label={{
						value: "Window xGI/90",
						angle: -90,
						position: "insideLeft",
						fontSize: 12,
						fill: "var(--chart-axis)",
					}}
				/>
				<ReferenceLine
					segment={[
						{ x: 0, y: 0 },
						{ x: domainMax, y: domainMax },
					]}
					stroke="var(--chart-ref)"
					strokeDasharray="4 4"
				/>
				<Tooltip
					content={<ScatterTooltip />}
					cursor={{ stroke: "var(--chart-ref)", strokeDasharray: "3 3" }}
				/>
				<Scatter
					data={points}
					fill="var(--chart-scatter)"
					fillOpacity={0.75}
					isAnimationActive={false}
				/>
			</ScatterChart>
		</ResponsiveContainer>
	);
}

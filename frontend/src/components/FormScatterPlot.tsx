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
		<div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm">
			<div className="font-medium text-zinc-900">{point.name}</div>
			<div className="text-zinc-500">
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
				<CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
				<XAxis
					type="number"
					dataKey="x"
					domain={[0, domainMax]}
					tick={{ fontSize: 12 }}
					label={{
						value: "Season xGI/90",
						position: "insideBottom",
						offset: -12,
						fontSize: 12,
					}}
				/>
				<YAxis
					type="number"
					dataKey="y"
					domain={[0, domainMax]}
					tick={{ fontSize: 12 }}
					label={{
						value: "Window xGI/90",
						angle: -90,
						position: "insideLeft",
						fontSize: 12,
					}}
				/>
				<ReferenceLine
					segment={[
						{ x: 0, y: 0 },
						{ x: domainMax, y: domainMax },
					]}
					stroke="#a1a1aa"
					strokeDasharray="4 4"
				/>
				<Tooltip
					content={<ScatterTooltip />}
					cursor={{ strokeDasharray: "3 3" }}
				/>
				<Scatter
					data={points}
					fill="#10b981"
					fillOpacity={0.7}
					isAnimationActive={false}
				/>
			</ScatterChart>
		</ResponsiveContainer>
	);
}

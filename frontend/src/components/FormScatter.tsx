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
import type { FormPlayer } from "../api";

interface Point {
	x: number;
	y: number;
	name: string;
}

function ScatterTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: Point }>;
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

export function FormScatter({ players }: { players: FormPlayer[] }) {
	const points: Point[] = players
		.filter((p) => p.season_xgi90 !== null && p.window_xgi90 !== null)
		.map((p) => ({
			x: p.season_xgi90 as number,
			y: p.window_xgi90 as number,
			name: p.web_name,
		}));

	// Keep a stable footprint when empty rather than unmounting; collapsing the
	// chart shifts the page height and can flip the scrollbar, flickering the UI.
	if (points.length === 0) {
		return (
			<div className="mb-4 flex h-[372px] items-center justify-center rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">
				No qualifying players for this window and filter.
			</div>
		);
	}

	const max = Math.max(...points.map((p) => Math.max(p.x, p.y)));
	const domainMax = Math.max(0.2, Math.ceil(max * 10) / 10);

	return (
		<div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
			<h2 className="mb-3 font-medium text-sm text-zinc-700">
				Recent vs season xGI per 90 (points above the line are improving)
			</h2>
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
		</div>
	);
}

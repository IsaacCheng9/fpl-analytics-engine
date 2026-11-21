import { useState } from "react";
import {
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	type ScatterPointItem,
	type ScatterShapeProps,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { fmtNum, fmtPrice } from "../lib/format";

export type ScatterMode = "value" | "role" | "swing";
export type ScatterColourBy = "position" | "squad";

export interface ScatterPoint {
	element: number;
	name: string;
	team: string | null;
	position: string | null;
	price: number;
	projectedXgi: number | null;
	estXgi90: number | null;
	projectedMinutes: number;
	windowXgi90: number | null;
	seasonXgi90: number | null;
	isOwned: boolean;
	isShortlisted: boolean;
	x: number;
	y: number;
}

export interface ScatterSeries {
	key: string;
	label: string;
	colour: string;
	opacity: number;
	points: ScatterPoint[];
}

export interface ScatterReferenceLines {
	x?: number;
	y?: number;
	diagonalMax?: number;
}

export interface FormScatterPlotProps {
	mode: ScatterMode;
	series: ScatterSeries[];
	xDomain: [number, number];
	yDomain: [number, number];
	xTicks?: number[];
	xAxisLabel: string;
	yAxisLabel: string;
	referenceLines: ScatterReferenceLines;
	highlightRing: boolean;
	onPlayerClick?: (element: number) => void;
}

function formatAxisTick(
	mode: ScatterMode,
	axis: "x" | "y",
	value: number,
): string {
	if (axis === "x" && mode === "value") {
		const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
		return `\u00a3${rounded}m`;
	}
	if (axis === "x" && mode === "role") {
		return String(Math.round(value));
	}
	return value.toFixed(2);
}

function tooltipMetrics(
	mode: ScatterMode,
	point: ScatterPoint,
): Array<{ label: string; value: string; primary?: boolean }> {
	const projectedXgi = fmtNum(point.projectedXgi, 2);
	const estXgi90 = fmtNum(point.estXgi90, 2);
	const projectedMins = `${Math.round(point.projectedMinutes)}`;
	const price = fmtPrice(point.price);

	if (mode === "value") {
		return [
			{ label: "Projected xGI", value: projectedXgi, primary: true },
			{ label: "Price", value: price, primary: true },
			{ label: "Est. xGI/90", value: estXgi90 },
			{ label: "Projected Mins", value: projectedMins },
		];
	}
	if (mode === "role") {
		return [
			{ label: "Est. xGI/90", value: estXgi90, primary: true },
			{ label: "Projected Mins", value: projectedMins, primary: true },
			{ label: "Projected xGI", value: projectedXgi },
			{ label: "Price", value: price },
		];
	}
	return [
		{
			label: "Window xGI/90",
			value: fmtNum(point.windowXgi90, 2),
			primary: true,
		},
		{
			label: "Season xGI/90",
			value: fmtNum(point.seasonXgi90, 2),
			primary: true,
		},
		{ label: "Projected xGI", value: projectedXgi },
		{ label: "Est. xGI/90", value: estXgi90 },
		{ label: "Projected Mins", value: projectedMins },
		{ label: "Price", value: price },
	];
}

export function ScatterTooltip({
	active,
	payload,
	mode,
	clickable = false,
}: {
	active?: boolean;
	payload?: Array<{ payload: ScatterPoint }>;
	mode: ScatterMode;
	clickable?: boolean;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}
	const point = payload[0]?.payload;
	if (!point) {
		return null;
	}
	const subtitle = [point.team, point.position, fmtPrice(point.price)]
		.filter(Boolean)
		.join(" / ");
	const metrics = tooltipMetrics(mode, point);

	return (
		<div className="min-w-[180px] rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-semibold text-zinc-900 dark:text-zinc-100">
					{point.name}
				</span>
				{point.isOwned ? (
					<span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-[10px] text-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
						Owned
					</span>
				) : null}
				{point.isShortlisted ? (
					<span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-[10px] text-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
						Shortlisted
					</span>
				) : null}
			</div>
			<div className="mt-0.5 text-zinc-500 dark:text-zinc-400">{subtitle}</div>
			<dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-zinc-100 border-t pt-1.5 dark:border-zinc-800">
				{metrics.map((metric) => (
					<div key={metric.label} className="contents">
						<dt
							className={
								metric.primary
									? "font-medium text-zinc-700 dark:text-zinc-200"
									: "text-zinc-500 dark:text-zinc-400"
							}
						>
							{metric.label}
						</dt>
						<dd
							className={`text-right tabular-nums ${
								metric.primary
									? "font-semibold text-zinc-900 dark:text-zinc-100"
									: "text-zinc-700 dark:text-zinc-300"
							}`}
						>
							{metric.value}
						</dd>
					</div>
				))}
			</dl>
			{clickable ? (
				<div className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
					Click dot to open player details
				</div>
			) : null}
		</div>
	);
}

function renderScatterDot(
	props: ScatterShapeProps & { fill?: string; fillOpacity?: number },
	highlightRing: boolean,
	isActive: boolean,
	isClickable: boolean,
) {
	const { cx, cy, fill, fillOpacity, payload } = props;
	if (
		typeof cx !== "number" ||
		typeof cy !== "number" ||
		!Number.isFinite(cx) ||
		!Number.isFinite(cy)
	) {
		return <g />;
	}
	const point = payload as ScatterPoint | undefined;
	const isHighlighted =
		highlightRing && Boolean(point?.isOwned || point?.isShortlisted);
	const radius = isActive ? 7 : isHighlighted ? 6 : 5;
	const stroke =
		isActive || isHighlighted
			? "var(--chart-tooltip-text)"
			: "var(--chart-tooltip-bg)";
	const strokeWidth = isActive || isHighlighted ? 2 : 1;

	return (
		<circle
			cx={cx}
			cy={cy}
			r={radius}
			fill={fill}
			fillOpacity={isActive || isHighlighted ? 0.95 : (fillOpacity ?? 0.8)}
			stroke={stroke}
			strokeWidth={strokeWidth}
			style={isClickable ? { cursor: "pointer" } : undefined}
		/>
	);
}

export function FormScatterPlot({
	mode,
	series,
	xDomain,
	yDomain,
	xTicks,
	xAxisLabel,
	yAxisLabel,
	referenceLines,
	highlightRing,
	onPlayerClick,
}: FormScatterPlotProps) {
	// Track hovered player explicitly instead of using Recharts activeShape,
	// which activates the same array index across every Scatter series and
	// portals the hovered node out of its DOM parent before a click completes.
	const [hoveredElement, setHoveredElement] = useState<number | null>(null);
	const isClickable = Boolean(onPlayerClick);

	function extractPoint(item: ScatterPointItem): ScatterPoint | undefined {
		const point = (item?.payload ?? item) as ScatterPoint | undefined;
		return point && typeof point.element === "number" ? point : undefined;
	}

	function handlePointClick(item: ScatterPointItem) {
		if (!onPlayerClick) {
			return;
		}
		const point = extractPoint(item);
		if (point) {
			setHoveredElement(null);
			onPlayerClick(point.element);
		}
	}

	return (
		<ResponsiveContainer width="100%" height={340} debounce={50}>
			<ScatterChart margin={{ top: 12, right: 20, bottom: 28, left: 16 }}>
				<CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
				<XAxis
					type="number"
					dataKey="x"
					domain={xDomain}
					ticks={xTicks}
					stroke="var(--chart-axis)"
					tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
					tickFormatter={(value: number) => formatAxisTick(mode, "x", value)}
					label={{
						value: xAxisLabel,
						position: "insideBottom",
						offset: -16,
						style: {
							textAnchor: "middle",
							fontSize: 12,
							fill: "var(--chart-axis)",
						},
					}}
				/>
				<YAxis
					type="number"
					dataKey="y"
					domain={yDomain}
					width={52}
					stroke="var(--chart-axis)"
					tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
					tickFormatter={(value: number) => formatAxisTick(mode, "y", value)}
					label={{
						value: yAxisLabel,
						angle: -90,
						position: "insideLeft",
						offset: -4,
						style: {
							textAnchor: "middle",
							fontSize: 12,
							fill: "var(--chart-axis)",
						},
					}}
				/>
				{referenceLines.diagonalMax !== undefined ? (
					<ReferenceLine
						segment={[
							{ x: 0, y: 0 },
							{ x: referenceLines.diagonalMax, y: referenceLines.diagonalMax },
						]}
						stroke="var(--chart-ref)"
						strokeDasharray="4 4"
					/>
				) : null}
				{referenceLines.x !== undefined ? (
					<ReferenceLine
						x={referenceLines.x}
						stroke="var(--chart-ref)"
						strokeDasharray="4 4"
					/>
				) : null}
				{referenceLines.y !== undefined ? (
					<ReferenceLine
						y={referenceLines.y}
						stroke="var(--chart-ref)"
						strokeDasharray="4 4"
					/>
				) : null}
				<Tooltip
					content={<ScatterTooltip mode={mode} clickable={isClickable} />}
					cursor={{ stroke: "var(--chart-ref)", strokeDasharray: "3 3" }}
					wrapperStyle={{ pointerEvents: "none" }}
				/>
				{series.map((group) => (
					<Scatter
						key={group.key}
						name={group.label}
						data={group.points}
						fill={group.colour}
						fillOpacity={group.opacity}
						cursor={isClickable ? "pointer" : undefined}
						isAnimationActive={false}
						onClick={handlePointClick}
						onMouseEnter={(item: ScatterPointItem) => {
							const point = extractPoint(item);
							setHoveredElement(point ? point.element : null);
						}}
						onMouseLeave={(item: ScatterPointItem) => {
							const point = extractPoint(item);
							setHoveredElement((current) =>
								!point || current === point.element ? null : current,
							);
						}}
						shape={(props: ScatterShapeProps) => {
							const point = props.payload as ScatterPoint | undefined;
							const isHovered =
								point !== undefined && point.element === hoveredElement;
							return renderScatterDot(
								{ ...props, fill: group.colour, fillOpacity: group.opacity },
								highlightRing,
								isHovered,
								isClickable,
							);
						}}
					/>
				))}
			</ScatterChart>
		</ResponsiveContainer>
	);
}

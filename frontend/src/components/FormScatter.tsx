import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { FormPlayer } from "../api";
import { fmtNum, fmtPrice } from "../lib/format";
import type {
	ScatterColourBy,
	ScatterMode,
	ScatterPoint,
	ScatterReferenceLines,
	ScatterSeries,
} from "./FormScatterPlot";

const FormScatterPlot = lazy(() =>
	import("./FormScatterPlot").then((module) => ({
		default: module.FormScatterPlot,
	})),
);

const COLLAPSED_STORAGE_KEY = "fpl-form-scatter-collapsed";
const MODE_STORAGE_KEY = "fpl-form-scatter-mode";
const CHART_BODY_ID = "form-scatter-chart";
const EMPTY_OWNED_ELEMENTS: ReadonlySet<number> = new Set();
const EMPTY_SHORTLIST: readonly number[] = [];

const MODE_OPTIONS: Array<{
	value: ScatterMode;
	label: string;
	subtitle: string;
	xAxisLabel: string;
	yAxisLabel: string;
}> = [
	{
		value: "value",
		label: "Projected xGI vs Price",
		subtitle:
			"Top-left highlights cheaper players with higher projected threat.",
		xAxisLabel: "Price (\u00a3m)",
		yAxisLabel: "Projected xGI",
	},
	{
		value: "role",
		label: "Est. xGI/90 vs Projected Minutes",
		subtitle:
			"Separates nailed starters (60+ mins) from high-rate rotation risks.",
		xAxisLabel: "Projected Minutes",
		yAxisLabel: "Est. xGI/90",
	},
	{
		value: "swing",
		label: "Recent vs Season xGI/90",
		subtitle:
			"Points above the diagonal are running hotter than their season baseline.",
		xAxisLabel: "Season xGI/90",
		yAxisLabel: "Window xGI/90",
	},
];

const POSITION_STYLES: Array<{ key: string; label: string; colour: string }> = [
	{ key: "GK", label: "GK", colour: "#d97706" },
	{ key: "DEF", label: "DEF", colour: "#0284c7" },
	{ key: "MID", label: "MID", colour: "#10b981" },
	{ key: "FWD", label: "FWD", colour: "#e11d48" },
];
const OTHER_POSITION_STYLE = {
	key: "OTHER",
	label: "Other",
	colour: "#71717a",
};

const SQUAD_STYLES = {
	other: { key: "other", label: "Other", colour: "#a1a1aa", opacity: 0.4 },
	owned: { key: "owned", label: "Owned", colour: "#0284c7", opacity: 0.9 },
	shortlisted: {
		key: "shortlisted",
		label: "Shortlisted",
		colour: "#d97706",
		opacity: 0.9,
	},
	both: {
		key: "both",
		label: "Owned & Shortlisted",
		colour: "#0d9488",
		opacity: 0.95,
	},
} as const;

function isScatterMode(value: string | null): value is ScatterMode {
	return value === "value" || value === "role" || value === "swing";
}

// Start collapsed so the table is visible on the first screen; only an explicit
// choice to show the chart keeps it open across visits.
function readStoredCollapsedPreference(): boolean {
	if (typeof window === "undefined") {
		return true;
	}
	try {
		return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

function writeStoredCollapsedPreference(isCollapsed: boolean) {
	try {
		window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed));
	} catch {
		// Ignore blocked storage; the button should still work for this session.
	}
}

function readStoredModePreference(): ScatterMode {
	if (typeof window === "undefined") {
		return "value";
	}
	try {
		const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
		return isScatterMode(stored) ? stored : "value";
	} catch {
		return "value";
	}
}

function writeStoredModePreference(mode: ScatterMode) {
	try {
		window.localStorage.setItem(MODE_STORAGE_KEY, mode);
	} catch {
		// Ignore blocked storage; mode switching should still work for this session.
	}
}

function computeMedian(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[mid];
	}
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeUpperDomain(values: number[]): number {
	const max = Math.max(...values);
	if (max <= 0) {
		return 0.2;
	}
	return Math.max(0.2, Math.ceil(max * 1.05 * 10) / 10);
}

function buildScatterPoints(
	players: FormPlayer[],
	mode: ScatterMode,
	ownedElements: ReadonlySet<number>,
	shortlistSet: ReadonlySet<number>,
): ScatterPoint[] {
	const points: ScatterPoint[] = [];
	for (const player of players) {
		let x: number | null = null;
		let y: number | null = null;
		if (mode === "value") {
			x = player.price;
			y = player.projected_xgi;
		} else if (mode === "role") {
			x = player.projected_minutes;
			y = player.est_xgi90;
		} else {
			x = player.season_xgi90;
			y = player.window_xgi90;
		}
		if (
			x === null ||
			y === null ||
			!Number.isFinite(x) ||
			!Number.isFinite(y)
		) {
			continue;
		}
		points.push({
			element: player.element,
			name: player.web_name,
			team: player.team_name,
			position: player.position,
			price: player.price,
			projectedXgi: player.projected_xgi,
			estXgi90: player.est_xgi90,
			projectedMinutes: player.projected_minutes,
			windowXgi90: player.window_xgi90,
			seasonXgi90: player.season_xgi90,
			isOwned: ownedElements.has(player.element),
			isShortlisted: shortlistSet.has(player.element),
			x,
			y,
		});
	}
	return points;
}

function buildSeries(
	points: ScatterPoint[],
	colourBy: ScatterColourBy,
): { series: ScatterSeries[]; legendItems: ScatterSeries[] } {
	if (colourBy === "squad") {
		const buckets: Record<keyof typeof SQUAD_STYLES, ScatterPoint[]> = {
			other: [],
			owned: [],
			shortlisted: [],
			both: [],
		};
		for (const point of points) {
			if (point.isOwned && point.isShortlisted) {
				buckets.both.push(point);
			} else if (point.isOwned) {
				buckets.owned.push(point);
			} else if (point.isShortlisted) {
				buckets.shortlisted.push(point);
			} else {
				buckets.other.push(point);
			}
		}
		// Render muted dots first so highlighted players paint on top.
		const paintOrder: Array<keyof typeof SQUAD_STYLES> = [
			"other",
			"owned",
			"shortlisted",
			"both",
		];
		const legendOrder: Array<keyof typeof SQUAD_STYLES> = [
			"owned",
			"shortlisted",
			"both",
			"other",
		];
		const toSeries = (order: Array<keyof typeof SQUAD_STYLES>) =>
			order
				.filter((key) => buckets[key].length > 0)
				.map((key) => ({
					...SQUAD_STYLES[key],
					points: buckets[key],
				}));
		return {
			series: toSeries(paintOrder),
			legendItems: toSeries(legendOrder),
		};
	}

	const knownKeys = new Set(POSITION_STYLES.map((style) => style.key));
	const buckets = new Map<string, ScatterPoint[]>();
	for (const point of points) {
		const key =
			point.position && knownKeys.has(point.position)
				? point.position
				: OTHER_POSITION_STYLE.key;
		const existing = buckets.get(key);
		if (existing) {
			existing.push(point);
		} else {
			buckets.set(key, [point]);
		}
	}

	const allStyles = [...POSITION_STYLES, OTHER_POSITION_STYLE];
	const series: ScatterSeries[] = [];
	for (const style of allStyles) {
		const groupPoints = buckets.get(style.key);
		if (!groupPoints || groupPoints.length === 0) {
			continue;
		}
		// Paint highlighted dots after regular dots within each position group.
		const ordered = [...groupPoints].sort(
			(a, b) =>
				Number(a.isOwned || a.isShortlisted) -
				Number(b.isOwned || b.isShortlisted),
		);
		series.push({
			key: style.key,
			label: style.label,
			colour: style.colour,
			opacity: 0.8,
			points: ordered,
		});
	}
	return { series, legendItems: series };
}

function computePriceAxis(values: number[]): {
	xDomain: [number, number];
	xTicks: number[];
} {
	const rawMin = Math.min(...values);
	const rawMax = Math.max(...values);
	const span = rawMax - rawMin;
	const xMin =
		span === 0
			? Math.max(0, Math.floor((rawMin - 1) * 2) / 2)
			: Math.max(0, Math.floor(rawMin - 0.5));
	const xMax =
		span === 0 ? Math.ceil((rawMax + 1) * 2) / 2 : Math.ceil(rawMax + 0.5);
	const step = xMax - xMin > 8 ? 2 : xMax - xMin > 3 ? 1 : 0.5;
	const firstTick = Math.ceil(xMin / step) * step;
	const xTicks: number[] = [];
	for (let tick = firstTick; tick <= xMax + 1e-9; tick += step) {
		xTicks.push(Math.round(tick * 10) / 10);
	}
	return { xDomain: [xMin, xMax], xTicks };
}

function computePlotGeometry(
	points: ScatterPoint[],
	mode: ScatterMode,
): {
	xDomain: [number, number];
	yDomain: [number, number];
	xTicks?: number[];
	referenceLines: ScatterReferenceLines;
	referenceLabel: string | null;
} {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const hasMedian = points.length >= 2;

	if (mode === "value") {
		const { xDomain, xTicks } = computePriceAxis(xs);
		const yMax = computeUpperDomain(ys);
		if (!hasMedian) {
			return {
				xDomain,
				yDomain: [0, yMax],
				xTicks,
				referenceLines: {},
				referenceLabel: null,
			};
		}
		const medianX = computeMedian(xs);
		const medianY = computeMedian(ys);
		return {
			xDomain,
			yDomain: [0, yMax],
			xTicks,
			referenceLines: { x: medianX, y: medianY },
			referenceLabel: `Median (${fmtPrice(medianX)}, ${fmtNum(medianY, 2)})`,
		};
	}

	if (mode === "role") {
		const maxMinutes = Math.max(...xs);
		const xMax = Math.max(90, Math.ceil(maxMinutes / 15) * 15);
		const xTicks = xMax === 90 ? [0, 15, 30, 45, 60, 75, 90] : undefined;
		const yMax = computeUpperDomain(ys);
		if (!hasMedian) {
			return {
				xDomain: [0, xMax],
				yDomain: [0, yMax],
				xTicks,
				referenceLines: { x: 60 },
				referenceLabel: "60 Mins",
			};
		}
		const medianY = computeMedian(ys);
		return {
			xDomain: [0, xMax],
			yDomain: [0, yMax],
			xTicks,
			referenceLines: { x: 60, y: medianY },
			referenceLabel: `60 Mins & Median (${fmtNum(medianY, 2)})`,
		};
	}

	const max = Math.max(...points.map((p) => Math.max(p.x, p.y)));
	const domainMax =
		max <= 0 ? 0.2 : Math.max(0.2, Math.ceil(max * 1.05 * 10) / 10);
	return {
		xDomain: [0, domainMax],
		yDomain: [0, domainMax],
		referenceLines: { diagonalMax: domainMax },
		referenceLabel: "Equal Rate (y = x)",
	};
}

export function FormScatter({
	players,
	onPlayerClick,
	ownedElements = EMPTY_OWNED_ELEMENTS,
	shortlist = EMPTY_SHORTLIST,
}: {
	players: FormPlayer[];
	onPlayerClick?: (element: number) => void;
	ownedElements?: ReadonlySet<number>;
	shortlist?: readonly number[];
}) {
	const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsedPreference);
	const [mode, setMode] = useState<ScatterMode>(readStoredModePreference);
	const [colourBy, setColourBy] = useState<ScatterColourBy>("position");

	const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);
	const hasSquadContext = ownedElements.size > 0 || shortlist.length > 0;
	const effectiveColourBy: ScatterColourBy = hasSquadContext
		? colourBy
		: "position";

	const modeConfig =
		MODE_OPTIONS.find((option) => option.value === mode) ?? MODE_OPTIONS[0];

	const points = useMemo(
		() => buildScatterPoints(players, mode, ownedElements, shortlistSet),
		[players, mode, ownedElements, shortlistSet],
	);

	const { series, legendItems } = useMemo(
		() => buildSeries(points, effectiveColourBy),
		[points, effectiveColourBy],
	);

	const hasHighlightedPlottedPoint = useMemo(
		() => points.some((point) => point.isOwned || point.isShortlisted),
		[points],
	);

	const geometry = useMemo(
		() => (points.length > 0 ? computePlotGeometry(points, mode) : null),
		[points, mode],
	);

	useEffect(() => {
		writeStoredCollapsedPreference(isCollapsed);
	}, [isCollapsed]);

	useEffect(() => {
		writeStoredModePreference(mode);
	}, [mode]);

	const header = (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2
					id="form-scatter-title"
					className="font-medium text-sm text-zinc-700 dark:text-zinc-200"
				>
					{modeConfig.label}
				</h2>
				{!isCollapsed ? (
					<p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
						{onPlayerClick
							? `${modeConfig.subtitle} Click any dot for details.`
							: modeConfig.subtitle}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{!isCollapsed ? (
					<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
						<legend className="sr-only">Chart Mode</legend>
						{MODE_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								aria-pressed={mode === option.value}
								className={`rounded px-2.5 py-1 font-medium text-xs ${
									mode === option.value
										? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
										: "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
								}`}
								onClick={() => setMode(option.value)}
							>
								{option.label}
							</button>
						))}
					</fieldset>
				) : null}
				<button
					type="button"
					aria-controls={CHART_BODY_ID}
					aria-expanded={!isCollapsed}
					className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-xs text-zinc-700 hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
					onClick={() => setIsCollapsed((current) => !current)}
				>
					{isCollapsed ? "Show Chart" : "Hide Chart"}
				</button>
			</div>
		</div>
	);

	if (isCollapsed) {
		return (
			<section
				aria-labelledby="form-scatter-title"
				className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
			>
				{header}
			</section>
		);
	}

	// Keep a stable footprint when empty rather than unmounting; collapsing is
	// the only intentional way to reclaim this vertical space.
	if (points.length === 0 || geometry === null) {
		return (
			<section
				aria-labelledby="form-scatter-title"
				className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
			>
				{header}
				<section
					id={CHART_BODY_ID}
					aria-label="Attacking Form Scatter Chart"
					className="mt-3 flex h-[340px] items-center justify-center text-sm text-zinc-400 dark:text-zinc-500"
				>
					No qualifying players for this mode and filter.
				</section>
			</section>
		);
	}

	return (
		<section
			aria-labelledby="form-scatter-title"
			className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
		>
			{header}
			<section
				id={CHART_BODY_ID}
				aria-label="Attacking Form Scatter Chart"
				className="mt-3"
			>
				<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
						{legendItems.map((item) => (
							<span key={item.key} className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-2.5 rounded-full"
									style={{
										backgroundColor: item.colour,
										opacity: item.opacity,
									}}
								/>
								{item.label}
							</span>
						))}
						{effectiveColourBy === "position" && hasHighlightedPlottedPoint ? (
							<span className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-2.5 rounded-full border-2 border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-900"
								/>
								In Squad / Shortlist
							</span>
						) : null}
						{geometry.referenceLabel ? (
							<span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
								<span
									aria-hidden="true"
									className="w-4 border-zinc-400 border-t border-dashed dark:border-zinc-500"
								/>
								{geometry.referenceLabel}
							</span>
						) : null}
					</div>
					{hasSquadContext ? (
						<fieldset className="inline-flex min-w-0 items-center rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
							<legend className="sr-only">Colour By</legend>
							{(
								[
									["position", "Position"],
									["squad", "Squad / Shortlist"],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									type="button"
									aria-pressed={effectiveColourBy === value}
									className={`rounded px-2 py-0.5 font-medium text-xs ${
										effectiveColourBy === value
											? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
											: "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
									}`}
									onClick={() => setColourBy(value)}
								>
									{label}
								</button>
							))}
						</fieldset>
					) : null}
				</div>
				<Suspense
					fallback={
						<div className="flex h-[340px] items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
							Loading chart...
						</div>
					}
				>
					<FormScatterPlot
						mode={mode}
						series={series}
						xDomain={geometry.xDomain}
						yDomain={geometry.yDomain}
						xTicks={geometry.xTicks}
						xAxisLabel={modeConfig.xAxisLabel}
						yAxisLabel={modeConfig.yAxisLabel}
						referenceLines={geometry.referenceLines}
						highlightRing={effectiveColourBy === "position" && hasSquadContext}
						onPlayerClick={onPlayerClick}
					/>
				</Suspense>
			</section>
		</section>
	);
}

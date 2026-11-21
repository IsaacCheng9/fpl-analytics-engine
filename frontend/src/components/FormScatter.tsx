import { lazy, Suspense, useEffect, useState } from "react";
import type { FormPlayer } from "../api";
import type { ScatterPoint } from "./FormScatterPlot";

const FormScatterPlot = lazy(() =>
	import("./FormScatterPlot").then((module) => ({
		default: module.FormScatterPlot,
	})),
);

const CHART_TITLE =
	"Recent Vs Season xGI Per 90 (Points Above the Line Are Running Hot)";
const COLLAPSED_STORAGE_KEY = "fpl-form-scatter-collapsed";
const CHART_BODY_ID = "form-scatter-chart";

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

export function FormScatter({ players }: { players: FormPlayer[] }) {
	const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsedPreference);
	const points: ScatterPoint[] = players
		.filter((p) => p.season_xgi90 !== null && p.window_xgi90 !== null)
		.map((p) => ({
			x: p.season_xgi90 as number,
			y: p.window_xgi90 as number,
			name: p.web_name,
		}));

	useEffect(() => {
		writeStoredCollapsedPreference(isCollapsed);
	}, [isCollapsed]);

	const header = (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<h2 id="form-scatter-title" className="font-medium text-sm text-zinc-700">
				{CHART_TITLE}
			</h2>
			<button
				type="button"
				aria-controls={CHART_BODY_ID}
				aria-expanded={!isCollapsed}
				className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-xs text-zinc-700 hover:border-zinc-300 hover:bg-white"
				onClick={() => setIsCollapsed((current) => !current)}
			>
				{isCollapsed ? "Show Chart" : "Hide Chart"}
			</button>
		</div>
	);

	if (isCollapsed) {
		return (
			<section
				aria-labelledby="form-scatter-title"
				className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3"
			>
				{header}
			</section>
		);
	}

	// Keep a stable footprint when empty rather than unmounting; collapsing is
	// the only intentional way to reclaim this vertical space.
	if (points.length === 0) {
		return (
			<section
				aria-labelledby="form-scatter-title"
				className="mb-4 rounded-lg border border-zinc-200 bg-white p-4"
			>
				{header}
				<section
					id={CHART_BODY_ID}
					aria-label="Attacking Form Scatter Chart"
					className="mt-3 flex h-[320px] items-center justify-center text-sm text-zinc-400"
				>
					No qualifying players for this window and filter.
				</section>
			</section>
		);
	}

	const max = Math.max(...points.map((p) => Math.max(p.x, p.y)));
	const domainMax = Math.max(0.2, Math.ceil(max * 10) / 10);

	return (
		<section
			aria-labelledby="form-scatter-title"
			className="mb-4 rounded-lg border border-zinc-200 bg-white p-4"
		>
			{header}
			<section
				id={CHART_BODY_ID}
				aria-label="Attacking Form Scatter Chart"
				className="mt-3"
			>
				<Suspense
					fallback={
						<div className="flex h-[320px] items-center justify-center text-sm text-zinc-400">
							Loading chart...
						</div>
					}
				>
					<FormScatterPlot points={points} domainMax={domainMax} />
				</Suspense>
			</section>
		</section>
	);
}

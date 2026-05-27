import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
	type DefconPlayer,
	type DefconProbabilityPlayer,
	type FormPlayer,
	fetchDefcon,
	fetchDefconProbability,
	fetchForm,
	fetchMeta,
	type Position,
} from "./api";
import { DataTable } from "./components/DataTable";
import { FormScatter } from "./components/FormScatter";
import { InfoTooltip } from "./components/InfoTooltip";
import { PlayerPanel } from "./components/PlayerPanel";
import { fmtDelta, fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "./lib/format";

type Tab = "form" | "defcon" | "defconProb";
type AttackingMetric = "xg" | "xa" | "xgi";
type AttackingMetricVisibility = Record<AttackingMetric, boolean>;
type AttackingMetricColumn = "window" | "season" | "delta" | "value";

const TAB_LABELS: Record<Tab, string> = {
	form: "Attacking Form",
	defcon: "DefCon Form",
	defconProb: "DefCon Probability",
};
const TABS: Tab[] = ["form", "defcon", "defconProb"];
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const WINDOW_MIN = 2;
const WINDOW_MAX = 20;
const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];
const ATTACKING_METRICS: AttackingMetric[] = ["xgi", "xg", "xa"];
const ATTACKING_METRIC_COLUMN_ORDER: AttackingMetric[] = ["xgi", "xg", "xa"];
const ATTACKING_METRIC_GROUP_LABELS: Record<AttackingMetricColumn, string> = {
	window: "Window",
	season: "Season",
	delta: "Delta",
	value: "",
};
const ATTACKING_METRIC_LABELS: Record<AttackingMetric, string> = {
	xg: "xG",
	xa: "xA",
	xgi: "xGI",
};
const ATTACKING_METRIC_KEYS: Record<
	AttackingMetric,
	Record<AttackingMetricColumn, keyof FormPlayer & string>
> = {
	xg: {
		window: "window_xg90",
		season: "season_xg90",
		delta: "delta_xg90",
		value: "window_xg90_per_million",
	},
	xa: {
		window: "window_xa90",
		season: "season_xa90",
		delta: "delta_xa90",
		value: "window_xa90_per_million",
	},
	xgi: {
		window: "window_xgi90",
		season: "season_xgi90",
		delta: "delta_xgi90",
		value: "window_xgi90_per_million",
	},
};
const ATTACKING_METRIC_NOUNS: Record<AttackingMetric, string> = {
	xg: "goals",
	xa: "assists",
	xgi: "goal involvements",
};
const ATTACKING_METRIC_STYLES: Record<AttackingMetric, { header: string }> = {
	xg: {
		header: "bg-emerald-100/80",
	},
	xa: {
		header: "bg-amber-100/80",
	},
	xgi: {
		header: "bg-indigo-100/80",
	},
};
const DEFAULT_ATTACKING_METRICS: AttackingMetricVisibility = {
	xg: true,
	xa: false,
	xgi: true,
};

// Apply the client-side player and team filters so the chart and table stay
// in sync from a single source.
function filterPlayers<
	T extends { web_name: string; team_name: string | null },
>(rows: T[], playerSearch: string, teamFilter: string): T[] {
	const query = playerSearch.trim().toLowerCase();
	return rows.filter(
		(row) =>
			(query === "" || row.web_name.toLowerCase().includes(query)) &&
			(teamFilter === "" || row.team_name === teamFilter),
	);
}

type Range = { min: number; max: number };

// Metric columns that get heat shading. The range is computed league-wide from
// an unfiltered query so a player's colour stays fixed as you filter.
const FORM_HEAT_KEYS = [
	"window_xg90",
	"window_xa90",
	"window_xgi90",
	"season_xg90",
	"season_xa90",
	"season_xgi90",
	"delta_xg90",
	"delta_xa90",
	"delta_xgi90",
	"window_xg90_per_million",
	"window_xa90_per_million",
	"window_xgi90_per_million",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
];
const DEFCON_HEAT_KEYS = [
	"window_defcon_hit_rate",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
];
const DEFCON_PROB_HEAT_KEYS = [
	"raw_rate",
	"prob",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
];

// Min/max per metric across the supplied (league-wide) rows.
function computeRanges(
	rows: readonly unknown[],
	keys: string[],
): Record<string, Range> {
	const ranges: Record<string, Range> = {};
	for (const key of keys) {
		const values = rows
			.map((row) => (row as Record<string, unknown>)[key])
			.filter((value): value is number => typeof value === "number");
		ranges[key] =
			values.length > 0
				? { min: Math.min(...values), max: Math.max(...values) }
				: { min: 0, max: 0 };
	}
	return ranges;
}

// Shade a cell red (worst) to green (best) by its position in the league-wide
// range, so relative standing is readable at a glance.
function HeatCell({
	value,
	range,
	lowerIsBetter,
	text,
}: {
	value: number | null | undefined;
	range: Range;
	lowerIsBetter: boolean;
	text: string;
}) {
	if (value == null) {
		return <span className="text-zinc-400">-</span>;
	}
	const { min, max } = range;
	const t = max > min ? (value - min) / (max - min) : 0.5;
	const score = lowerIsBetter ? 1 - t : t;
	const hue = score * 120; // 0 = red (worst), 120 = green (best).
	return (
		<span
			className="-mx-3 -my-2 block px-3 py-2"
			style={{ backgroundColor: `hsl(${hue}, 68%, 80%)` }}
		>
			{text}
		</span>
	);
}

// Build a heat-shaded cell renderer scaled against a fixed league-wide range.
function heatCell<T>(
	range: Range,
	opts: {
		lowerIsBetter?: boolean;
		format?: (value: number | null) => string;
	} = {},
) {
	const format = opts.format ?? ((value: number | null) => fmtNum(value));
	const lowerIsBetter = opts.lowerIsBetter ?? false;
	return (info: CellContext<T, unknown>) => {
		const value = info.getValue<number | null>();
		return (
			<HeatCell
				value={value}
				range={range}
				lowerIsBetter={lowerIsBetter}
				text={format(value)}
			/>
		);
	};
}

function buildFormMetricColumns(
	ranges: Record<string, Range>,
	metric: AttackingMetric,
): ColumnDef<FormPlayer>[] {
	const label = ATTACKING_METRIC_LABELS[metric];
	const noun = ATTACKING_METRIC_NOUNS[metric];
	const styles = ATTACKING_METRIC_STYLES[metric];
	return (
		["window", "season", "delta", "value"] satisfies AttackingMetricColumn[]
	).map((group) => {
		const groupLabel = ATTACKING_METRIC_GROUP_LABELS[group];
		const key = ATTACKING_METRIC_KEYS[metric][group];
		const formatter = group === "delta" ? { format: fmtDelta } : {};
		const tooltip =
			group === "window"
				? `Expected ${noun} per 90 minutes over the recent window`
				: group === "season"
					? `Expected ${noun} per 90 minutes, season to date`
					: group === "delta"
						? `Window ${label} per 90 minus season ${label} per 90; positive means recent form beats the season baseline`
						: `Window ${label} per 90 divided by price`;
		const header =
			group === "value"
				? `${label} per 90 per £m`
				: `${groupLabel} ${label} per 90`;
		return {
			accessorKey: key,
			header,
			cell: heatCell<FormPlayer>(ranges[key], formatter),
			meta: {
				tooltip,
				headerClassName: styles.header,
			},
		} satisfies ColumnDef<FormPlayer>;
	});
}

function buildFormColumns(
	ranges: Record<string, Range>,
	visibleMetrics: AttackingMetricVisibility,
): ColumnDef<FormPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins per App",
			cell: heatCell<FormPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<FormPlayer>(ranges.window_start_rate, { format: fmtPct }),
			meta: { tooltip: "Share of window games the player started" },
		},
		...ATTACKING_METRIC_COLUMN_ORDER.filter(
			(metric) => visibleMetrics[metric],
		).flatMap((metric) => buildFormMetricColumns(ranges, metric)),
		{
			accessorKey: "season_points_per_million",
			header: "Points per £m",
			cell: heatCell<FormPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<FormPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
		},
	];
}

function buildDefconColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins per App",
			cell: heatCell<DefconPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of window games the player started" },
		},
		{
			accessorKey: "window_games",
			header: "Games",
			meta: { tooltip: "Eligible games in the window" },
		},
		{
			accessorKey: "window_defcon_hits",
			header: "Hits",
			meta: { tooltip: "Window games clearing the DefCon threshold" },
		},
		{
			accessorKey: "window_defcon_hit_rate",
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hit_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of window games clearing the DefCon threshold" },
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points per £m",
			cell: heatCell<DefconPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
		},
	];
}

function buildDefconProbColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconProbabilityPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
		},
		{
			accessorKey: "window_minutes",
			header: "Mins",
			meta: { tooltip: "Total minutes played across the recent window" },
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins per App",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.window_mins_per_appearance,
				{ format: (v) => fmtNum(v, 0) },
			),
			meta: {
				tooltip:
					"Average minutes per appearance in the recent window; 0-minute games are excluded",
			},
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Share of recent window games the player started" },
		},
		{
			accessorKey: "games",
			header: "Games",
			meta: { tooltip: "Eligible appearances up to this gameweek" },
		},
		{
			accessorKey: "hits",
			header: "Hits",
			meta: { tooltip: "Appearances clearing the DefCon threshold" },
		},
		{
			accessorKey: "raw_rate",
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>(ranges.raw_rate, {
				format: fmtPct,
			}),
			meta: { tooltip: "Observed DefCon hit rate (hits / games)" },
		},
		{
			accessorKey: "prob",
			header: "P(Hit Next GW)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob, { format: fmtPct }),
			meta: {
				tooltip:
					"Modelled probability of clearing the DefCon threshold next gameweek",
			},
		},
		{
			accessorKey: "prob_std",
			header: "+/-",
			cell: (info) => fmtNum(info.getValue<number | null>()),
			meta: { tooltip: "Uncertainty (standard deviation) of the probability" },
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points per £m",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.season_points_per_million,
				{ format: (v) => fmtNum(v, 1) },
			),
			meta: { tooltip: "Total season points divided by price" },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: {
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			},
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
			},
		},
	];
}

const labelClass = "flex flex-col text-xs font-medium text-zinc-600";
const inputClass =
	"mt-1 rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900";

export default function App() {
	const [tab, setTab] = useState<Tab>("form");
	const [playerSearch, setPlayerSearch] = useState("");
	const [teamFilter, setTeamFilter] = useState("");
	const [windowSize, setWindowSize] = useState(5);
	const [position, setPosition] = useState<Position | "">("");
	const [minMinutes, setMinMinutes] = useState(180);
	const [minDelta, setMinDelta] = useState(0);
	const [minHitRate, setMinHitRate] = useState(0);
	const [minGames, setMinGames] = useState(5);
	const [asOfGw, setAsOfGw] = useState<number | null>(null);
	const [selectedElement, setSelectedElement] = useState<number | null>(null);
	const [attackingMetrics, setAttackingMetrics] =
		useState<AttackingMetricVisibility>(DEFAULT_ATTACKING_METRICS);

	function toggleAttackingMetric(metric: AttackingMetric) {
		setAttackingMetrics((current) => {
			const enabledCount = Object.values(current).filter(Boolean).length;
			if (current[metric] && enabledCount === 1) {
				return current;
			}
			return { ...current, [metric]: !current[metric] };
		});
	}

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const latestGw = meta.data?.latest_gw ?? 38;
	const hasPlayerSearch = playerSearch.trim() !== "";
	const windowFillPct =
		((windowSize - WINDOW_MIN) / (WINDOW_MAX - WINDOW_MIN)) * 100;

	const base = { window: windowSize, position, minMinutes, asOfGw };
	const formQuery = useQuery({
		queryKey: [
			"form",
			windowSize,
			position,
			minMinutes,
			minDelta,
			asOfGw,
			hasPlayerSearch,
		],
		queryFn: () =>
			fetchForm({ ...base, minDelta: hasPlayerSearch ? -1000 : minDelta }),
		enabled: tab === "form",
		placeholderData: keepPreviousData,
	});
	const defconQuery = useQuery({
		queryKey: [
			"defcon",
			windowSize,
			position,
			minMinutes,
			minHitRate,
			asOfGw,
			hasPlayerSearch,
		],
		queryFn: () =>
			fetchDefcon({ ...base, minHitRate: hasPlayerSearch ? 0 : minHitRate }),
		enabled: tab === "defcon",
		placeholderData: keepPreviousData,
	});
	const defconProbQuery = useQuery({
		queryKey: ["defconProb", position, minGames, asOfGw, hasPlayerSearch],
		queryFn: () =>
			fetchDefconProbability({
				position,
				minGames: hasPlayerSearch ? 0 : minGames,
				asOfGw,
			}),
		enabled: tab === "defconProb",
		placeholderData: keepPreviousData,
	});

	// League-wide queries (no position/delta/hit-rate filter) feed the heat-map
	// colour scale, so a player's colour is fixed regardless of the active filters.
	const formBaseline = useQuery({
		queryKey: ["formBaseline", windowSize, minMinutes, asOfGw],
		queryFn: () =>
			fetchForm({
				window: windowSize,
				position: "",
				minMinutes,
				minDelta: -1000,
				asOfGw,
			}),
		enabled: tab === "form",
		placeholderData: keepPreviousData,
	});
	const defconBaseline = useQuery({
		queryKey: ["defconBaseline", windowSize, minMinutes, asOfGw],
		queryFn: () =>
			fetchDefcon({
				window: windowSize,
				position: "",
				minMinutes,
				minHitRate: 0,
				asOfGw,
			}),
		enabled: tab === "defcon",
		placeholderData: keepPreviousData,
	});
	const defconProbBaseline = useQuery({
		queryKey: ["defconProbBaseline", asOfGw],
		queryFn: () =>
			fetchDefconProbability({ position: "", minGames: 0, asOfGw }),
		enabled: tab === "defconProb",
		placeholderData: keepPreviousData,
	});

	const formColumns = useMemo(
		() =>
			buildFormColumns(
				computeRanges(formBaseline.data ?? [], FORM_HEAT_KEYS),
				attackingMetrics,
			),
		[formBaseline.data, attackingMetrics],
	);
	const defconColumns = useMemo(
		() =>
			buildDefconColumns(
				computeRanges(defconBaseline.data ?? [], DEFCON_HEAT_KEYS),
			),
		[defconBaseline.data],
	);
	const defconProbColumns = useMemo(
		() =>
			buildDefconProbColumns(
				computeRanges(defconProbBaseline.data ?? [], DEFCON_PROB_HEAT_KEYS),
			),
		[defconProbBaseline.data],
	);

	const active =
		tab === "form"
			? formQuery
			: tab === "defcon"
				? defconQuery
				: defconProbQuery;

	// Team dropdown options derived from the loaded players, independent of the
	// client-side player/team filters so the list stays stable.
	const teamOptions = useMemo(() => {
		const players = (active.data ?? []) as Array<{ team_name: string | null }>;
		const names = players
			.map((player) => player.team_name)
			.filter((name): name is string => name !== null);
		return Array.from(new Set(names)).sort();
	}, [active.data]);

	const filteredForm = filterPlayers(
		formQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredDefcon = filterPlayers(
		defconQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const filteredDefconProb = filterPlayers(
		defconProbQuery.data ?? [],
		playerSearch,
		teamFilter,
	);
	const enabledAttackingMetricCount =
		Object.values(attackingMetrics).filter(Boolean).length;

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<div className="mx-auto max-w-[90rem] px-6 py-8">
				<header className="mb-6">
					<h1 className="font-semibold text-2xl">FPL Form Scout</h1>
					<p className="mt-1 max-w-3xl text-sm text-zinc-500">
						Surfaces players whose recent underlying output – expected goal
						involvement and DefCon hit rate over your chosen window – is
						outpacing their season-to-date baseline. Figures are point-in-time
						as of GW {asOfGw ?? latestGw}: only matches up to and including that
						gameweek are counted, with no look-ahead.
					</p>
				</header>

				<div className="mb-4 flex gap-2">
					{TABS.map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setTab(value)}
							className={`rounded-md px-3 py-1.5 font-medium text-sm ${
								tab === value
									? "bg-zinc-900 text-white"
									: "bg-white text-zinc-700 ring-1 ring-zinc-200"
							}`}
						>
							{TAB_LABELS[value]}
						</button>
					))}
				</div>

				<div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
					<div className="flex flex-wrap items-start gap-4">
						<label className={labelClass}>
							Player
							<input
								type="search"
								placeholder="e.g. Saka"
								className={`${inputClass} w-40`}
								value={playerSearch}
								onChange={(e) => setPlayerSearch(e.target.value)}
							/>
						</label>

						<label className={labelClass}>
							Position
							<select
								className={inputClass}
								value={position}
								onChange={(e) => setPosition(e.target.value as Position | "")}
							>
								<option value="">All</option>
								{POSITIONS.map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</select>
						</label>

						<label className={labelClass}>
							Team
							<select
								className={inputClass}
								value={teamFilter}
								onChange={(e) => setTeamFilter(e.target.value)}
							>
								<option value="">All</option>
								{teamOptions.map((team) => (
									<option key={team} value={team}>
										{team}
									</option>
								))}
							</select>
						</label>

						{tab !== "defconProb" && (
							<label className={labelClass}>
								Min Minutes
								<input
									type="number"
									min={0}
									className={`${inputClass} w-24`}
									value={minMinutes}
									onChange={(e) => setMinMinutes(Number(e.target.value))}
								/>
							</label>
						)}

						{tab === "form" && (
							<>
								<label className={labelClass}>
									Min Delta xGI per 90
									<input
										type="number"
										step={0.05}
										className={`${inputClass} w-24`}
										value={minDelta}
										onChange={(e) => setMinDelta(Number(e.target.value))}
									/>
								</label>

								<div className={labelClass}>
									<span>Metrics</span>
									<div className="mt-1 flex h-[34px] items-center gap-4">
										{ATTACKING_METRICS.map((metric) => (
											<label
												key={metric}
												className="flex items-center gap-1 text-xs text-zinc-900"
											>
												<input
													type="checkbox"
													className="accent-blue-600"
													checked={attackingMetrics[metric]}
													disabled={
														attackingMetrics[metric] &&
														enabledAttackingMetricCount === 1
													}
													onChange={() => toggleAttackingMetric(metric)}
												/>
												{ATTACKING_METRIC_LABELS[metric]}
											</label>
										))}
									</div>
								</div>
							</>
						)}

						{tab === "defcon" && (
							<label className={labelClass}>
								Min Hit Rate
								<select
									className={inputClass}
									value={minHitRate}
									onChange={(e) => setMinHitRate(Number(e.target.value))}
								>
									{HIT_RATES.map((rate) => (
										<option key={rate} value={rate}>
											{Math.round(rate * 100)}%
										</option>
									))}
								</select>
							</label>
						)}

						{tab === "defconProb" && (
							<label className={labelClass}>
								Min Games
								<input
									type="number"
									min={0}
									className={`${inputClass} w-24`}
									value={minGames}
									onChange={(e) => setMinGames(Number(e.target.value))}
								/>
							</label>
						)}

						{tab !== "defconProb" && (
							<label htmlFor="window-size" className={labelClass}>
								<span className="flex items-baseline gap-1">
									Window
									<span className="font-semibold text-zinc-900">
										{windowSize}
									</span>
									<span className="font-normal text-zinc-400">
										{windowSize === 1 ? "game" : "games"}
									</span>
								</span>
								<span className="mt-1 flex h-[34px] items-center">
									<input
										id="window-size"
										type="range"
										min={WINDOW_MIN}
										max={WINDOW_MAX}
										step={1}
										value={windowSize}
										onChange={(e) => setWindowSize(Number(e.target.value))}
										className="range-slider w-40"
										style={{
											background: `linear-gradient(to right, #18181b 0%, #18181b ${windowFillPct}%, #e4e4e7 ${windowFillPct}%, #e4e4e7 100%)`,
										}}
									/>
								</span>
							</label>
						)}

						<label className={labelClass}>
							<span className="flex items-center gap-1">
								As Of GW
								<InfoTooltip text="Evaluate form as of this gameweek. Only matches up to and including it are counted, so there is no look-ahead. Current ownership is excluded - it is always the present-day snapshot." />
							</span>
							<select
								className={inputClass}
								value={asOfGw ?? ""}
								onChange={(e) =>
									setAsOfGw(
										e.target.value === "" ? null : Number(e.target.value),
									)
								}
							>
								<option value="">Latest ({latestGw})</option>
								{Array.from({ length: latestGw }, (_, i) => latestGw - i).map(
									(gw) => (
										<option key={gw} value={gw}>
											{gw}
										</option>
									),
								)}
							</select>
						</label>
					</div>
				</div>

				{active.isPending ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : active.isError ? (
					<p className="text-red-600 text-sm">
						Failed to load - is the API running on port 8000?
					</p>
				) : tab === "form" ? (
					<>
						<FormScatter players={filteredForm} />
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredForm}
							columns={formColumns}
							onRowClick={(row) => setSelectedElement(row.element)}
						/>
					</>
				) : tab === "defcon" ? (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredDefcon}
							columns={defconColumns}
							onRowClick={(row) => setSelectedElement(row.element)}
						/>
					</>
				) : (
					<>
						<p className="mb-2 text-sm text-zinc-500">
							Click a player row to open the detailed stats view.
						</p>
						<DataTable
							data={filteredDefconProb}
							columns={defconProbColumns}
							onRowClick={(row) => setSelectedElement(row.element)}
						/>
					</>
				)}
			</div>

			{selectedElement !== null ? (
				<PlayerPanel
					key={selectedElement}
					element={selectedElement}
					onClose={() => setSelectedElement(null)}
				/>
			) : null}
		</div>
	);
}

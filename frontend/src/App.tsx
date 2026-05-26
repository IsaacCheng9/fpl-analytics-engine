import { useQuery } from "@tanstack/react-query";
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
import { fmtDelta, fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "./lib/format";

type Tab = "form" | "defcon" | "defconProb";

const TAB_LABELS: Record<Tab, string> = {
	form: "Attacking Form",
	defcon: "DefCon Form",
	defconProb: "DefCon Probability",
};
const TABS: Tab[] = ["form", "defcon", "defconProb"];
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const WINDOWS = [3, 4, 5, 6, 7, 8];
const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];

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
	"window_xgi90",
	"season_xgi90",
	"delta_xgi90",
	"window_xgi90_per_million",
	"season_points_per_million",
	"window_start_rate",
	"avg_fdr",
	"current_chance_of_playing",
];
const DEFCON_HEAT_KEYS = [
	"window_defcon_hit_rate",
	"season_points_per_million",
	"window_start_rate",
	"avg_fdr",
	"current_chance_of_playing",
];
const DEFCON_PROB_HEAT_KEYS = [
	"raw_rate",
	"prob",
	"avg_fdr",
	"current_chance_of_playing",
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

function buildFormColumns(
	ranges: Record<string, Range>,
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
		{ accessorKey: "window_minutes", header: "Mins" },
		{
			accessorKey: "window_xgi90",
			header: "Window xGI per 90",
			cell: heatCell<FormPlayer>(ranges.window_xgi90),
		},
		{
			accessorKey: "season_xgi90",
			header: "Season xGI per 90",
			cell: heatCell<FormPlayer>(ranges.season_xgi90),
		},
		{
			accessorKey: "delta_xgi90",
			header: "Delta xGI per 90",
			cell: heatCell<FormPlayer>(ranges.delta_xgi90, { format: fmtDelta }),
		},
		{
			accessorKey: "window_xgi90_per_million",
			header: "xGI per 90 per £m",
			cell: heatCell<FormPlayer>(ranges.window_xgi90_per_million),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points per £m",
			cell: heatCell<FormPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<FormPlayer>(ranges.window_start_rate, { format: fmtPct }),
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<FormPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
		},
		{
			accessorKey: "current_chance_of_playing",
			header: "Fit %",
			cell: heatCell<FormPlayer>(ranges.current_chance_of_playing, {
				format: (v) => fmtPctPoints(v, 0),
			}),
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
			cell: (info) => fmtPrice(info.getValue<number>()),
		},
		{ accessorKey: "window_games", header: "Games" },
		{ accessorKey: "window_defcon_hits", header: "Hits" },
		{
			accessorKey: "window_defcon_hit_rate",
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hit_rate, {
				format: fmtPct,
			}),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points per £m",
			cell: heatCell<DefconPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
		},
		{
			accessorKey: "current_chance_of_playing",
			header: "Fit %",
			cell: heatCell<DefconPlayer>(ranges.current_chance_of_playing, {
				format: (v) => fmtPctPoints(v, 0),
			}),
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
		{ accessorKey: "games", header: "Games" },
		{ accessorKey: "hits", header: "Hits" },
		{
			accessorKey: "raw_rate",
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>(ranges.raw_rate, {
				format: fmtPct,
			}),
		},
		{
			accessorKey: "prob",
			header: "P(Hit Next GW)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob, { format: fmtPct }),
		},
		{
			accessorKey: "prob_std",
			header: "+/-",
			cell: (info) => fmtNum(info.getValue<number | null>()),
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: (info) => fmtPctPoints(info.getValue<number | null>(), 1),
		},
		{
			accessorKey: "current_chance_of_playing",
			header: "Fit %",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.current_chance_of_playing,
				{
					format: (v) => fmtPctPoints(v, 0),
				},
			),
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
	const [minMinutes, setMinMinutes] = useState(270);
	const [minDelta, setMinDelta] = useState(0);
	const [minHitRate, setMinHitRate] = useState(0);
	const [minGames, setMinGames] = useState(5);
	const [asOfGw, setAsOfGw] = useState<number | null>(null);

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const latestGw = meta.data?.latest_gw ?? 38;

	const base = { window: windowSize, position, minMinutes, asOfGw };
	const formQuery = useQuery({
		queryKey: ["form", windowSize, position, minMinutes, minDelta, asOfGw],
		queryFn: () => fetchForm({ ...base, minDelta }),
		enabled: tab === "form",
	});
	const defconQuery = useQuery({
		queryKey: ["defcon", windowSize, position, minMinutes, minHitRate, asOfGw],
		queryFn: () => fetchDefcon({ ...base, minHitRate }),
		enabled: tab === "defcon",
	});
	const defconProbQuery = useQuery({
		queryKey: ["defconProb", position, minGames, asOfGw],
		queryFn: () => fetchDefconProbability({ position, minGames, asOfGw }),
		enabled: tab === "defconProb",
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
	});
	const defconProbBaseline = useQuery({
		queryKey: ["defconProbBaseline", asOfGw],
		queryFn: () =>
			fetchDefconProbability({ position: "", minGames: 0, asOfGw }),
		enabled: tab === "defconProb",
	});

	const formColumns = useMemo(
		() =>
			buildFormColumns(computeRanges(formBaseline.data ?? [], FORM_HEAT_KEYS)),
		[formBaseline.data],
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

				<div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-4">
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
						<>
							<label className={labelClass}>
								Window (Games)
								<select
									className={inputClass}
									value={windowSize}
									onChange={(e) => setWindowSize(Number(e.target.value))}
								>
									{WINDOWS.map((n) => (
										<option key={n} value={n}>
											{n}
										</option>
									))}
								</select>
							</label>

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
						</>
					)}

					{tab === "form" && (
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

					<label className={labelClass}>
						<span
							className="flex cursor-help items-center gap-1"
							title="Evaluate form as of this gameweek. Only matches up to and including it are counted, so there is no look-ahead."
						>
							As Of GW
							<span className="text-zinc-400">(?)</span>
						</span>
						<select
							className={inputClass}
							value={asOfGw ?? ""}
							onChange={(e) =>
								setAsOfGw(e.target.value === "" ? null : Number(e.target.value))
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

				{active.isPending ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : active.isError ? (
					<p className="text-red-600 text-sm">
						Failed to load - is the API running on port 8000?
					</p>
				) : tab === "form" ? (
					<>
						<FormScatter players={filteredForm} />
						<DataTable data={filteredForm} columns={formColumns} />
					</>
				) : tab === "defcon" ? (
					<DataTable data={filteredDefcon} columns={defconColumns} />
				) : (
					<DataTable data={filteredDefconProb} columns={defconProbColumns} />
				)}
			</div>
		</div>
	);
}

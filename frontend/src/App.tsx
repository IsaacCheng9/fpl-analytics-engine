import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
	type DefconPlayer,
	type FormPlayer,
	fetchDefcon,
	fetchForm,
	fetchMeta,
	type Position,
} from "./api";
import { DataTable } from "./components/DataTable";
import { fmtNum, fmtPct, fmtPrice } from "./lib/format";

type Tab = "form" | "defcon";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const WINDOWS = [3, 4, 5, 6, 7, 8];
const HIT_RATES = [0, 0.2, 0.4, 0.6, 0.8];

function DeltaCell({ value }: { value: number | null }) {
	if (value === null) {
		return <span className="text-zinc-400">-</span>;
	}
	const tone =
		value > 0
			? "text-emerald-600"
			: value < 0
				? "text-red-600"
				: "text-zinc-500";
	return (
		<span className={tone}>
			{value > 0 ? "+" : ""}
			{value.toFixed(2)}
		</span>
	);
}

const formColumns: ColumnDef<FormPlayer>[] = [
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
		cell: (info) => fmtNum(info.getValue<number | null>()),
	},
	{
		accessorKey: "season_xgi90",
		header: "Season xGI per 90",
		cell: (info) => fmtNum(info.getValue<number | null>()),
	},
	{
		accessorKey: "delta_xgi90",
		header: "Delta xGI per 90",
		cell: (info) => <DeltaCell value={info.getValue<number | null>()} />,
	},
];

const defconColumns: ColumnDef<DefconPlayer>[] = [
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
		cell: (info) => fmtPct(info.getValue<number | null>()),
	},
];

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

	const active = tab === "form" ? formQuery : defconQuery;

	// Team dropdown options derived from the loaded players, independent of the
	// client-side player/team filters so the list stays stable.
	const teamOptions = useMemo(() => {
		const players = (active.data ?? []) as Array<{ team_name: string | null }>;
		const names = players
			.map((player) => player.team_name)
			.filter((name): name is string => name !== null);
		return Array.from(new Set(names)).sort();
	}, [active.data]);

	const columnFilters = [
		...(playerSearch ? [{ id: "web_name", value: playerSearch }] : []),
		...(teamFilter ? [{ id: "team_name", value: teamFilter }] : []),
	];

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<div className="mx-auto max-w-6xl px-4 py-8">
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
					{(["form", "defcon"] as Tab[]).map((value) => (
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
							{value === "form" ? "Attacking Form" : "DefCon Form"}
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
						Min Minutes
						<input
							type="number"
							min={0}
							className={`${inputClass} w-24`}
							value={minMinutes}
							onChange={(e) => setMinMinutes(Number(e.target.value))}
						/>
					</label>

					{tab === "form" ? (
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
					) : (
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
					<DataTable
						data={formQuery.data ?? []}
						columns={formColumns}
						columnFilters={columnFilters}
					/>
				) : (
					<DataTable
						data={defconQuery.data ?? []}
						columns={defconColumns}
						columnFilters={columnFilters}
					/>
				)}
			</div>
		</div>
	);
}

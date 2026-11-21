import type {
	CurrentPlayerContext,
	DefconProbabilityPlayer,
	FormPlayer,
	FplTeamPick,
} from "../api";
import { fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "../lib/format";

type SquadInspectionRow = {
	pick: FplTeamPick;
	form?: FormPlayer;
	current?: CurrentPlayerContext;
	defcon?: DefconProbabilityPlayer;
};

type SquadFlag = {
	label: string;
	tone: "good" | "neutral" | "risk" | "watch";
};

const flagClass: Record<SquadFlag["tone"], string> = {
	good: "border-emerald-200 bg-emerald-50 text-emerald-800",
	neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
	risk: "border-red-200 bg-red-50 text-red-700",
	watch: "border-amber-200 bg-amber-50 text-amber-800",
};

const positionOrder = new Map([
	["GK", 0],
	["DEF", 1],
	["MID", 2],
	["FWD", 3],
	["MNG", 4],
]);

function indexByElement<T extends { element: number }>(
	rows: T[],
): Map<number, T> {
	return new Map(rows.map((row) => [row.element, row]));
}

function playerName(row: SquadInspectionRow): string {
	const name = row.current ? row.current.web_name : row.pick.web_name;
	return name ?? `#${row.pick.element}`;
}

function playerPosition(row: SquadInspectionRow): string | null {
	return row.current ? row.current.position : row.pick.position;
}

function playerTeam(row: SquadInspectionRow): string | null {
	return row.current ? row.current.team_name : row.pick.team_name;
}

function compareSquadRows(left: SquadInspectionRow, right: SquadInspectionRow) {
	const leftPosition = positionOrder.get(playerPosition(left) ?? "") ?? 99;
	const rightPosition = positionOrder.get(playerPosition(right) ?? "") ?? 99;
	if (leftPosition !== rightPosition) {
		return leftPosition - rightPosition;
	}
	return playerName(left).localeCompare(playerName(right));
}

function formatNextFixture(current: CurrentPlayerContext | undefined): string {
	if (!current?.next_opponent_name) {
		return "-";
	}
	const venue =
		current.next_was_home == null ? "" : current.next_was_home ? "H " : "A ";
	const gameweek =
		typeof current.next_fixture_gw === "number"
			? `GW${current.next_fixture_gw} `
			: "";
	return `${gameweek}${venue}${current.next_opponent_name}`;
}

function fixtureClass(fdr: number | null | undefined): string {
	if (fdr == null) {
		return "text-zinc-400";
	}
	if (fdr >= 4) {
		return "font-medium text-red-700";
	}
	if (fdr >= 3) {
		return "font-medium text-amber-700";
	}
	return "font-medium text-emerald-700";
}

function squadFlags(row: SquadInspectionRow): SquadFlag[] {
	const { form, defcon, current } = row;
	const position = playerPosition(row);
	const startRate = form?.window_start_rate;
	const minsPerApp = form?.window_mins_per_appearance;
	// The estimated rate is the best per-90 predictor in the form backtest;
	// playing time is judged separately by the minutes flags.
	const estXgi = form?.est_xgi90;
	const nextFdr = current?.next_fdr;
	const avgFdr = current?.avg_fdr;
	const flags: SquadFlag[] = [];

	if (
		(typeof startRate === "number" && startRate < 0.6) ||
		(typeof minsPerApp === "number" && minsPerApp < 60)
	) {
		flags.push({ label: "Minutes Risk", tone: "risk" });
	} else if (
		(typeof startRate === "number" && startRate < 0.8) ||
		(typeof minsPerApp === "number" && minsPerApp < 75)
	) {
		flags.push({ label: "Minutes Watch", tone: "watch" });
	}

	if (
		(typeof nextFdr === "number" && nextFdr >= 4) ||
		(typeof avgFdr === "number" && avgFdr >= 3.5)
	) {
		flags.push({ label: "Fixture Risk", tone: "watch" });
	}

	if (position !== "GK" && typeof estXgi === "number" && estXgi < 0.2) {
		flags.push({ label: "Low Threat", tone: "watch" });
	} else if (position !== "GK" && typeof estXgi !== "number") {
		flags.push({ label: "No Form Data", tone: "neutral" });
	}

	if (typeof defcon?.prob === "number" && defcon.prob >= 0.45) {
		flags.push({ label: "DefCon Upside", tone: "good" });
	}

	if (flags.length === 0) {
		const stableMinutes =
			(typeof startRate === "number" && startRate >= 0.8) ||
			(typeof minsPerApp === "number" && minsPerApp >= 75);
		flags.push(
			stableMinutes
				? { label: "Good Hold", tone: "good" }
				: { label: "Review", tone: "neutral" },
		);
	}

	return flags;
}

function SquadRows({
	rows,
	onPlayerClick,
}: {
	rows: SquadInspectionRow[];
	onPlayerClick: (element: number) => void;
}) {
	if (rows.length === 0) {
		return null;
	}

	return (
		<section>
			<div className="overflow-x-auto rounded-md border border-zinc-200">
				<table className="w-full min-w-max border-collapse text-sm">
					<thead className="bg-zinc-100 text-left text-zinc-600">
						<tr>
							<th className="px-3 py-2 font-medium">Player</th>
							<th className="px-3 py-2 font-medium">Pos</th>
							<th className="px-3 py-2 font-medium">Team</th>
							<th className="px-3 py-2 font-medium">Price</th>
							<th className="px-3 py-2 font-medium">Next</th>
							<th className="px-3 py-2 font-medium">FDR</th>
							<th className="px-3 py-2 font-medium">Projected xGI</th>
							<th className="px-3 py-2 font-medium">Est. xGI/90</th>
							<th className="px-3 py-2 font-medium">Window xGI/90</th>
							<th className="px-3 py-2 font-medium">Season xGI/90</th>
							<th className="px-3 py-2 font-medium">Window xG/90</th>
							<th className="px-3 py-2 font-medium">Window xA/90</th>
							<th className="px-3 py-2 font-medium">Mins/App</th>
							<th className="px-3 py-2 font-medium">Start %</th>
							<th className="px-3 py-2 font-medium">P(Hit | 60+ Mins)</th>
							<th className="px-3 py-2 font-medium">Owned %</th>
							<th className="px-3 py-2 font-medium">Flags</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const { form, current } = row;
							const flags = squadFlags(row);
							return (
								<tr
									key={row.pick.element}
									tabIndex={0}
									className="cursor-pointer border-zinc-100 border-t bg-white hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-500 focus-visible:-outline-offset-2"
									onClick={() => onPlayerClick(row.pick.element)}
									onKeyDown={(event) => {
										if (
											event.target === event.currentTarget &&
											(event.key === "Enter" || event.key === " ")
										) {
											event.preventDefault();
											onPlayerClick(row.pick.element);
										}
									}}
								>
									<td className="px-3 py-2 font-medium text-zinc-900">
										<span className="inline-flex items-center gap-1.5">
											<button
												type="button"
												className="cursor-pointer text-left hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-sky-500"
												onClick={(event) => {
													event.stopPropagation();
													onPlayerClick(row.pick.element);
												}}
											>
												{playerName(row)}
											</button>
											{row.pick.is_captain ? (
												<span
													title="Captain"
													className="rounded bg-zinc-900 px-1.5 py-0.5 font-semibold text-[10px] text-white"
												>
													<span aria-hidden="true">C</span>
													<span className="sr-only">Captain</span>
												</span>
											) : row.pick.is_vice_captain ? (
												<span
													title="Vice-captain"
													className="rounded border border-zinc-300 bg-zinc-100 px-1 py-0.5 font-semibold text-[10px] text-zinc-700"
												>
													<span aria-hidden="true">VC</span>
													<span className="sr-only">Vice-captain</span>
												</span>
											) : null}
											{!row.pick.is_starting ? (
												<span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-normal text-[10px] text-zinc-500">
													Bench
												</span>
											) : null}
										</span>
									</td>
									<td className="px-3 py-2">{playerPosition(row) ?? "-"}</td>
									<td className="px-3 py-2">{playerTeam(row) ?? "-"}</td>
									<td className="px-3 py-2">
										{fmtPrice(current?.price ?? null)}
									</td>
									<td className="px-3 py-2">{formatNextFixture(current)}</td>
									<td
										className={`px-3 py-2 ${fixtureClass(current?.next_fdr)}`}
									>
										{fmtNum(current?.next_fdr ?? null, 0)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.projected_xgi ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.est_xgi90 ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.window_xgi90 ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.season_xgi90 ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.window_xg90 ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.window_xa90 ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtNum(form?.window_mins_per_appearance ?? null, 0)}
									</td>
									<td className="px-3 py-2">
										{fmtPct(form?.window_start_rate ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtPct(row.defcon?.prob ?? null)}
									</td>
									<td className="px-3 py-2">
										{fmtPctPoints(current?.current_ownership ?? null, 1)}
									</td>
									<td className="px-3 py-2">
										<div className="flex flex-wrap gap-1">
											{flags.map((flag) => (
												<span
													key={flag.label}
													className={`rounded-full border px-2 py-0.5 font-medium text-xs ${flagClass[flag.tone]}`}
												>
													{flag.label}
												</span>
											))}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function SquadInspection({
	picks,
	formPlayers,
	currentPlayers,
	defconPlayers,
	window,
	asOfGw,
	latestGw,
	loading,
	error,
	onRetry,
	onPlayerClick,
}: {
	picks: FplTeamPick[];
	formPlayers: FormPlayer[];
	currentPlayers: CurrentPlayerContext[];
	defconPlayers: DefconProbabilityPlayer[];
	window: number;
	asOfGw: number | null;
	latestGw: number;
	loading: boolean;
	error: boolean;
	onRetry?: () => void;
	onPlayerClick: (element: number) => void;
}) {
	const formByElement = indexByElement(formPlayers);
	const currentByElement = indexByElement(currentPlayers);
	const defconByElement = indexByElement(defconPlayers);
	const rows = picks
		.map((pick) => ({
			pick,
			form: formByElement.get(pick.element),
			current: currentByElement.get(pick.element),
			defcon: defconByElement.get(pick.element),
		}))
		.sort(compareSquadRows);

	return (
		<section className="mb-4 space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-lg text-zinc-900">
						Next-GW Squad Inspection
					</h2>
					<p className="mt-1 text-sm text-zinc-500">
						Current squad, scored with the same point-in-time metrics as the
						main tables.
					</p>
				</div>
				<div className="flex flex-wrap gap-2 text-xs">
					<span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-700">
						As Of GW {asOfGw ?? latestGw}
					</span>
					<span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-700">
						Window {window}
					</span>
					<span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
						Current Squad {picks.length}
					</span>
				</div>
			</div>

			{loading ? (
				<p className="text-sm text-zinc-500">Loading squad context...</p>
			) : error ? (
				<div className="flex items-center gap-3">
					<p className="text-red-600 text-sm">Failed to load squad context.</p>
					{onRetry ? (
						<button
							type="button"
							className="rounded-md px-2.5 py-1 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"
							onClick={onRetry}
						>
							Retry
						</button>
					) : null}
				</div>
			) : rows.length === 0 ? (
				<p className="text-sm text-zinc-500">
					No imported squad players found.
				</p>
			) : (
				<SquadRows rows={rows} onPlayerClick={onPlayerClick} />
			)}
		</section>
	);
}

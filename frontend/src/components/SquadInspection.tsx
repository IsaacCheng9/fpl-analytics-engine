import { useState } from "react";
import type {
	CurrentPlayerContext,
	DefconProbabilityPlayer,
	FormPlayer,
	FplTeamPick,
} from "../api";
import { fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "../lib/format";
import {
	availabilityTooltip,
	cardRiskBadge,
	isUnavailableStatus,
	statusLabel,
} from "../lib/playerStatus";
import { parseOptionalInputNumber } from "../state";
import { fieldClass } from "../styles";
import {
	DEFAULT_FIXTURE_HORIZON,
	FixtureStrip,
	MAX_GAMEWEEK,
} from "./FixtureStrip";
import { PlayerStatusBadges } from "./PlayerStatusBadges";

// Carry player identity alongside position and budget so callers can track
// which squad pick triggered a replacement search.
export type ReplacementRequest = {
	element: number;
	webName: string;
	position: string | null;
	maxPrice?: number;
};

type SquadInspectionRow = {
	pick: FplTeamPick;
	form?: FormPlayer;
	current?: CurrentPlayerContext;
	defcon?: DefconProbabilityPlayer;
	flags: SquadFlag[];
};

type SquadFlag = {
	label: string;
	tone: "good" | "neutral" | "risk" | "watch";
	title?: string;
};

type SquadSummary = {
	projectedXgiTotal: number | null;
	projectedXgiCount: number;
	startingCount: number;
	riskPlayers: number;
	watchPlayers: number;
	avgNextFdr: number | null;
	fdrCount: number;
};

const TABLE_COLUMN_COUNT = 18;
const BANK_MIN = 0;
const BANK_MAX = 100;

const flagClass: Record<SquadFlag["tone"], string> = {
	good: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300",
	neutral:
		"border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300",
	risk: "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300",
	watch:
		"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300",
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

function roundTo1Decimal(value: number): number {
	return Math.round(value * 10) / 10;
}

function playerName(row: Pick<SquadInspectionRow, "pick" | "current">): string {
	const name = row.current ? row.current.web_name : row.pick.web_name;
	return name ?? `#${row.pick.element}`;
}

function playerPosition(
	row: Pick<SquadInspectionRow, "pick" | "current">,
): string | null {
	return row.current ? row.current.position : row.pick.position;
}

function playerTeam(
	row: Pick<SquadInspectionRow, "pick" | "current">,
): string | null {
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

function compareBenchRows(left: SquadInspectionRow, right: SquadInspectionRow) {
	if (left.pick.squad_position !== right.pick.squad_position) {
		return left.pick.squad_position - right.pick.squad_position;
	}
	return compareSquadRows(left, right);
}

function buildReplacementRequest(
	row: SquadInspectionRow,
	bank: number,
): ReplacementRequest {
	const request: ReplacementRequest = {
		element: row.pick.element,
		webName: playerName(row),
		position: playerPosition(row),
	};
	const price = row.current?.price;
	if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
		request.maxPrice = roundTo1Decimal(price + bank);
	}
	return request;
}

function summarizeSquad(
	startingRows: SquadInspectionRow[],
	benchRows: SquadInspectionRow[],
): SquadSummary {
	let projectedXgiSum = 0;
	let projectedXgiCount = 0;
	let fdrSum = 0;
	let fdrCount = 0;
	for (const row of startingRows) {
		const projectedXgi = row.form?.projected_xgi;
		if (typeof projectedXgi === "number" && Number.isFinite(projectedXgi)) {
			projectedXgiSum += projectedXgi;
			projectedXgiCount += 1;
		}
		const nextFdr = row.current?.next_fdr;
		if (typeof nextFdr === "number" && Number.isFinite(nextFdr)) {
			fdrSum += nextFdr;
			fdrCount += 1;
		}
	}

	// Count each squad player once by highest severity (risk over watch).
	let riskPlayers = 0;
	let watchPlayers = 0;
	for (const row of [...startingRows, ...benchRows]) {
		if (row.flags.some((flag) => flag.tone === "risk")) {
			riskPlayers += 1;
		} else if (row.flags.some((flag) => flag.tone === "watch")) {
			watchPlayers += 1;
		}
	}

	return {
		projectedXgiTotal: projectedXgiCount > 0 ? projectedXgiSum : null,
		projectedXgiCount,
		startingCount: startingRows.length,
		riskPlayers,
		watchPlayers,
		avgNextFdr: fdrCount > 0 ? fdrSum / fdrCount : null,
		fdrCount,
	};
}

function currentWindowEndGw(
	players: readonly CurrentPlayerContext[],
): number | undefined {
	let earliest: number | null = null;
	let latest: number | null = null;
	for (const player of players) {
		for (const fixture of player.next_fixtures ?? []) {
			if (earliest === null || fixture.gw < earliest) {
				earliest = fixture.gw;
			}
			if (latest === null || fixture.gw > latest) {
				latest = fixture.gw;
			}
		}
	}
	if (earliest === null || latest === null) {
		return undefined;
	}
	return Math.min(
		earliest + DEFAULT_FIXTURE_HORIZON - 1,
		Math.max(MAX_GAMEWEEK, latest),
	);
}

function fixtureClass(fdr: number | null | undefined): string {
	if (fdr == null) {
		return "text-zinc-400 dark:text-zinc-500";
	}
	if (fdr >= 4) {
		return "font-medium text-red-700 dark:text-red-400";
	}
	if (fdr >= 3) {
		return "font-medium text-amber-700 dark:text-amber-400";
	}
	return "font-medium text-emerald-700 dark:text-emerald-400";
}

function squadFlags(
	row: Pick<SquadInspectionRow, "pick" | "form" | "current" | "defcon">,
): SquadFlag[] {
	const { form, defcon, current } = row;
	const live = current ?? form;
	const position = playerPosition(row);
	const startRate = form?.window_start_rate;
	const minsPerApp = form?.window_mins_per_appearance;
	// The estimated rate is the best per-90 predictor in the form backtest;
	// playing time is judged separately by the minutes flags.
	const estXgi = form?.est_xgi90;
	const nextFdr = current?.next_fdr;
	const avgFdr = current?.avg_fdr;
	const flags: SquadFlag[] = [];

	if (live && isUnavailableStatus(live.status)) {
		const label = statusLabel(live.status);
		if (label) {
			flags.push({
				label,
				tone: "risk",
				title: availabilityTooltip(live) ?? undefined,
			});
		}
	} else if (live?.status === "d") {
		flags.push({
			label: "Doubtful",
			tone: "watch",
			title: availabilityTooltip(live) ?? undefined,
		});
	}

	const cardRisk = cardRiskBadge(live?.yellow_cards);
	if (cardRisk) {
		flags.push({
			label: "Card Risk",
			tone: "watch",
			title: cardRisk.tooltip,
		});
	}

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

function SquadSummaryBar({
	summary,
	bankInput,
	onBankInputChange,
	onBankInputBlur,
}: {
	summary: SquadSummary;
	bankInput: string;
	onBankInputChange: (value: string) => void;
	onBankInputBlur: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/60">
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<div>
					<div className="font-medium text-xs text-zinc-500 dark:text-zinc-400">
						Starting XI Projected xGI
					</div>
					<div className="mt-0.5 flex items-baseline gap-1.5">
						<span className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
							{fmtNum(summary.projectedXgiTotal)}
						</span>
						{summary.startingCount > 0 &&
						summary.projectedXgiCount < summary.startingCount ? (
							<span className="text-xs text-zinc-500 dark:text-zinc-400">
								({summary.projectedXgiCount}/{summary.startingCount} with data)
							</span>
						) : null}
					</div>
				</div>

				<div>
					<div className="font-medium text-xs text-zinc-500 dark:text-zinc-400">
						Squad Flags
					</div>
					<div className="mt-0.5 text-sm">
						<span
							className={
								summary.riskPlayers > 0
									? "font-semibold text-red-700 dark:text-red-400"
									: "font-medium text-zinc-500 dark:text-zinc-400"
							}
						>
							{summary.riskPlayers} Risk
						</span>
						<span className="text-zinc-400 dark:text-zinc-500">, </span>
						<span
							className={
								summary.watchPlayers > 0
									? "font-semibold text-amber-700 dark:text-amber-400"
									: "font-medium text-zinc-500 dark:text-zinc-400"
							}
						>
							{summary.watchPlayers} Watch
						</span>
					</div>
				</div>

				<div>
					<div className="font-medium text-xs text-zinc-500 dark:text-zinc-400">
						Avg Next FDR (XI)
					</div>
					<div className="mt-0.5 flex items-baseline gap-1.5">
						<span
							className={`font-semibold text-base ${fixtureClass(summary.avgNextFdr)}`}
						>
							{fmtNum(summary.avgNextFdr, 1)}
						</span>
						{summary.startingCount > 0 &&
						summary.fdrCount < summary.startingCount ? (
							<span className="text-xs text-zinc-500 dark:text-zinc-400">
								({summary.fdrCount}/{summary.startingCount} with data)
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<label
					htmlFor="squad-bank-itb"
					title="Money in the bank, added to each player's current market price"
					className="font-medium text-xs text-zinc-600 dark:text-zinc-300"
				>
					Bank ({"\u00a3"}m){" "}
					<span className="font-normal text-zinc-400 dark:text-zinc-500">
						ITB
					</span>
				</label>
				<input
					id="squad-bank-itb"
					type="number"
					inputMode="decimal"
					step="0.1"
					min={BANK_MIN}
					max={BANK_MAX}
					placeholder="0.0"
					className={`${fieldClass} w-20`}
					value={bankInput}
					onChange={(event) => onBankInputChange(event.target.value)}
					onBlur={onBankInputBlur}
				/>
			</div>
		</div>
	);
}

function SquadSectionBody({
	title,
	rows,
	isBench,
	bank,
	stripEndGw,
	onPlayerClick,
	onFindReplacement,
}: {
	title: string;
	rows: SquadInspectionRow[];
	isBench: boolean;
	bank: number;
	stripEndGw: number | undefined;
	onPlayerClick: (element: number) => void;
	onFindReplacement: (request: ReplacementRequest) => void;
}) {
	if (rows.length === 0) {
		return null;
	}

	return (
		<tbody aria-label={title}>
			<tr
				className={
					isBench
						? "border-zinc-200 border-t-2 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-800/80"
						: "border-zinc-200 border-t bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
				}
			>
				<th
					colSpan={TABLE_COLUMN_COUNT}
					scope="rowgroup"
					className="px-3 py-1.5 text-left font-semibold text-xs text-zinc-600 uppercase tracking-wide dark:text-zinc-300"
				>
					<span className="inline-flex items-center gap-2">
						<span>{title}</span>
						<span className="rounded-full bg-zinc-200/80 px-1.5 py-0.5 font-medium text-[11px] text-zinc-700 normal-case tracking-normal dark:bg-zinc-700 dark:text-zinc-200">
							{rows.length}
						</span>
					</span>
				</th>
			</tr>
			{rows.map((row, index) => {
				const { form, current, flags } = row;
				const name = playerName(row);
				// Derive bench slot from FPL's 12-15 squad_position so partial benches
				// preserve true auto-sub slots; fall back to display index otherwise.
				const benchSlot =
					row.pick.squad_position >= 12
						? row.pick.squad_position - 11
						: index + 1;
				return (
					<tr
						key={row.pick.element}
						tabIndex={0}
						className={`cursor-pointer border-zinc-100 border-t hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-500 focus-visible:-outline-offset-2 dark:border-zinc-800 dark:hover:bg-sky-950/50 dark:focus-visible:bg-sky-950/50 ${
							isBench
								? "bg-zinc-50/50 dark:bg-zinc-950/40"
								: "bg-white dark:bg-zinc-900"
						}`}
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
						<td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
							<span className="inline-flex items-center gap-1.5">
								{isBench ? (
									<span
										title={`Bench order ${benchSlot}`}
										className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-semibold text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
									>
										B{benchSlot}
									</span>
								) : null}
								<button
									type="button"
									className="cursor-pointer text-left hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-sky-500"
									onClick={(event) => {
										event.stopPropagation();
										onPlayerClick(row.pick.element);
									}}
								>
									{name}
								</button>
								<PlayerStatusBadges player={current ?? form} mode="compact" />
								{row.pick.is_captain ? (
									<span
										title="Captain"
										className="rounded bg-zinc-900 px-1.5 py-0.5 font-semibold text-[10px] text-white dark:bg-zinc-100 dark:text-zinc-900"
									>
										<span aria-hidden="true">C</span>
										<span className="sr-only">Captain</span>
									</span>
								) : row.pick.is_vice_captain ? (
									<span
										title="Vice-captain"
										className="rounded border border-zinc-300 bg-zinc-100 px-1 py-0.5 font-semibold text-[10px] text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
									>
										<span aria-hidden="true">VC</span>
										<span className="sr-only">Vice-captain</span>
									</span>
								) : null}
							</span>
						</td>
						<td className="px-3 py-2">{playerPosition(row) ?? "-"}</td>
						<td className="px-3 py-2">{playerTeam(row) ?? "-"}</td>
						<td className="px-3 py-2">{fmtPrice(current?.price ?? null)}</td>
						<td className="px-3 py-2">
							<FixtureStrip
								fixtures={current?.next_fixtures ?? []}
								maxGw={stripEndGw}
							/>
						</td>
						<td
							className={`px-3 py-2 text-right tabular-nums ${fixtureClass(current?.next_fdr)}`}
						>
							{fmtNum(current?.next_fdr ?? null, 0)}
						</td>
						<td className="px-3 py-2">{fmtNum(form?.projected_xgi ?? null)}</td>
						<td className="px-3 py-2">{fmtNum(form?.est_xgi90 ?? null)}</td>
						<td className="px-3 py-2">{fmtNum(form?.window_xgi90 ?? null)}</td>
						<td className="px-3 py-2">{fmtNum(form?.season_xgi90 ?? null)}</td>
						<td className="px-3 py-2">{fmtNum(form?.window_xg90 ?? null)}</td>
						<td className="px-3 py-2">{fmtNum(form?.window_xa90 ?? null)}</td>
						<td className="px-3 py-2">
							{fmtNum(form?.window_mins_per_appearance ?? null, 0)}
						</td>
						<td className="px-3 py-2">
							{fmtPct(form?.window_start_rate ?? null)}
						</td>
						<td className="px-3 py-2">{fmtPct(row.defcon?.prob ?? null)}</td>
						<td className="px-3 py-2">
							{fmtPctPoints(current?.current_ownership ?? null, 1)}
						</td>
						<td className="px-3 py-2">
							<div className="flex flex-wrap gap-1">
								{flags.map((flag) => (
									<span
										key={flag.label}
										title={flag.title}
										className={`rounded-full border px-2 py-0.5 font-medium text-xs ${flagClass[flag.tone]}`}
									>
										{flag.label}
									</span>
								))}
							</div>
						</td>
						<td className="px-3 py-2">
							<button
								type="button"
								aria-label={`Find replacement for ${name}`}
								className="cursor-pointer rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-medium text-xs text-zinc-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:hover:text-sky-200"
								onClick={(event) => {
									event.stopPropagation();
									onFindReplacement(buildReplacementRequest(row, bank));
								}}
							>
								Replace
							</button>
						</td>
					</tr>
				);
			})}
		</tbody>
	);
}

function SquadTable({
	startingRows,
	benchRows,
	bank,
	stripEndGw,
	onPlayerClick,
	onFindReplacement,
}: {
	startingRows: SquadInspectionRow[];
	benchRows: SquadInspectionRow[];
	bank: number;
	stripEndGw: number | undefined;
	onPlayerClick: (element: number) => void;
	onFindReplacement: (request: ReplacementRequest) => void;
}) {
	if (startingRows.length === 0 && benchRows.length === 0) {
		return null;
	}

	return (
		<div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
			<table className="w-full min-w-max border-collapse text-sm">
				<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
					<tr>
						<th className="px-3 py-2 font-medium">Player</th>
						<th className="px-3 py-2 font-medium">Pos</th>
						<th className="px-3 py-2 font-medium">Team</th>
						<th className="px-3 py-2 font-medium">Price</th>
						<th className="px-3 py-2 font-medium">Fixtures</th>
						<th className="px-3 py-2 text-right font-medium">FDR</th>
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
						<th className="px-3 py-2 font-medium">Action</th>
					</tr>
				</thead>
				<SquadSectionBody
					title="Starting XI"
					rows={startingRows}
					isBench={false}
					bank={bank}
					stripEndGw={stripEndGw}
					onPlayerClick={onPlayerClick}
					onFindReplacement={onFindReplacement}
				/>
				<SquadSectionBody
					title="Bench"
					rows={benchRows}
					isBench={true}
					bank={bank}
					stripEndGw={stripEndGw}
					onPlayerClick={onPlayerClick}
					onFindReplacement={onFindReplacement}
				/>
			</table>
		</div>
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
	onFindReplacement,
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
	onFindReplacement: (request: ReplacementRequest) => void;
}) {
	const [bankInput, setBankInput] = useState("0.0");
	const bank =
		parseOptionalInputNumber(bankInput, { min: BANK_MIN, max: BANK_MAX }) ?? 0;

	const formByElement = indexByElement(formPlayers);
	const currentByElement = indexByElement(currentPlayers);
	const defconByElement = indexByElement(defconPlayers);
	const stripEndGw = currentWindowEndGw(currentPlayers);
	const allRows: SquadInspectionRow[] = picks.map((pick) => {
		const baseRow = {
			pick,
			form: formByElement.get(pick.element),
			current: currentByElement.get(pick.element),
			defcon: defconByElement.get(pick.element),
		};
		return {
			...baseRow,
			flags: squadFlags(baseRow),
		};
	});
	const startingRows = allRows
		.filter((row) => row.pick.is_starting)
		.sort(compareSquadRows);
	const benchRows = allRows
		.filter((row) => !row.pick.is_starting)
		.sort(compareBenchRows);
	const summary = summarizeSquad(startingRows, benchRows);

	function normaliseBankInput() {
		const trimmed = bankInput.trim();
		if (trimmed === "") {
			setBankInput("0.0");
			return;
		}
		const parsed = parseOptionalInputNumber(trimmed, {
			min: BANK_MIN,
			max: BANK_MAX,
		});
		setBankInput(parsed === null ? "0.0" : parsed.toFixed(1));
	}

	return (
		<section className="mb-4 space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
						Next-GW Squad Inspection
					</h2>
					<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
						Current squad, scored with the same point-in-time metrics as the
						main tables.
					</p>
				</div>
				<div className="flex flex-wrap gap-2 text-xs">
					<span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
						As Of GW {asOfGw ?? latestGw}
					</span>
					<span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
						Window {window}
					</span>
					<span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-200">
						Current Squad {picks.length}
					</span>
				</div>
			</div>

			{loading ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Loading squad context...
				</p>
			) : error ? (
				<div className="flex items-center gap-3">
					<p className="text-red-600 text-sm dark:text-red-400">
						Failed to load squad context.
					</p>
					{onRetry ? (
						<button
							type="button"
							className="rounded-md px-2.5 py-1 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
							onClick={onRetry}
						>
							Retry
						</button>
					) : null}
				</div>
			) : allRows.length === 0 ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					No imported squad players found.
				</p>
			) : (
				<>
					<SquadSummaryBar
						summary={summary}
						bankInput={bankInput}
						onBankInputChange={setBankInput}
						onBankInputBlur={normaliseBankInput}
					/>
					<SquadTable
						startingRows={startingRows}
						benchRows={benchRows}
						bank={bank}
						stripEndGw={stripEndGw}
						onPlayerClick={onPlayerClick}
						onFindReplacement={onFindReplacement}
					/>
				</>
			)}
		</section>
	);
}

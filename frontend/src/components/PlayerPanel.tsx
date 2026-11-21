import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { fetchMeta, fetchPlayerDetail, type PlayerGameweek } from "../api";
import { fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "../lib/format";
import {
	meanDefensiveContribution,
	rollingChartRows,
} from "../lib/playerTrends";
import { FixtureStrip } from "./FixtureStrip";

const WINDOWS = [3, 4, 5, 6, 7, 8];

// Expected stats only cover GW16-38 in the 2022-23 archive, so its attacking
// rates are scoped to that window rather than the full season.
const PARTIAL_SEASON = "2022-23";

function formatMatchOpponent(gameweek: PlayerGameweek): {
	text: string;
	title?: string;
} | null {
	const label = gameweek.opponent_short_name || gameweek.opponent_name;
	if (!label) {
		return null;
	}
	const venue =
		gameweek.was_home === true
			? " (H)"
			: gameweek.was_home === false
				? " (A)"
				: "";
	const fullName = gameweek.opponent_name || label;
	return {
		text: `${label}${venue}`,
		title: `${fullName}${venue}`,
	};
}

function Chart({
	data,
	dataKey,
	title,
	seasonAverage,
}: {
	data: PlayerGameweek[];
	dataKey: keyof PlayerGameweek;
	title: string;
	seasonAverage: number | null | undefined;
}) {
	return (
		<div>
			<div className="mb-1 flex items-baseline justify-between gap-2">
				<h4 className="font-medium text-sm text-zinc-700 dark:text-zinc-200">
					{title}
				</h4>
				{/* Label the reference line outside the plot so data never covers it. */}
				{seasonAverage == null ? null : (
					<span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
						<span
							aria-hidden="true"
							className="w-4 border-zinc-400 border-t border-dashed dark:border-zinc-500"
						/>
						Season {seasonAverage.toFixed(2)}
					</span>
				)}
			</div>
			<ResponsiveContainer width="100%" height={180}>
				<LineChart
					data={data}
					margin={{ top: 4, right: 8, bottom: 4, left: -8 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
					{/* A numeric axis keeps blank gameweeks as visible gaps. */}
					<XAxis
						dataKey="round"
						type="number"
						domain={["dataMin", "dataMax"]}
						allowDecimals={false}
						stroke="var(--chart-axis)"
						tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
					/>
					<YAxis
						stroke="var(--chart-axis)"
						tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
					/>
					<Tooltip
						labelFormatter={(round) => `GW ${round}`}
						formatter={(value) =>
							typeof value === "number" ? value.toFixed(2) : value
						}
						cursor={{ stroke: "var(--chart-ref)", strokeDasharray: "3 3" }}
						contentStyle={{
							backgroundColor: "var(--chart-tooltip-bg)",
							borderColor: "var(--chart-tooltip-border)",
							borderRadius: "0.375rem",
							color: "var(--chart-tooltip-text)",
							fontSize: "0.75rem",
						}}
						labelStyle={{
							color: "var(--chart-tooltip-text)",
							fontWeight: 500,
						}}
						itemStyle={{
							color: "var(--chart-line)",
						}}
					/>
					{seasonAverage == null ? null : (
						<ReferenceLine
							y={seasonAverage}
							stroke="var(--chart-ref)"
							strokeDasharray="4 4"
							ifOverflow="extendDomain"
						/>
					)}
					{/* Straight segments avoid implying trends between gameweeks. */}
					<Line
						type="linear"
						dataKey={dataKey}
						name="Rolling"
						stroke="var(--chart-line)"
						dot={{ r: 2.5, fill: "var(--chart-line)" }}
						activeDot={{
							r: 4,
							fill: "var(--chart-line)",
							stroke: "var(--chart-tooltip-bg)",
						}}
						connectNulls
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

export function PlayerPanel({
	element,
	window: rollingWindow,
	season,
	asOfGw,
	onWindowChange,
	onSeasonChange,
	onClose,
}: {
	element: number;
	window: number;
	season: string | null;
	asOfGw: number | null;
	onWindowChange: (window: number) => void;
	onSeasonChange: (season: string) => void;
	onClose: () => void;
}) {
	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const needsMetadata = season !== null && !meta.data;
	const requestAsOfGw =
		season === null || season === meta.data?.season ? asOfGw : null;
	const query = useQuery({
		queryKey: ["player", element, rollingWindow, season, requestAsOfGw],
		queryFn: () =>
			fetchPlayerDetail(element, rollingWindow, season, requestAsOfGw),
		enabled: !needsMetadata,
	});
	const detail = query.data;
	const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
	useEffect(() => {
		if (detail) setAvailableSeasons(detail.available_seasons);
	}, [detail]);
	const selectedSeason =
		season ?? meta.data?.season ?? detail?.selected_season ?? "";
	const seasonOptions = Array.from(
		new Set([
			...(detail?.available_seasons ?? availableSeasons),
			...(meta.data ? [meta.data.season] : []),
			...(selectedSeason ? [selectedSeason] : []),
		]),
	)
		.sort()
		.reverse();
	const chartRows = detail ? rollingChartRows(detail.gameweeks) : [];
	const seasonSummary = detail?.seasons.find(
		(summary) => summary.season === detail.selected_season,
	);

	const dialogRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		const previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		dialogRef.current?.focus();

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && !event.defaultPrevented) {
				onCloseRef.current();
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previousFocus?.focus();
		};
	}, []);

	return (
		<div className="fixed inset-0 z-40 overflow-y-auto p-4">
			<button
				type="button"
				aria-label="Close player detail"
				className="fixed inset-0 cursor-default bg-black/40 dark:bg-black/70"
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="player-panel-title"
				tabIndex={-1}
				className="relative mx-auto mt-8 w-full max-w-4xl rounded-lg bg-white p-5 shadow-xl outline-none dark:border dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
			>
				<div className="mb-4 flex items-start justify-between">
					<div>
						<h2 id="player-panel-title" className="font-semibold text-xl">
							{detail?.web_name ?? "Player"}
						</h2>
						{detail ? (
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								{detail.position} - {detail.team_name} - As Of GW{" "}
								{detail.as_of_gw}
							</p>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-sm text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
					>
						Close
					</button>
				</div>

				<div className="mb-3 flex flex-wrap gap-3">
					<label className="flex w-40 flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300">
						Season
						<select
							className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
							value={selectedSeason}
							onChange={(e) => onSeasonChange(e.target.value)}
						>
							{seasonOptions.map((season) => (
								<option key={season} value={season}>
									{season}
								</option>
							))}
						</select>
					</label>

					<label className="flex w-40 flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300">
						Rolling Window (Gameweeks)
						<select
							className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
							value={rollingWindow}
							onChange={(e) => onWindowChange(Number(e.target.value))}
						>
							{WINDOWS.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
				</div>

				{query.isError || (needsMetadata && meta.isError) ? (
					<div className="flex items-center gap-3">
						<p className="text-red-600 text-sm dark:text-red-400">
							Failed to load player.
						</p>
						<button
							type="button"
							className="rounded-md px-2 py-1 text-sm text-zinc-600 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
							onClick={() => {
								if (needsMetadata) void meta.refetch();
								else void query.refetch();
							}}
						>
							Retry
						</button>
					</div>
				) : query.isPending || !detail ? (
					<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
				) : (
					<>
						{(!meta.data || detail.selected_season === meta.data.season) &&
						(detail.next_fixtures?.length ?? 0) > 0 ? (
							<div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
								<span className="font-medium text-xs text-zinc-600 dark:text-zinc-300">
									Upcoming Fixtures (Next 5)
								</span>
								<FixtureStrip
									fixtures={detail.next_fixtures}
									startGw={detail.as_of_gw + 1}
								/>
							</div>
						) : null}

						<div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Chart
								data={chartRows}
								dataKey="rolling_xg90"
								seasonAverage={seasonSummary?.xg90}
								title="Rolling xG Per 90"
							/>
							<Chart
								data={chartRows}
								dataKey="rolling_xa90"
								seasonAverage={seasonSummary?.xa90}
								title="Rolling xA Per 90"
							/>
							<Chart
								data={chartRows}
								dataKey="rolling_xgi90"
								seasonAverage={seasonSummary?.xgi90}
								title="Rolling xGI Per 90"
							/>
							<Chart
								data={chartRows}
								dataKey="rolling_defcon"
								seasonAverage={meanDefensiveContribution(detail.gameweeks)}
								title="Rolling DefCon (Mean Per Game)"
							/>
						</div>

						<h3 className="mb-2 font-medium text-sm text-zinc-700 dark:text-zinc-200">
							Season History
						</h3>
						<div className="mb-5 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
							<table className="w-full text-sm">
								<thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
									<tr>
										<th className="px-3 py-2 font-medium">Season</th>
										<th className="px-3 py-2 font-medium">Games</th>
										<th className="px-3 py-2 font-medium">xG/90</th>
										<th className="px-3 py-2 font-medium">xA/90</th>
										<th className="px-3 py-2 font-medium">xGI/90</th>
										<th className="px-3 py-2 font-medium">Points</th>
										<th className="px-3 py-2 font-medium">Points Per £m</th>
										<th className="px-3 py-2 font-medium">DefCon Hit Rate</th>
									</tr>
								</thead>
								<tbody>
									{detail.seasons.map((s) => (
										<tr
											key={s.season}
											className="border-zinc-100 border-t dark:border-zinc-800"
										>
											<td className="px-3 py-2">
												{s.season}
												{s.season === PARTIAL_SEASON ? (
													<span
														className="ml-1 cursor-help text-zinc-400 dark:text-zinc-500"
														title="2022-23 expected-stat rates use GW16-38 only; games, minutes, and points remain full-season."
													>
														*
													</span>
												) : null}
											</td>
											<td className="px-3 py-2">{s.games}</td>
											<td className="px-3 py-2">{fmtNum(s.xg90)}</td>
											<td className="px-3 py-2">{fmtNum(s.xa90)}</td>
											<td className="px-3 py-2">{fmtNum(s.xgi90)}</td>
											<td className="px-3 py-2">{s.points}</td>
											<td className="px-3 py-2">
												{fmtNum(s.points_per_million, 1)}
											</td>
											<td className="px-3 py-2">
												{s.defcon_hit_rate === null ? (
													<span
														className="text-zinc-300 dark:text-zinc-600"
														title="DefCon data does not exist before 2025-26."
													>
														n/a
													</span>
												) : (
													fmtPct(s.defcon_hit_rate)
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<h3 className="mb-2 font-medium text-sm text-zinc-700 dark:text-zinc-200">
							{detail.selected_season} by Gameweek
						</h3>
						<div className="max-h-64 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
							<table className="w-full min-w-max text-sm">
								<thead className="sticky top-0 bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
									<tr>
										<th className="px-3 py-2 font-medium">GW</th>
										<th className="px-3 py-2 font-medium">Opp</th>
										<th className="px-3 py-2 font-medium">Mins</th>
										<th className="px-3 py-2 font-medium">Pts</th>
										<th className="px-3 py-2 font-medium">G</th>
										<th className="px-3 py-2 font-medium">A</th>
										<th className="px-3 py-2 font-medium">Bonus</th>
										<th className="px-3 py-2 font-medium">xG</th>
										<th className="px-3 py-2 font-medium">xA</th>
										<th className="px-3 py-2 font-medium">xGI</th>
										<th className="px-3 py-2 font-medium">Price</th>
										<th className="px-3 py-2 font-medium">DefCon</th>
									</tr>
								</thead>
								<tbody>
									{detail.gameweeks.map((g, index) => {
										const opponent = formatMatchOpponent(g);
										return (
											<tr
												key={`${g.round}-${g.kickoff_time ?? index}`}
												className="border-zinc-100 border-t dark:border-zinc-800"
											>
												<td className="px-3 py-2">{g.round}</td>
												<td className="px-3 py-2 whitespace-nowrap">
													{opponent ? (
														<span title={opponent.title}>{opponent.text}</span>
													) : (
														<span className="text-zinc-400 dark:text-zinc-500">
															-
														</span>
													)}
												</td>
												<td className="px-3 py-2">{g.minutes}</td>
												<td className="px-3 py-2">{g.total_points}</td>
												<td className="px-3 py-2">
													{fmtNum(g.goals_scored, 0)}
												</td>
												<td className="px-3 py-2">{fmtNum(g.assists, 0)}</td>
												<td className="px-3 py-2">{fmtNum(g.bonus, 0)}</td>
												<td className="px-3 py-2">
													{fmtNum(g.expected_goals)}
												</td>
												<td className="px-3 py-2">
													{fmtNum(g.expected_assists)}
												</td>
												<td className="px-3 py-2">
													{fmtNum(g.expected_goal_involvements)}
												</td>
												<td className="px-3 py-2">{fmtPrice(g.price)}</td>
												<td className="px-3 py-2">
													{g.defensive_contribution === null
														? fmtPctPoints(null)
														: fmtNum(g.defensive_contribution, 0)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

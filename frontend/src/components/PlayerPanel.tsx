import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { fetchPlayerDetail, type PlayerGameweek } from "../api";
import { fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "../lib/format";

const WINDOWS = [3, 4, 5, 6, 7, 8];

// Expected stats only cover GW16-38 in the 2022-23 archive, so its season-long
// figures are diluted by the missing early gameweeks.
const PARTIAL_SEASON = "2022-23";

function Chart({
	data,
	dataKey,
	title,
	domain,
}: {
	data: PlayerGameweek[];
	dataKey: keyof PlayerGameweek;
	title: string;
	domain?: [number, number];
}) {
	return (
		<div>
			<h4 className="mb-1 font-medium text-sm text-zinc-700">{title}</h4>
			<ResponsiveContainer width="100%" height={180}>
				<LineChart
					data={data}
					margin={{ top: 4, right: 8, bottom: 4, left: -8 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
					<XAxis dataKey="round" tick={{ fontSize: 11 }} />
					<YAxis tick={{ fontSize: 11 }} domain={domain} />
					<Tooltip
						formatter={(value) =>
							typeof value === "number" ? value.toFixed(2) : value
						}
					/>
					<Line
						type="monotone"
						dataKey={dataKey}
						stroke="#2563eb"
						dot={false}
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
	onClose,
}: {
	element: number;
	onClose: () => void;
}) {
	const [window, setWindow] = useState(5);
	const [season, setSeason] = useState<string | null>(null);

	const query = useQuery({
		queryKey: ["player", element, window, season],
		queryFn: () => fetchPlayerDetail(element, window, season),
	});
	const detail = query.data;

	return (
		<div className="fixed inset-0 z-40 overflow-y-auto p-4">
			<button
				type="button"
				aria-label="Close player detail"
				className="fixed inset-0 cursor-default bg-black/40"
				onClick={onClose}
			/>
			<div className="relative mx-auto mt-8 w-full max-w-4xl rounded-lg bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-start justify-between">
					<div>
						<h2 className="font-semibold text-xl">
							{detail?.web_name ?? "Player"}
						</h2>
						{detail ? (
							<p className="text-sm text-zinc-500">
								{detail.position} - {detail.team_name}
							</p>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-sm text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-50"
					>
						Close
					</button>
				</div>

				{query.isPending ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : query.isError || !detail ? (
					<p className="text-red-600 text-sm">Failed to load player.</p>
				) : (
					<>
						<div className="mb-3 flex flex-wrap gap-3">
							<label className="flex w-40 flex-col text-xs font-medium text-zinc-600">
								Season
								<select
									className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
									value={detail.selected_season}
									onChange={(e) => setSeason(e.target.value)}
								>
									{[...detail.seasons].reverse().map((s) => (
										<option key={s.season} value={s.season}>
											{s.season}
										</option>
									))}
								</select>
							</label>

							<label className="flex w-40 flex-col text-xs font-medium text-zinc-600">
								Rolling Window (Games)
								<select
									className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
									value={window}
									onChange={(e) => setWindow(Number(e.target.value))}
								>
									{WINDOWS.map((n) => (
										<option key={n} value={n}>
											{n}
										</option>
									))}
								</select>
							</label>
						</div>

						<div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Chart
								data={detail.gameweeks}
								dataKey="rolling_xg90"
								title="Rolling xG Per 90"
							/>
							<Chart
								data={detail.gameweeks}
								dataKey="rolling_xa90"
								title="Rolling xA Per 90"
							/>
							<Chart
								data={detail.gameweeks}
								dataKey="rolling_xgi90"
								title="Rolling xGI Per 90"
							/>
							<Chart
								data={detail.gameweeks}
								dataKey="rolling_defcon"
								title="Rolling DefCon (Mean Per Game)"
							/>
						</div>

						<h3 className="mb-2 font-medium text-sm text-zinc-700">
							Season History
						</h3>
						<div className="mb-5 overflow-x-auto rounded-md border border-zinc-200">
							<table className="w-full text-sm">
								<thead className="bg-zinc-100 text-left text-zinc-600">
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
										<tr key={s.season} className="border-zinc-100 border-t">
											<td className="px-3 py-2">
												{s.season}
												{s.season === PARTIAL_SEASON ? (
													<span
														className="ml-1 cursor-help text-zinc-400"
														title="2022-23 expected stats only cover GW16-38, so the season figures are partial."
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
														className="text-zinc-300"
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

						<h3 className="mb-2 font-medium text-sm text-zinc-700">
							{detail.selected_season} by Gameweek
						</h3>
						<div className="max-h-64 overflow-auto rounded-md border border-zinc-200">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-zinc-100 text-left text-zinc-600">
									<tr>
										<th className="px-3 py-2 font-medium">GW</th>
										<th className="px-3 py-2 font-medium">Mins</th>
										<th className="px-3 py-2 font-medium">Pts</th>
										<th className="px-3 py-2 font-medium">xG</th>
										<th className="px-3 py-2 font-medium">xA</th>
										<th className="px-3 py-2 font-medium">xGI</th>
										<th className="px-3 py-2 font-medium">Price</th>
										<th className="px-3 py-2 font-medium">DefCon</th>
									</tr>
								</thead>
								<tbody>
									{detail.gameweeks.map((g, index) => (
										<tr
											key={`${g.round}-${g.kickoff_time ?? index}`}
											className="border-zinc-100 border-t"
										>
											<td className="px-3 py-2">{g.round}</td>
											<td className="px-3 py-2">{g.minutes}</td>
											<td className="px-3 py-2">{g.total_points}</td>
											<td className="px-3 py-2">{fmtNum(g.expected_goals)}</td>
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
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

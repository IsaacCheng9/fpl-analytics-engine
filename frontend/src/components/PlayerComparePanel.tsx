import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef } from "react";
import {
	type ClubForm,
	type DefconPlayer,
	type DefconProbabilityPlayer,
	type FormPlayer,
	fetchPlayerDetail,
} from "../api";
import {
	buildCompareRows,
	type CompareRow,
	type CompareSide,
	winningSide,
} from "../lib/compareRows";
import { PlayerCombobox, type PlayerOption } from "./PlayerCombobox";

function valueCellClass(row: CompareRow, side: "left" | "right"): string {
	return winningSide(row) === side
		? "bg-emerald-50 font-semibold text-emerald-800"
		: "text-zinc-900";
}

export function PlayerComparePanel({
	playerOptions,
	formPlayers,
	defconPlayers,
	defconProbabilityPlayers,
	clubForms,
	contextLoading,
	contextError,
	leftElement,
	rightElement,
	window,
	asOfGw,
	latestGw,
	onWindowChange,
	onAsOfGwChange,
	onLeftChange,
	onRightChange,
	onClose,
}: {
	playerOptions: PlayerOption[];
	formPlayers: FormPlayer[];
	defconPlayers: DefconPlayer[];
	defconProbabilityPlayers: DefconProbabilityPlayer[];
	clubForms: ClubForm[];
	contextLoading: boolean;
	contextError: boolean;
	leftElement: number | null;
	rightElement: number | null;
	window: number;
	asOfGw: number | null;
	latestGw: number;
	onWindowChange: (window: number) => void;
	onAsOfGwChange: (gameweek: number | null) => void;
	onLeftChange: (element: number | null) => void;
	onRightChange: (element: number | null) => void;
	onClose: () => void;
}) {
	const leftQuery = useQuery({
		queryKey: ["comparePlayer", leftElement, window, asOfGw],
		queryFn: () =>
			fetchPlayerDetail(leftElement as number, window, null, asOfGw),
		enabled: leftElement !== null,
	});
	const rightQuery = useQuery({
		queryKey: ["comparePlayer", rightElement, window, asOfGw],
		queryFn: () =>
			fetchPlayerDetail(rightElement as number, window, null, asOfGw),
		enabled: rightElement !== null,
	});

	const left = useMemo<CompareSide>(() => {
		const form = formPlayers.find((player) => player.element === leftElement);
		const teamName = form?.team_name ?? leftQuery.data?.team_name;
		return {
			option: playerOptions.find((player) => player.element === leftElement),
			form,
			defcon: defconPlayers.find((player) => player.element === leftElement),
			defconProb: defconProbabilityPlayers.find(
				(player) => player.element === leftElement,
			),
			club: clubForms.find((club) => club.team_name === teamName),
			detail: leftQuery.data,
		};
	}, [
		playerOptions,
		formPlayers,
		defconPlayers,
		defconProbabilityPlayers,
		clubForms,
		leftElement,
		leftQuery.data,
	]);
	const right = useMemo<CompareSide>(() => {
		const form = formPlayers.find((player) => player.element === rightElement);
		const teamName = form?.team_name ?? rightQuery.data?.team_name;
		return {
			option: playerOptions.find((player) => player.element === rightElement),
			form,
			defcon: defconPlayers.find((player) => player.element === rightElement),
			defconProb: defconProbabilityPlayers.find(
				(player) => player.element === rightElement,
			),
			club: clubForms.find((club) => club.team_name === teamName),
			detail: rightQuery.data,
		};
	}, [
		playerOptions,
		formPlayers,
		defconPlayers,
		defconProbabilityPlayers,
		clubForms,
		rightElement,
		rightQuery.data,
	]);
	const rows = useMemo(
		() => buildCompareRows(left, right, window, asOfGw, latestGw),
		[left, right, window, asOfGw, latestGw],
	);
	const canCompare = leftElement !== null && rightElement !== null;
	const isLoading =
		canCompare &&
		(contextLoading || leftQuery.isPending || rightQuery.isPending);
	const isError = contextError || leftQuery.isError || rightQuery.isError;
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
				aria-label="Close player compare"
				className="fixed inset-0 cursor-default bg-black/40"
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="player-compare-title"
				tabIndex={-1}
				className="relative mx-auto mt-6 w-full max-w-6xl rounded-lg bg-white p-5 shadow-xl outline-none"
			>
				<div className="mb-4 flex items-start justify-between gap-4">
					<div>
						<h2 id="player-compare-title" className="font-semibold text-xl">
							Compare Players
						</h2>
						<p className="mt-1 text-sm text-zinc-500">
							As Of GW {asOfGw ?? latestGw}, Window {window} Gameweeks
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-sm text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-50"
					>
						Close
					</button>
				</div>

				<div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
					<PlayerCombobox
						id="compare-left-player"
						label="First Player"
						options={playerOptions}
						value={leftElement}
						onChange={onLeftChange}
					/>
					<PlayerCombobox
						id="compare-right-player"
						label="Second Player"
						options={playerOptions}
						value={rightElement}
						onChange={onRightChange}
					/>
					<label className="flex min-w-28 flex-col text-xs font-medium text-zinc-600">
						Window (Gameweeks)
						<select
							className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
							value={window}
							onChange={(event) => onWindowChange(Number(event.target.value))}
						>
							{Array.from({ length: 19 }, (_, index) => index + 2).map(
								(value) => (
									<option key={value} value={value}>
										{value}
									</option>
								),
							)}
						</select>
					</label>
					<label className="flex min-w-28 flex-col text-xs font-medium text-zinc-600">
						As Of GW
						<select
							className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
							value={asOfGw ?? ""}
							onChange={(event) =>
								onAsOfGwChange(
									event.target.value === "" ? null : Number(event.target.value),
								)
							}
						>
							<option value="">Latest ({latestGw})</option>
							{Array.from(
								{ length: latestGw },
								(_, index) => latestGw - index,
							).map((gameweek) => (
								<option key={gameweek} value={gameweek}>
									{gameweek}
								</option>
							))}
						</select>
					</label>
				</div>

				{!canCompare ? (
					<p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500">
						Select two players to compare.
					</p>
				) : isLoading ? (
					<p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500">
						Loading comparison...
					</p>
				) : isError ? (
					<p className="rounded-md border border-red-200 bg-red-50 px-3 py-6 text-center text-red-700 text-sm">
						Failed to load player comparison.
					</p>
				) : (
					<div className="max-h-[70vh] overflow-auto rounded-md border border-zinc-200">
						<table className="w-full min-w-[44rem] border-collapse text-sm">
							<thead className="sticky top-0 z-20 bg-zinc-100 text-left text-zinc-600">
								<tr>
									<th className="w-1/3 px-3 py-2 font-medium">Stat</th>
									<th className="w-1/3 px-3 py-2 font-medium">
										{left.detail?.web_name ??
											left.option?.web_name ??
											"Player 1"}
									</th>
									<th className="w-1/3 px-3 py-2 font-medium">
										{right.detail?.web_name ??
											right.option?.web_name ??
											"Player 2"}
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row, index) => {
									const showSection =
										index === 0 || rows[index - 1]?.section !== row.section;
									return (
										<Fragment key={`${row.section}-${row.label}`}>
											{showSection ? (
												<tr>
													<th
														colSpan={3}
														className="border-zinc-200 border-t bg-zinc-50 px-3 py-2 text-left font-semibold text-zinc-700"
													>
														{row.section}
													</th>
												</tr>
											) : null}
											<tr className="border-zinc-100 border-t">
												<th className="px-3 py-2 text-left font-medium text-zinc-600">
													{row.label}
												</th>
												<td
													className={`px-3 py-2 ${valueCellClass(row, "left")}`}
												>
													{row.left}
												</td>
												<td
													className={`px-3 py-2 ${valueCellClass(row, "right")}`}
												>
													{row.right}
												</td>
											</tr>
										</Fragment>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

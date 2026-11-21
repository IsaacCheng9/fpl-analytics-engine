import type { OwnershipFilter } from "../state";

export function PlayerToolbar({
	fplTeamId,
	teamImportPending,
	teamImportError,
	ownedCount,
	hasImportedTeam,
	ownershipFilter,
	shortlistCount,
	isAllPlayersViewActive,
	isSquadViewActive,
	isShortlistViewActive,
	shortlistSummary,
	onSelectOwnershipFilter,
	onOpenCompare,
	onSelectAllPlayers,
	onSelectSquadView,
	onSelectShortlistView,
	onExitShortlistView,
	onClearShortlist,
}: {
	fplTeamId: number | null;
	teamImportPending: boolean;
	teamImportError: boolean;
	ownedCount: number;
	hasImportedTeam: boolean;
	ownershipFilter: OwnershipFilter;
	shortlistCount: number;
	isAllPlayersViewActive: boolean;
	isSquadViewActive: boolean;
	isShortlistViewActive: boolean;
	shortlistSummary: string;
	onSelectOwnershipFilter: (value: OwnershipFilter) => void;
	onOpenCompare: () => void;
	onSelectAllPlayers: () => void;
	onSelectSquadView: () => void;
	onSelectShortlistView: () => void;
	onExitShortlistView: () => void;
	onClearShortlist: () => void;
}) {
	return (
		<>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<p className="hidden text-sm text-zinc-500 sm:block">
					Click a player row to open the detailed stats view.
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{fplTeamId !== null ? (
						<span
							className={`rounded-md border px-2.5 py-1.5 font-medium text-xs ${
								teamImportError
									? "border-red-200 bg-red-50 text-red-700"
									: "border-sky-200 bg-sky-50 text-sky-800"
							}`}
						>
							{teamImportError
								? "Team Import Failed"
								: teamImportPending
									? "Loading Team..."
									: `Currently Owned (${ownedCount})`}
						</span>
					) : null}
					{fplTeamId !== null ? (
						<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-white p-0.5">
							<legend className="sr-only">Imported Team Filter</legend>
							{(
								[
									["all", "All"] as const,
									["owned", `Owned (${ownedCount})`] as const,
									["not-owned", "Not Owned"] as const,
								] satisfies Array<readonly [OwnershipFilter, string]>
							).map(([value, label]) => (
								<button
									key={value}
									type="button"
									aria-pressed={ownershipFilter === value}
									disabled={!hasImportedTeam && value !== "all"}
									className={`rounded px-3 py-1.5 font-medium text-sm ${
										ownershipFilter === value
											? "bg-zinc-900 text-white"
											: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
									}`}
									onClick={() => onSelectOwnershipFilter(value)}
								>
									{label}
								</button>
							))}
						</fieldset>
					) : null}
					<button
						type="button"
						className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50"
						onClick={onOpenCompare}
					>
						Compare Players
					</button>
					<fieldset className="inline-flex min-w-0 rounded-md border border-zinc-200 bg-white p-0.5">
						<legend className="sr-only">Player View</legend>
						<button
							type="button"
							aria-pressed={isAllPlayersViewActive}
							className={`rounded px-3 py-1.5 font-medium text-sm ${
								isAllPlayersViewActive
									? "bg-zinc-900 text-white"
									: "text-zinc-600 hover:bg-zinc-50"
							}`}
							onClick={onSelectAllPlayers}
						>
							All Players
						</button>
						<button
							type="button"
							aria-pressed={isSquadViewActive}
							disabled={!hasImportedTeam}
							className={`rounded px-3 py-1.5 font-medium text-sm ${
								isSquadViewActive
									? "bg-zinc-900 text-white"
									: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
							}`}
							onClick={onSelectSquadView}
						>
							Squad View ({ownedCount})
						</button>
						<button
							type="button"
							aria-pressed={isShortlistViewActive}
							disabled={shortlistCount === 0}
							className={`rounded px-3 py-1.5 font-medium text-sm ${
								isShortlistViewActive
									? "bg-zinc-900 text-white"
									: "text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
							}`}
							onClick={onSelectShortlistView}
						>
							Shortlisted ({shortlistCount})
						</button>
					</fieldset>
				</div>
			</div>

			{isShortlistViewActive ? (
				<div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
					<p className="font-medium text-amber-900 text-sm">
						{shortlistSummary}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 text-xs hover:bg-amber-100"
							onClick={onExitShortlistView}
						>
							Show All
						</button>
						<button
							type="button"
							className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 text-xs hover:bg-amber-100"
							onClick={onClearShortlist}
						>
							Clear Shortlist
						</button>
					</div>
				</div>
			) : null}
		</>
	);
}

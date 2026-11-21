import type { ReactNode } from "react";
import type { ActiveFilterChip } from "../state";

export function ActiveFilterChips({
	chips,
	clearAllButton,
}: {
	chips: ActiveFilterChip[];
	clearAllButton: ReactNode;
}) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
			<span className="mr-1 font-medium text-xs text-zinc-500 dark:text-zinc-400">
				Active Filters
			</span>
			{chips.map((chip) => (
				<button
					key={chip.id}
					type="button"
					className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-xs text-zinc-700 hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
					onClick={chip.onClear}
				>
					<span>{chip.label}</span>
					<span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
						x
					</span>
					<span className="sr-only">Clear {chip.label}</span>
				</button>
			))}
			<div className="ml-auto">{clearAllButton}</div>
		</div>
	);
}

import {
	CLUB_COLUMN_LABELS,
	type ClubColumnGroup,
	type ClubColumnVisibility,
} from "../state";

const COLUMN_SECTIONS: [string, ClubColumnGroup[]][] = [
	["Expected & Context", ["matches", "xg", "xgc", "xgd", "fdr", "form"]],
	["Actual Goals", ["goals", "ga"]],
	[
		"Over/Underperformance",
		[
			"finishing_total",
			"finishing_rate",
			"concession_total",
			"concession_rate",
			"goal_difference_total",
			"goal_difference_rate",
		],
	],
];

export function ClubColumnChooser({
	visibility,
	columnCount,
	onToggle,
	onReset,
}: {
	visibility: ClubColumnVisibility;
	columnCount: number;
	onToggle: (group: ClubColumnGroup) => void;
	onReset: () => void;
}) {
	return (
		<details className="order-last min-w-0 basis-full border-zinc-100 border-t pt-3 text-xs dark:border-zinc-800">
			<summary className="w-fit cursor-pointer font-medium text-zinc-600 dark:text-zinc-300">
				Columns ({columnCount})
			</summary>
			<div className="mt-3 flex flex-wrap items-start gap-x-10 gap-y-4">
				{COLUMN_SECTIONS.map(([title, groups]) => (
					<fieldset key={title} className="min-w-0 max-w-full">
						<legend className="mb-2 font-medium text-zinc-500 dark:text-zinc-400">
							{title}
						</legend>
						<div className="flex flex-wrap gap-x-4 gap-y-2">
							{groups.map((group) => (
								<label
									key={group}
									className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100"
								>
									<input
										type="checkbox"
										className="accent-blue-600 dark:accent-blue-400"
										checked={visibility[group]}
										onChange={() => onToggle(group)}
									/>
									{CLUB_COLUMN_LABELS[group]}
								</label>
							))}
						</div>
					</fieldset>
				))}
				<button
					type="button"
					className="text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
					onClick={onReset}
				>
					Reset Columns
				</button>
			</div>
		</details>
	);
}

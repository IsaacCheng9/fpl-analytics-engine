import {
	type NumericTransferFilterKey,
	parseOptionalInputNumber,
	type TransferFilters,
} from "../state";
import { labelClass, transferInputClass } from "../styles";
import { InfoTooltip } from "./InfoTooltip";

type OptionalField = {
	key: NumericTransferFilterKey;
	label: string;
	min: number;
	max?: number;
	step: number;
};

// Min Minutes sits between these in the layout, so the list is split in two.
const LEADING_FIELDS: OptionalField[] = [
	{ key: "maxPrice", label: "Max Price", min: 0, step: 0.1 },
	{ key: "maxFdr", label: "Max FDR", min: 1, max: 5, step: 0.1 },
];
const TRAILING_FIELDS: OptionalField[] = [
	{ key: "minMinsPerAppearance", label: "Min Mins/App", min: 0, step: 1 },
	{ key: "minStartPct", label: "Min Start %", min: 0, max: 100, step: 5 },
	{ key: "minOwnership", label: "Min Owned %", min: 0, step: 1 },
	{ key: "maxOwnership", label: "Max Owned %", min: 0, step: 1 },
];

export function TransferFilterFields({
	filters,
	minMinutes,
	showMinMinutes,
	hasActiveFilters,
	onFilterChange,
	onMinMinutesChange,
	onReset,
}: {
	filters: TransferFilters;
	minMinutes: number;
	showMinMinutes: boolean;
	hasActiveFilters: boolean;
	onFilterChange: <K extends keyof TransferFilters>(
		filter: K,
		value: TransferFilters[K],
	) => void;
	onMinMinutesChange: (value: number) => void;
	onReset: () => void;
}) {
	const optionalField = ({ key, label, min, max, step }: OptionalField) => (
		<label key={key} className={labelClass}>
			{label}
			<input
				type="number"
				min={min}
				max={max}
				step={step}
				placeholder="Any"
				className={transferInputClass}
				value={filters[key] ?? ""}
				onChange={(e) =>
					onFilterChange(
						key,
						parseOptionalInputNumber(e.target.value, { min, max }),
					)
				}
			/>
		</label>
	);

	return (
		<fieldset className="min-w-0 border-0 p-0">
			<legend className="sr-only">Transfer Filters</legend>
			<div className="mb-2 flex items-center gap-2">
				<span className="font-medium text-xs text-zinc-600 dark:text-zinc-300">
					Transfer Filters
				</span>
				{hasActiveFilters ? (
					<button
						type="button"
						className="rounded px-2 py-0.5 font-medium text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						onClick={onReset}
					>
						Reset Transfer Filters
					</button>
				) : null}
			</div>
			<div className="flex flex-wrap items-start gap-x-2 gap-y-3">
				{LEADING_FIELDS.map(optionalField)}
				{showMinMinutes ? (
					<label className={labelClass}>
						Min Minutes
						<input
							type="number"
							min={0}
							className={transferInputClass}
							value={minMinutes}
							onChange={(e) => onMinMinutesChange(Number(e.target.value))}
						/>
					</label>
				) : null}
				{TRAILING_FIELDS.map(optionalField)}
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
				<span className="inline-flex items-center gap-1">
					<label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-xs text-zinc-700">
						<input
							type="checkbox"
							className="accent-blue-600"
							checked={filters.excludeUnavailable}
							onChange={(e) =>
								onFilterChange("excludeUnavailable", e.target.checked)
							}
						/>
						Exclude Unavailable
					</label>
					<InfoTooltip text="Hides injured, suspended, and unavailable players (keeps doubtful players). Uses the present-day live availability snapshot, not point-in-time." />
				</span>
				<span className="inline-flex items-center gap-1">
					<label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-xs text-zinc-700">
						<input
							type="checkbox"
							className="accent-blue-600"
							checked={filters.penaltiesOnly}
							onChange={(e) =>
								onFilterChange("penaltiesOnly", e.target.checked)
							}
						/>
						Penalties Only
					</label>
					<InfoTooltip text="Shows only primary penalty takers from the present-day live snapshot, not point-in-time." />
				</span>
			</div>
		</fieldset>
	);
}

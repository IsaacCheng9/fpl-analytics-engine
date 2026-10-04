import { parseOptionalInputNumber, type TransferFilters } from "../state";
import { labelClass, transferInputClass } from "../styles";

type OptionalField = {
	key: keyof TransferFilters;
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
	onFilterChange: (filter: keyof TransferFilters, value: number | null) => void;
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
				<span className="font-medium text-xs text-zinc-600">
					Transfer Filters
				</span>
				{hasActiveFilters ? (
					<button
						type="button"
						className="rounded px-2 py-0.5 font-medium text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
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
		</fieldset>
	);
}

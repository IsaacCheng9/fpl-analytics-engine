import {
	ATTACKING_METRIC_COLUMN_ORDER,
	ATTACKING_METRIC_LABELS,
	ATTACKING_THREAT_PERIOD_LABELS,
	ATTACKING_THREAT_PERIODS,
	type AttackingMetric,
	type AttackingMetricVisibility,
	type AttackingThreatFilters,
	type AttackingThreatPeriod,
	parseOptionalInputNumber,
} from "../state";
import { inputClass, labelClass } from "../styles";

export function AttackingThreatFilterFields({
	filters,
	visibleMetrics,
	hasActiveFilters,
	onChange,
	onReset,
}: {
	filters: AttackingThreatFilters;
	visibleMetrics: AttackingMetricVisibility;
	hasActiveFilters: boolean;
	onChange: (
		metric: AttackingMetric,
		period: AttackingThreatPeriod,
		value: number | null,
	) => void;
	onReset: () => void;
}) {
	return (
		<fieldset className="min-w-0 border-0 p-0">
			<legend className="sr-only">Attacking Threat Filters</legend>
			<div className="mb-2 flex items-center gap-2">
				<span className="font-medium text-xs text-zinc-600 dark:text-zinc-300">
					Attacking Threat Filters
				</span>
				{hasActiveFilters ? (
					<button
						type="button"
						className="rounded px-2 py-0.5 font-medium text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						onClick={onReset}
					>
						Reset Threat Filters
					</button>
				) : null}
			</div>
			<div className="flex flex-wrap items-start gap-x-2 gap-y-3">
				{ATTACKING_METRIC_COLUMN_ORDER.filter(
					(metric) => visibleMetrics[metric],
				).flatMap((metric) =>
					ATTACKING_THREAT_PERIODS.map((period) => (
						<label key={`${metric}-${period}`} className={labelClass}>
							{`Min ${ATTACKING_THREAT_PERIOD_LABELS[period]} ${ATTACKING_METRIC_LABELS[metric]}/90`}
							<input
								type="number"
								min={0}
								step={0.05}
								placeholder="Any"
								className={`${inputClass} w-28`}
								value={filters[metric][period] ?? ""}
								onChange={(e) =>
									onChange(
										metric,
										period,
										parseOptionalInputNumber(e.target.value, { min: 0 }),
									)
								}
							/>
						</label>
					)),
				)}
			</div>
		</fieldset>
	);
}

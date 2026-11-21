import type { Position } from "../api";
import {
	ATTACKING_METRIC_LABELS,
	ATTACKING_METRICS,
	type AttackingMetric,
	type AttackingMetricVisibility,
	type AttackingThreatFilters,
	type AttackingThreatPeriod,
	type ClubColumnGroup,
	type ClubColumnVisibility,
	FILTER_PRESETS,
	type FilterPreset,
	HIT_RATES,
	isPlayerTab,
	POSITIONS,
	type Tab,
	type TransferFilters,
} from "../state";
import { inputClass, labelClass } from "../styles";
import { AttackingThreatFilterFields } from "./AttackingThreatFilterFields";
import { ClubColumnChooser } from "./ClubColumnChooser";
import { InfoTooltip } from "./InfoTooltip";
import { TransferFilterFields } from "./TransferFilterFields";
import { WindowSizeControl } from "./WindowSizeControl";

export function DashboardFilterBar({
	tab,
	playerSearch,
	position,
	teamFilter,
	teamOptions,
	clubColumnVisibility,
	clubColumnCount,
	attackingMetrics,
	enabledAttackingMetricCount,
	minHitRate,
	minGames,
	windowSize,
	asOfGw,
	latestGw,
	fplTeamId,
	fplTeamInput,
	canImportFplTeam,
	showMoreFilters,
	hasMoreFilters,
	moreFilterCount,
	attackingThreatFilters,
	hasActiveAttackingThreatFilters,
	transferFilters,
	minMinutes,
	hasActiveTransferFilters,
	onPlayerSearchChange,
	onPositionChange,
	onTeamFilterChange,
	onToggleClubColumnGroup,
	onResetClubColumns,
	onToggleAttackingMetric,
	onMinHitRateChange,
	onMinGamesChange,
	onWindowSizeChange,
	onAsOfGwChange,
	onFplTeamInputChange,
	onImportFplTeam,
	onClearFplTeam,
	onToggleMoreFilters,
	onApplyFilterPreset,
	onAttackingThreatFilterChange,
	onResetAttackingThreatFilters,
	onTransferFilterChange,
	onMinMinutesChange,
	onResetTransferFilters,
}: {
	tab: Tab;
	playerSearch: string;
	position: Position | "";
	teamFilter: string;
	teamOptions: string[];
	clubColumnVisibility: ClubColumnVisibility;
	clubColumnCount: number;
	attackingMetrics: AttackingMetricVisibility;
	enabledAttackingMetricCount: number;
	minHitRate: number;
	minGames: number;
	windowSize: number;
	asOfGw: number | null;
	latestGw: number;
	fplTeamId: number | null;
	fplTeamInput: string;
	canImportFplTeam: boolean;
	showMoreFilters: boolean;
	hasMoreFilters: boolean;
	moreFilterCount: number;
	attackingThreatFilters: AttackingThreatFilters;
	hasActiveAttackingThreatFilters: boolean;
	transferFilters: TransferFilters;
	minMinutes: number;
	hasActiveTransferFilters: boolean;
	onPlayerSearchChange: (value: string) => void;
	onPositionChange: (value: Position | "") => void;
	onTeamFilterChange: (value: string) => void;
	onToggleClubColumnGroup: (group: ClubColumnGroup) => void;
	onResetClubColumns: () => void;
	onToggleAttackingMetric: (metric: AttackingMetric) => void;
	onMinHitRateChange: (value: number) => void;
	onMinGamesChange: (value: number | null) => void;
	onWindowSizeChange: (value: number | null) => void;
	onAsOfGwChange: (value: number | null) => void;
	onFplTeamInputChange: (value: string) => void;
	onImportFplTeam: () => void;
	onClearFplTeam: () => void;
	onToggleMoreFilters: () => void;
	onApplyFilterPreset: (preset: FilterPreset) => void;
	onAttackingThreatFilterChange: (
		metric: AttackingMetric,
		period: AttackingThreatPeriod,
		value: number | null,
	) => void;
	onResetAttackingThreatFilters: () => void;
	onTransferFilterChange: (
		filter: keyof TransferFilters,
		value: number | null,
	) => void;
	onMinMinutesChange: (value: number) => void;
	onResetTransferFilters: () => void;
}) {
	const showTransferFilters = isPlayerTab(tab);

	return (
		<div
			className={`mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${
				tab === "evidence" ? "hidden" : ""
			}`}
		>
			<div className="flex flex-wrap items-start gap-4">
				{isPlayerTab(tab) && (
					<>
						<label className={labelClass}>
							Player
							<input
								type="search"
								placeholder="e.g. Saka"
								className={`${inputClass} w-40`}
								value={playerSearch}
								onChange={(e) => onPlayerSearchChange(e.target.value)}
							/>
						</label>

						<label className={labelClass}>
							Position
							<select
								className={inputClass}
								value={position}
								onChange={(e) =>
									onPositionChange(e.target.value as Position | "")
								}
							>
								<option value="">All</option>
								{POSITIONS.map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</select>
						</label>
					</>
				)}

				<label className={labelClass}>
					Team
					<select
						className={inputClass}
						value={teamFilter}
						onChange={(e) => onTeamFilterChange(e.target.value)}
					>
						<option value="">All</option>
						{teamOptions.map((team) => (
							<option key={team} value={team}>
								{team}
							</option>
						))}
					</select>
				</label>

				{tab === "clubs" && (
					<ClubColumnChooser
						visibility={clubColumnVisibility}
						columnCount={clubColumnCount}
						onToggle={onToggleClubColumnGroup}
						onReset={onResetClubColumns}
					/>
				)}

				{tab === "form" && (
					<div className={labelClass}>
						<span>Metrics</span>
						<div className="mt-1 flex h-[34px] items-center gap-4">
							{ATTACKING_METRICS.map((metric) => (
								<label
									key={metric}
									className="flex items-center gap-1 text-xs text-zinc-900 dark:text-zinc-100"
								>
									<input
										type="checkbox"
										className="accent-blue-600 dark:accent-blue-400"
										checked={attackingMetrics[metric]}
										disabled={
											attackingMetrics[metric] &&
											enabledAttackingMetricCount === 1
										}
										onChange={() => onToggleAttackingMetric(metric)}
									/>
									{ATTACKING_METRIC_LABELS[metric]}
								</label>
							))}
						</div>
					</div>
				)}

				{tab === "defcon" && (
					<label className={labelClass}>
						Min Hit Rate
						<select
							className={inputClass}
							value={minHitRate}
							onChange={(e) => onMinHitRateChange(Number(e.target.value))}
						>
							{HIT_RATES.map((rate) => (
								<option key={rate} value={rate}>
									{Math.round(rate * 100)}%
								</option>
							))}
						</select>
					</label>
				)}

				{tab === "defconProb" && (
					<label className={labelClass}>
						Min Games
						<input
							type="number"
							min={0}
							className={`${inputClass} w-24`}
							value={minGames}
							onChange={(e) => onMinGamesChange(Number(e.target.value))}
						/>
					</label>
				)}

				{tab !== "defconProb" && (
					<WindowSizeControl value={windowSize} onChange={onWindowSizeChange} />
				)}

				<div className={labelClass}>
					<span className="flex items-center gap-1">
						<label htmlFor="as-of-gw">As Of GW</label>
						<InfoTooltip text="Evaluate form as of this gameweek. Only matches up to and including it are counted, so there is no look-ahead. Current ownership is excluded - it is always the present-day snapshot." />
					</span>
					<select
						id="as-of-gw"
						className={inputClass}
						value={asOfGw ?? ""}
						onChange={(e) =>
							onAsOfGwChange(
								e.target.value === "" ? null : Number(e.target.value),
							)
						}
					>
						<option value="">Latest ({latestGw})</option>
						{Array.from({ length: latestGw }, (_, i) => latestGw - i).map(
							(gw) => (
								<option key={gw} value={gw}>
									{gw}
								</option>
							),
						)}
					</select>
				</div>

				{isPlayerTab(tab) ? (
					<form
						// Phones keep team import with the folded filters to save vertical space.
						className={`items-end gap-2 sm:flex ${showMoreFilters ? "flex" : "hidden"}`}
						onSubmit={(event) => {
							event.preventDefault();
							onImportFplTeam();
						}}
					>
						<label className={labelClass}>
							FPL Team ID
							<input
								type="number"
								min={1}
								inputMode="numeric"
								placeholder="e.g. 12345"
								className={`${inputClass} w-32`}
								value={fplTeamInput}
								onChange={(event) => onFplTeamInputChange(event.target.value)}
							/>
						</label>
						<button
							type="submit"
							disabled={!canImportFplTeam}
							className="mb-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600 dark:disabled:hover:bg-zinc-900"
						>
							Import
						</button>
						{fplTeamId !== null ? (
							<button
								type="button"
								className="mb-0 rounded-md px-2 py-1.5 font-medium text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
								onClick={onClearFplTeam}
							>
								Clear
							</button>
						) : null}
					</form>
				) : null}

				{hasMoreFilters ? (
					<button
						type="button"
						aria-expanded={showMoreFilters}
						aria-controls="more-filters"
						className="self-end rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
						onClick={onToggleMoreFilters}
					>
						{showMoreFilters ? "Fewer Filters" : "More Filters"}
						{moreFilterCount > 0 ? ` (${moreFilterCount})` : ""}
					</button>
				) : null}
			</div>
			{hasMoreFilters && showMoreFilters ? (
				<div id="more-filters">
					{tab === "form" ? (
						<div className="mt-4 border-zinc-100 border-t pt-4 dark:border-zinc-800">
							<div className="mb-2 font-medium text-xs text-zinc-600 dark:text-zinc-300">
								Filter Presets
							</div>
							<div className="flex flex-wrap gap-2">
								{FILTER_PRESETS.map((preset) => (
									<button
										key={preset.id}
										type="button"
										className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-medium text-sm text-zinc-700 hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
										onClick={() => onApplyFilterPreset(preset.id)}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
					) : null}
					<div className="mt-4 grid gap-6 border-zinc-100 border-t pt-4 xl:grid-cols-[auto_1fr] dark:border-zinc-800">
						{tab === "form" ? (
							<AttackingThreatFilterFields
								filters={attackingThreatFilters}
								visibleMetrics={attackingMetrics}
								hasActiveFilters={hasActiveAttackingThreatFilters}
								onChange={onAttackingThreatFilterChange}
								onReset={onResetAttackingThreatFilters}
							/>
						) : null}
						{showTransferFilters ? (
							<TransferFilterFields
								filters={transferFilters}
								minMinutes={minMinutes}
								showMinMinutes={tab !== "defconProb"}
								hasActiveFilters={hasActiveTransferFilters}
								onFilterChange={onTransferFilterChange}
								onMinMinutesChange={onMinMinutesChange}
								onReset={onResetTransferFilters}
							/>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

import type { Cell, CellContext, ColumnDef } from "@tanstack/react-table";
import type {
	ClubForm,
	DefconPlayer,
	DefconProbabilityPlayer,
	FormPlayer,
} from "./api";
import { FixtureStrip } from "./components/FixtureStrip";
import { PlayerStatusBadges } from "./components/PlayerStatusBadges";
import { fmtDelta, fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "./lib/format";
import {
	divergingScale,
	FDR_SCALE,
	type HeatScale,
	heatColour,
	type Range,
	sequentialScale,
} from "./lib/heat";
import {
	ATTACKING_METRIC_COLUMN_ORDER,
	ATTACKING_METRIC_GROUP_LABELS,
	ATTACKING_METRIC_KEYS,
	ATTACKING_METRIC_LABELS,
	ATTACKING_METRIC_NOUNS,
	ATTACKING_METRIC_STYLES,
	type AttackingMetric,
	type AttackingMetricColumn,
	type AttackingMetricVisibility,
	type ClubColumnGroup,
	type ClubColumnVisibility,
	type TransferFilterRow,
} from "./state";

// Sequential shades more-is-better metrics and diverging centres changes on
// zero. FDR uses fdrMeta's fixed 1-5 scale, and context columns skip heatMeta
// entirely and stay unshaded.
type HeatScaleKind = "sequential" | "diverging";
type HeatCellOptions = {
	lowerIsBetter?: boolean;
	scale?: HeatScaleKind;
	format?: (value: number | null | undefined) => string;
};

// Map nullable API numbers to undefined so TanStack Table always sorts missing
// values last in either direction rather than coercing null to 0.
function nullableNumericColumn<T, K extends keyof T & string>(
	key: K,
): {
	id: K;
	accessorFn: (row: T) => T[K] | undefined;
	sortUndefined: "last";
} {
	return {
		id: key,
		accessorFn: (row) => row[key] ?? undefined,
		sortUndefined: "last",
	};
}

// Metric columns that get heat shading. The range is computed league-wide from
// an unfiltered query so a player's colour stays fixed as you filter.
export const FORM_HEAT_KEYS = [
	"projected_xgi",
	"est_xg90",
	"est_xa90",
	"est_xgi90",
	"window_xg90",
	"window_xa90",
	"window_xgi90",
	"season_xg90",
	"season_xa90",
	"season_xgi90",
	"window_xg90_per_million",
	"window_xa90_per_million",
	"window_xgi90_per_million",
	"season_points_per_million",
];
export const DEFCON_HEAT_KEYS = [
	"window_defcon_hit_rate",
	"window_defcon",
	"season_points_per_million",
];
export const DEFCON_PROB_HEAT_KEYS = [
	"raw_rate",
	"prob",
	"window_defcon",
	"season_points_per_million",
];
export const CLUB_HEAT_KEYS = [
	"window_xg_per_match",
	"season_xg_per_match",
	"delta_xg_per_match",
	"window_goals_for_per_match",
	"delta_goals_for_per_match",
	"window_xgc_per_match",
	"season_xgc_per_match",
	"delta_xgc_per_match",
	"window_xgd_per_match",
	"season_xgd_per_match",
	"window_goals_against_per_match",
	"delta_goals_against_per_match",
	"window_finishing_delta",
	"season_finishing_delta",
	"window_concession_delta",
	"season_concession_delta",
	"window_finishing_delta_total",
	"season_finishing_delta_total",
	"window_concession_delta_total",
	"season_concession_delta_total",
	"window_goal_difference_delta",
	"season_goal_difference_delta",
	"window_goal_difference_delta_total",
	"season_goal_difference_delta_total",
	"attack_form",
	"defence_form",
];

// Min/max per metric across the supplied (league-wide) rows.
export function computeRanges(
	rows: readonly unknown[],
	keys: string[],
): Record<string, Range> {
	const ranges: Record<string, Range> = {};
	for (const key of keys) {
		const values = rows
			.map((row) => (row as Record<string, unknown>)[key])
			.filter((value): value is number => typeof value === "number");
		ranges[key] =
			values.length > 0
				? { min: Math.min(...values), max: Math.max(...values) }
				: { min: 0, max: 0 };
	}
	return ranges;
}

// Render the cell text; the table cell owns the background fill.
function HeatCell({
	value,
	text,
}: {
	value: number | null | undefined;
	text: string;
}) {
	if (value == null) {
		return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
	}
	return <span>{text}</span>;
}

// Build the text renderer for a numeric cell; heatMeta owns any shading.
function heatCell<T>(opts: HeatCellOptions = {}) {
	const format =
		opts.format ?? ((value: number | null | undefined) => fmtNum(value));
	return (info: CellContext<T, unknown>) => {
		const value = info.getValue<number | null | undefined>();
		return <HeatCell value={value} text={format(value)} />;
	};
}

function heatScale(range: Range, opts: HeatCellOptions): HeatScale {
	const lowerIsBetter = opts.lowerIsBetter ?? false;
	switch (opts.scale ?? "sequential") {
		case "sequential":
			return sequentialScale(range, lowerIsBetter);
		case "diverging":
			return divergingScale(range, lowerIsBetter);
	}
}

function heatCellStyle<T>(
	scale: HeatScale,
): (cell: Cell<T, unknown>) => { backgroundColor: string } | undefined {
	return (cell) => {
		const backgroundColor = heatColour(cell.getValue<number | null>(), scale);
		return backgroundColor ? { backgroundColor } : undefined;
	};
}

function heatMeta<T>(
	meta: ColumnDef<T>["meta"],
	range: Range,
	opts: HeatCellOptions = {},
): ColumnDef<T>["meta"] {
	return {
		...meta,
		numeric: true,
		cellStyle: heatCellStyle<T>(heatScale(range, opts)),
	};
}

// FDR is a fixed 1-5 rating, so it needs no league-wide range.
function fdrMeta<T>(meta: ColumnDef<T>["meta"]): ColumnDef<T>["meta"] {
	return { ...meta, numeric: true, cellStyle: heatCellStyle<T>(FDR_SCALE) };
}

function buildFormMetricColumns(
	ranges: Record<string, Range>,
	metric: AttackingMetric,
): ColumnDef<FormPlayer>[] {
	const label = ATTACKING_METRIC_LABELS[metric];
	const noun = ATTACKING_METRIC_NOUNS[metric];
	const styles = ATTACKING_METRIC_STYLES[metric];
	return (
		[
			"est",
			"window",
			"season",
			"delta",
			"value",
		] satisfies AttackingMetricColumn[]
	).map((group) => {
		const groupLabel = ATTACKING_METRIC_GROUP_LABELS[group];
		const key = ATTACKING_METRIC_KEYS[metric][group];
		const formatter: HeatCellOptions =
			group === "delta" ? { format: fmtDelta } : {};
		const tooltip =
			group === "est"
				? `Estimated underlying ${noun} per 90: season to date, pulled towards last season's rate (worth 900 minutes) for players with 900+ minutes last season`
				: group === "window"
					? `Expected ${noun} per 90 minutes over the recent window`
					: group === "season"
						? `Expected ${noun} per 90 minutes, season to date`
						: group === "delta"
							? `Window ${label} per 90 minus season ${label} per 90. Descriptive only: backtests found recent swings revert to the season rate (see Research)`
							: `Window ${label} per 90 divided by price`;
		const header =
			group === "value"
				? `${label} Per 90 Per £m`
				: `${groupLabel} ${label} Per 90`;
		return {
			id: key,
			// Players without window minutes have no window rate or delta; read
			// them as undefined so they sort last in either direction rather
			// than as zero in the middle of a signed column.
			accessorFn: (row) => row[key] ?? undefined,
			sortUndefined: "last",
			header,
			cell: heatCell<FormPlayer>(formatter),
			// The delta is descriptive, so it is left unshaded rather than
			// coloured as favourable or unfavourable.
			meta:
				group === "delta"
					? { tooltip, headerClassName: styles.header, numeric: true }
					: heatMeta<FormPlayer>(
							{
								tooltip,
								headerClassName: styles.header,
							},
							ranges[key],
							formatter,
						),
		} satisfies ColumnDef<FormPlayer>;
	});
}

// Player, position, team and price stay pinned on the left of every player table.
function buildPlayerIdentityColumns<
	T extends TransferFilterRow,
>(): ColumnDef<T>[] {
	return [
		{
			accessorKey: "web_name",
			header: "Player",
			cell: (info) => (
				<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
					<span>{info.getValue<string>()}</span>
					<PlayerStatusBadges player={info.row.original} mode="compact" />
				</span>
			),
		},
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		{
			...nullableNumericColumn<T, "price">("price"),
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null | undefined>()),
			meta: { numeric: true },
		},
	];
}

// Fixture and ownership context follows each table's signal columns.
function buildPlayerContextColumns<
	T extends TransferFilterRow,
>(): ColumnDef<T>[] {
	return [
		{
			...nullableNumericColumn<T, "avg_fdr">("avg_fdr"),
			header: "FDR (Next 5)",
			cell: heatCell<T>({
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: fdrMeta<T>({
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			}),
		},
		{
			...nullableNumericColumn<T, "current_ownership">("current_ownership"),
			header: "Owned %",
			cell: heatCell<T>({
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: {
				tooltip:
					"Current ownership percentage; a live snapshot, not point-in-time",
				numeric: true,
			},
		},
	];
}

export function buildFormColumns(
	ranges: Record<string, Range>,
	visibleMetrics: AttackingMetricVisibility,
): ColumnDef<FormPlayer>[] {
	return [
		...buildPlayerIdentityColumns<FormPlayer>(),
		{
			...nullableNumericColumn<FormPlayer, "projected_xgi">("projected_xgi"),
			header: "Projected xGI",
			cell: heatCell<FormPlayer>(),
			meta: heatMeta<FormPlayer>(
				{
					tooltip:
						"Expected xGI per gameweek: estimated xGI per 90 times projected minutes. The default ranking, because it ranked future xGI best in backtests (see Research)",
				},
				ranges.projected_xgi,
			),
		},
		{
			...nullableNumericColumn<FormPlayer, "projected_minutes">(
				"projected_minutes",
			),
			header: "Projected Mins",
			cell: heatCell<FormPlayer>({ format: (v) => fmtNum(v, 0) }),
			meta: {
				tooltip:
					"Expected minutes per gameweek: an even blend of recent-window and season-to-date minutes per gameweek, because recent playing-time changes partly persist",
				numeric: true,
			},
		},
		...ATTACKING_METRIC_COLUMN_ORDER.filter(
			(metric) => visibleMetrics[metric],
		).flatMap((metric) => buildFormMetricColumns(ranges, metric)),
		{
			...nullableNumericColumn<FormPlayer, "season_points_per_million">(
				"season_points_per_million",
			),
			header: "Points Per £m",
			cell: heatCell<FormPlayer>({
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
		...buildPlayerContextColumns<FormPlayer>(),
		{
			...nullableNumericColumn<FormPlayer, "window_minutes">("window_minutes"),
			header: "Mins",
			cell: heatCell<FormPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Total minutes played across the window",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<FormPlayer, "window_mins_per_appearance">(
				"window_mins_per_appearance",
			),
			header: "Mins Per App",
			cell: heatCell<FormPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<FormPlayer, "window_start_rate">(
				"window_start_rate",
			),
			header: "Start %",
			cell: heatCell<FormPlayer>({ format: fmtPct }),
			meta: {
				tooltip: "Share of window games the player started",
				numeric: true,
			},
		},
	];
}

export function buildDefconColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconPlayer>[] {
	return [
		...buildPlayerIdentityColumns<DefconPlayer>(),
		{
			...nullableNumericColumn<DefconPlayer, "window_defcon_hit_rate">(
				"window_defcon_hit_rate",
			),
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>({
				format: fmtPct,
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Share of window appearances clearing the DefCon threshold (0-minute games excluded)",
				},
				ranges.window_defcon_hit_rate,
			),
		},
		{
			...nullableNumericColumn<DefconPlayer, "window_defcon">("window_defcon"),
			header: "Avg DefCon",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per appearance over the window (0-minute games excluded)",
				},
				ranges.window_defcon,
			),
		},
		{
			...nullableNumericColumn<DefconPlayer, "window_defcon_hits">(
				"window_defcon_hits",
			),
			header: "Hits",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Window appearances clearing the DefCon threshold",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<DefconPlayer, "window_games">("window_games"),
			header: "Games",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Eligible games in the window", numeric: true },
		},
		{
			...nullableNumericColumn<DefconPlayer, "season_points_per_million">(
				"season_points_per_million",
			),
			header: "Points Per £m",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
		...buildPlayerContextColumns<DefconPlayer>(),
		{
			...nullableNumericColumn<DefconPlayer, "window_minutes">(
				"window_minutes",
			),
			header: "Mins",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Total minutes played across the window",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<DefconPlayer, "window_mins_per_appearance">(
				"window_mins_per_appearance",
			),
			header: "Mins Per App",
			cell: heatCell<DefconPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip:
					"Average minutes per appearance in the window; 0-minute games are excluded",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<DefconPlayer, "window_start_rate">(
				"window_start_rate",
			),
			header: "Start %",
			cell: heatCell<DefconPlayer>({
				format: fmtPct,
			}),
			meta: {
				tooltip: "Share of window games the player started",
				numeric: true,
			},
		},
	];
}

export function buildDefconProbColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconProbabilityPlayer>[] {
	return [
		...buildPlayerIdentityColumns<DefconProbabilityPlayer>(),
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "prob">("prob"),
			header: "P(Hit | 60+ Mins)",
			cell: heatCell<DefconProbabilityPlayer>({ format: fmtPct }),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Modelled probability of clearing the DefCon threshold, conditional on playing 60+ minutes",
				},
				ranges.prob,
			),
		},
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "raw_rate">("raw_rate"),
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>({
				format: fmtPct,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Observed DefCon hit rate (hits / games)" },
				ranges.raw_rate,
			),
		},
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "window_defcon">(
				"window_defcon",
			),
			header: "Avg DefCon",
			cell: heatCell<DefconProbabilityPlayer>({
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per appearance over the recent window (0-minute games excluded)",
				},
				ranges.window_defcon,
			),
		},
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "games">("games"),
			header: "Games",
			cell: heatCell<DefconProbabilityPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Eligible appearances up to this gameweek",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "hits">("hits"),
			header: "Hits",
			cell: heatCell<DefconProbabilityPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Appearances clearing the DefCon threshold",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<
				DefconProbabilityPlayer,
				"season_points_per_million"
			>("season_points_per_million"),
			header: "Points Per £m",
			cell: heatCell<DefconProbabilityPlayer>({ format: (v) => fmtNum(v, 1) }),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
		...buildPlayerContextColumns<DefconProbabilityPlayer>(),
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "window_minutes">(
				"window_minutes",
			),
			header: "Mins",
			cell: heatCell<DefconProbabilityPlayer>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: {
				tooltip: "Total minutes played across the recent window",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<
				DefconProbabilityPlayer,
				"window_mins_per_appearance"
			>("window_mins_per_appearance"),
			header: "Mins Per App",
			cell: heatCell<DefconProbabilityPlayer>({ format: (v) => fmtNum(v, 0) }),
			meta: {
				tooltip:
					"Average minutes per appearance in the recent window; 0-minute games are excluded",
				numeric: true,
			},
		},
		{
			...nullableNumericColumn<DefconProbabilityPlayer, "window_start_rate">(
				"window_start_rate",
			),
			header: "Start %",
			cell: heatCell<DefconProbabilityPlayer>({
				format: fmtPct,
			}),
			meta: {
				tooltip: "Share of recent window games the player started",
				numeric: true,
			},
		},
	];
}

export function buildClubColumns(
	ranges: Record<string, Range>,
	visibleColumns: ClubColumnVisibility,
): ColumnDef<ClubForm>[] {
	const overperformance = {
		xG: {
			prefix: "finishing",
			definition: "goals scored minus xG",
			positive: "more goals scored",
		},
		xGC: {
			prefix: "concession",
			definition: "xGC minus goals conceded",
			positive: "fewer goals conceded",
		},
		xGD: {
			prefix: "goal_difference",
			definition: "goal difference minus xGD",
			positive: "a better goal difference",
		},
	} as const;
	function overperformanceColumn(
		period: "window" | "season",
		metric: keyof typeof overperformance,
		total: boolean,
	): ColumnDef<ClubForm> {
		const defensive = metric === "xGC";
		const { prefix, definition, positive } = overperformance[metric];
		const key = `${period}_${prefix}_delta${total ? "_total" : ""}` as const;
		const range = ranges[key];
		const label = period === "window" ? "Window" : "Season";
		return {
			id: key,
			accessorFn: (row) => {
				const value = row[key];
				// Preserve the API's conceded-minus-expected sign; show favourable values as positive.
				return value == null
					? undefined
					: defensive
						? value === 0
							? 0
							: -value
						: value;
			},
			sortUndefined: "last",
			header: `${label} ${metric} +/- ${total ? "Total" : "Per Match"}`,
			cell: heatCell<ClubForm>({ format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip: `${metric} over/underperformance: ${definition}${total ? " in total" : " per match"} ${period === "window" ? "over the recent window" : "over the season to date"}. Positive means ${positive} than expected; negative means underperformance. Descriptive, not a prediction.`,
				},
				range,
				// Centre on zero so underperformance is never shaded favourably.
				{ scale: "diverging" },
			),
		};
	}
	const columns: ColumnDef<ClubForm>[] = [
		{ accessorKey: "team_name", header: "Club" },
		{
			...nullableNumericColumn<ClubForm, "window_matches">("window_matches"),
			header: "Matches",
			cell: heatCell<ClubForm>({
				format: (v) => fmtNum(v, 0),
			}),
			meta: { tooltip: "Club matches in the recent window", numeric: true },
		},
		{
			...nullableNumericColumn<ClubForm, "window_xg_per_match">(
				"window_xg_per_match",
			),
			header: "Window xG",
			cell: heatCell<ClubForm>(),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match over the recent window" },
				ranges.window_xg_per_match,
			),
		},
		{
			...nullableNumericColumn<ClubForm, "season_xg_per_match">(
				"season_xg_per_match",
			),
			header: "Season xG",
			cell: heatCell<ClubForm>(),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match, season to date" },
				ranges.season_xg_per_match,
			),
		},
		{
			...nullableNumericColumn<ClubForm, "delta_xg_per_match">(
				"delta_xg_per_match",
			),
			header: "Delta xG",
			cell: heatCell<ClubForm>({
				format: fmtDelta,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Window xG per match minus season xG per match; positive means the attack is creating more",
				},
				ranges.delta_xg_per_match,
				{ scale: "diverging" },
			),
		},
		overperformanceColumn("window", "xG", true),
		overperformanceColumn("window", "xG", false),
		overperformanceColumn("season", "xG", true),
		overperformanceColumn("season", "xG", false),
		...(visibleColumns.goals
			? [
					{
						...nullableNumericColumn<ClubForm, "window_goals_for_per_match">(
							"window_goals_for_per_match",
						),
						header: "Window Goals",
						cell: heatCell<ClubForm>(),
						meta: heatMeta<ClubForm>(
							{
								tooltip: "Goals scored per match over the recent window",
							},
							ranges.window_goals_for_per_match,
						),
					},
					{
						...nullableNumericColumn<ClubForm, "delta_goals_for_per_match">(
							"delta_goals_for_per_match",
						),
						header: "Delta Goals",
						cell: heatCell<ClubForm>({
							format: fmtDelta,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip:
									"Window goals per match minus season goals per match; useful context for finishing variance",
							},
							ranges.delta_goals_for_per_match,
							{ scale: "diverging" },
						),
					},
				]
			: []),
		{
			...nullableNumericColumn<ClubForm, "attack_form">("attack_form"),
			header: "Attack Form",
			cell: heatCell<ClubForm>({ format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip: "Recent xG per match improvement versus the season baseline",
				},
				ranges.attack_form,
				{ scale: "diverging" },
			),
		},
		{
			...nullableNumericColumn<ClubForm, "window_xgc_per_match">(
				"window_xgc_per_match",
			),
			header: "Window xGC",
			cell: heatCell<ClubForm>({
				lowerIsBetter: true,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip: "Expected goals conceded per match over the recent window",
				},
				ranges.window_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		{
			...nullableNumericColumn<ClubForm, "season_xgc_per_match">(
				"season_xgc_per_match",
			),
			header: "Season xGC",
			cell: heatCell<ClubForm>({
				lowerIsBetter: true,
			}),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals conceded per match, season to date" },
				ranges.season_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		{
			...nullableNumericColumn<ClubForm, "delta_xgc_per_match">(
				"delta_xgc_per_match",
			),
			header: "Delta xGC",
			cell: heatCell<ClubForm>({
				lowerIsBetter: true,
				format: fmtDelta,
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Window xGC per match minus season xGC per match; negative means the defence is allowing less",
				},
				ranges.delta_xgc_per_match,
				{ lowerIsBetter: true, scale: "diverging" },
			),
		},
		overperformanceColumn("window", "xGC", true),
		overperformanceColumn("window", "xGC", false),
		overperformanceColumn("season", "xGC", true),
		overperformanceColumn("season", "xGC", false),
		...(visibleColumns.ga
			? [
					{
						...nullableNumericColumn<
							ClubForm,
							"window_goals_against_per_match"
						>("window_goals_against_per_match"),
						header: "Window Goals Conceded",
						cell: heatCell<ClubForm>({
							lowerIsBetter: true,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip: "Goals conceded per match over the recent window",
							},
							ranges.window_goals_against_per_match,
							{ lowerIsBetter: true },
						),
					},
					{
						...nullableNumericColumn<ClubForm, "delta_goals_against_per_match">(
							"delta_goals_against_per_match",
						),
						header: "Delta Goals Conceded",
						cell: heatCell<ClubForm>({
							lowerIsBetter: true,
							format: fmtDelta,
						}),
						meta: heatMeta<ClubForm>(
							{
								tooltip:
									"Window goals conceded per match minus season goals conceded per match",
							},
							ranges.delta_goals_against_per_match,
							{ lowerIsBetter: true, scale: "diverging" },
						),
					},
				]
			: []),
		{
			...nullableNumericColumn<ClubForm, "defence_form">("defence_form"),
			header: "Defence Form",
			cell: heatCell<ClubForm>({ format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Recent xGC per match improvement versus the season baseline; positive is better",
				},
				ranges.defence_form,
				{ scale: "diverging" },
			),
		},
		{
			...nullableNumericColumn<ClubForm, "window_xgd_per_match">(
				"window_xgd_per_match",
			),
			header: "Window xGD",
			cell: heatCell<ClubForm>({ format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"xG minus xGC per match over the recent window; positive means the club is out-creating opponents",
				},
				ranges.window_xgd_per_match,
				{ scale: "diverging" },
			),
		},
		{
			...nullableNumericColumn<ClubForm, "season_xgd_per_match">(
				"season_xgd_per_match",
			),
			header: "Season xGD",
			cell: heatCell<ClubForm>({ format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{ tooltip: "xG minus xGC per match, season to date" },
				ranges.season_xgd_per_match,
				{ scale: "diverging" },
			),
		},
		overperformanceColumn("window", "xGD", true),
		overperformanceColumn("window", "xGD", false),
		overperformanceColumn("season", "xGD", true),
		overperformanceColumn("season", "xGD", false),
		{
			...nullableNumericColumn<ClubForm, "avg_fdr">("avg_fdr"),
			header: "FDR (Next 5)",
			cell: heatCell<ClubForm>({
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: fdrMeta<ClubForm>({
				tooltip:
					"Average fixture difficulty over the next 5 gameweeks; lower is easier",
			}),
		},
		{
			id: "next_fixtures",
			accessorKey: "next_fixtures",
			enableSorting: false,
			header: "Next 5",
			cell: ({ row }) => (
				<FixtureStrip
					fixtures={row.original.next_fixtures ?? []}
					startGw={row.original.as_of_gw + 1}
				/>
			),
			meta: {
				tooltip:
					"Upcoming 5-gameweek fixture run, colour-coded by fixture difficulty",
			},
		},
	];
	const groups: Record<string, ClubColumnGroup> = {
		window_matches: "matches",
		window_xg_per_match: "xg",
		season_xg_per_match: "xg",
		delta_xg_per_match: "xg",
		window_xgc_per_match: "xgc",
		season_xgc_per_match: "xgc",
		delta_xgc_per_match: "xgc",
		attack_form: "form",
		defence_form: "form",
		window_xgd_per_match: "xgd",
		season_xgd_per_match: "xgd",
		avg_fdr: "fdr",
		next_fixtures: "fdr",
		window_finishing_delta_total: "finishing_total",
		season_finishing_delta_total: "finishing_total",
		window_finishing_delta: "finishing_rate",
		season_finishing_delta: "finishing_rate",
		window_concession_delta_total: "concession_total",
		season_concession_delta_total: "concession_total",
		window_concession_delta: "concession_rate",
		season_concession_delta: "concession_rate",
		window_goal_difference_delta_total: "goal_difference_total",
		season_goal_difference_delta_total: "goal_difference_total",
		window_goal_difference_delta: "goal_difference_rate",
		season_goal_difference_delta: "goal_difference_rate",
	};
	return columns.filter((column) => {
		const id =
			column.id ?? ("accessorKey" in column ? String(column.accessorKey) : "");
		const group = groups[id];
		return group === undefined || visibleColumns[group];
	});
}

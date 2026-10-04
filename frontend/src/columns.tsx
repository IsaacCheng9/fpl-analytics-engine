import type { Cell, CellContext, ColumnDef } from "@tanstack/react-table";
import type {
	ClubForm,
	DefconPlayer,
	DefconProbabilityPlayer,
	FormPlayer,
} from "./api";
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

// Sequential shades more-is-better metrics, diverging centres changes on zero,
// fdr uses the fixed 1-5 rating, and none leaves context columns unshaded.
type HeatScaleKind = "sequential" | "diverging" | "fdr" | "none";
type HeatCellOptions = {
	lowerIsBetter?: boolean;
	scale?: HeatScaleKind;
	format?: (value: number | null) => string;
};

// Metric columns that get heat shading. The range is computed league-wide from
// an unfiltered query so a player's colour stays fixed as you filter.
export const FORM_HEAT_KEYS = [
	"window_xg90",
	"window_xa90",
	"window_xgi90",
	"season_xg90",
	"season_xa90",
	"season_xgi90",
	"delta_xg90",
	"delta_xa90",
	"delta_xgi90",
	"window_xg90_per_million",
	"window_xa90_per_million",
	"window_xgi90_per_million",
	"season_points_per_million",
	"window_minutes",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
export const DEFCON_HEAT_KEYS = [
	"window_minutes",
	"window_games",
	"window_defcon_hits",
	"window_defcon_hit_rate",
	"window_defcon",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
export const DEFCON_PROB_HEAT_KEYS = [
	"window_minutes",
	"games",
	"hits",
	"raw_rate",
	"prob",
	"prob_std",
	"window_defcon",
	"season_points_per_million",
	"window_start_rate",
	"window_mins_per_appearance",
	"avg_fdr",
	"current_ownership",
];
export const CLUB_HEAT_KEYS = [
	"window_matches",
	"window_xg_per_match",
	"season_xg_per_match",
	"delta_xg_per_match",
	"window_goals_for_per_match",
	"season_goals_for_per_match",
	"delta_goals_for_per_match",
	"window_xgc_per_match",
	"season_xgc_per_match",
	"delta_xgc_per_match",
	"window_goals_against_per_match",
	"season_goals_against_per_match",
	"delta_goals_against_per_match",
	"window_finishing_delta",
	"season_finishing_delta",
	"window_concession_delta",
	"season_concession_delta",
	"window_finishing_delta_total",
	"season_finishing_delta_total",
	"window_concession_delta_total",
	"season_concession_delta_total",
	"attack_form",
	"defence_form",
	"avg_fdr",
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
		return <span className="text-zinc-400">-</span>;
	}
	return <span>{text}</span>;
}

// Build the text renderer for a heat-shaded cell.
function heatCell<T>(_range: Range, opts: HeatCellOptions = {}) {
	const format = opts.format ?? ((value: number | null) => fmtNum(value));
	return (info: CellContext<T, unknown>) => {
		const value = info.getValue<number | null>();
		return <HeatCell value={value} text={format(value)} />;
	};
}

function heatScale(range: Range, opts: HeatCellOptions): HeatScale | null {
	const lowerIsBetter = opts.lowerIsBetter ?? false;
	switch (opts.scale ?? "sequential") {
		case "sequential":
			return sequentialScale(range, lowerIsBetter);
		case "diverging":
			return divergingScale(range, lowerIsBetter);
		case "fdr":
			return FDR_SCALE;
		case "none":
			return null;
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
	const scale = heatScale(range, opts);
	const numericMeta = { ...meta, numeric: true };
	return scale === null
		? numericMeta
		: { ...numericMeta, cellStyle: heatCellStyle<T>(scale) };
}

function buildFormMetricColumns(
	ranges: Record<string, Range>,
	metric: AttackingMetric,
): ColumnDef<FormPlayer>[] {
	const label = ATTACKING_METRIC_LABELS[metric];
	const noun = ATTACKING_METRIC_NOUNS[metric];
	const styles = ATTACKING_METRIC_STYLES[metric];
	return (
		["window", "season", "delta", "value"] satisfies AttackingMetricColumn[]
	).map((group) => {
		const groupLabel = ATTACKING_METRIC_GROUP_LABELS[group];
		const key = ATTACKING_METRIC_KEYS[metric][group];
		const formatter: HeatCellOptions =
			group === "delta" ? { format: fmtDelta, scale: "diverging" } : {};
		const tooltip =
			group === "window"
				? `Expected ${noun} per 90 minutes over the recent window`
				: group === "season"
					? `Expected ${noun} per 90 minutes, season to date`
					: group === "delta"
						? `Window ${label} per 90 minus season ${label} per 90; positive means recent form beats the season baseline`
						: `Window ${label} per 90 divided by price`;
		const header =
			group === "value"
				? `${label} Per 90 Per £m`
				: `${groupLabel} ${label} Per 90`;
		return {
			accessorKey: key,
			header,
			cell: heatCell<FormPlayer>(ranges[key], formatter),
			meta: heatMeta<FormPlayer>(
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

function buildPlayerContextColumns<T extends TransferFilterRow>(
	ranges: Record<string, Range>,
): ColumnDef<T>[] {
	return [
		{
			accessorKey: "price",
			header: "Price",
			cell: (info) => fmtPrice(info.getValue<number | null>()),
			meta: { numeric: true },
		},
		{
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<T>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<T>(
				{
					tooltip:
						"Average fixture difficulty over the next 5 gameweeks; lower is easier",
				},
				ranges.avg_fdr,
				{ scale: "fdr" },
			),
		},
		{
			accessorKey: "current_ownership",
			header: "Owned %",
			cell: heatCell<T>(ranges.current_ownership, {
				lowerIsBetter: true,
				format: (v) => fmtPctPoints(v, 1),
			}),
			meta: heatMeta<T>(
				{
					tooltip:
						"Current ownership percentage; a live snapshot, not point-in-time",
				},
				ranges.current_ownership,
				{ scale: "none" },
			),
		},
	];
}

export function buildFormColumns(
	ranges: Record<string, Range>,
	visibleMetrics: AttackingMetricVisibility,
): ColumnDef<FormPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<FormPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<FormPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Total minutes played across the window" },
				ranges.window_minutes,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<FormPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<FormPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<FormPlayer>(ranges.window_start_rate, { format: fmtPct }),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Share of window games the player started" },
				ranges.window_start_rate,
				{ scale: "none" },
			),
		},
		...ATTACKING_METRIC_COLUMN_ORDER.filter(
			(metric) => visibleMetrics[metric],
		).flatMap((metric) => buildFormMetricColumns(ranges, metric)),
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<FormPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<FormPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

export function buildDefconColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<DefconPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<DefconPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Total minutes played across the window" },
				ranges.window_minutes,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconPlayer>(ranges.window_mins_per_appearance, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Share of window games the player started" },
				ranges.window_start_rate,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_games",
			header: "Games",
			cell: heatCell<DefconPlayer>(ranges.window_games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Eligible games in the window" },
				ranges.window_games,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_defcon_hits",
			header: "Hits",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Window games clearing the DefCon threshold" },
				ranges.window_defcon_hits,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_defcon_hit_rate",
			header: "Hit Rate",
			cell: heatCell<DefconPlayer>(ranges.window_defcon_hit_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Share of window games clearing the DefCon threshold" },
				ranges.window_defcon_hit_rate,
			),
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per game over the window",
				},
				ranges.window_defcon,
			),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconPlayer>(ranges.season_points_per_million, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

export function buildDefconProbColumns(
	ranges: Record<string, Range>,
): ColumnDef<DefconProbabilityPlayer>[] {
	return [
		{ accessorKey: "web_name", header: "Player" },
		{ accessorKey: "position", header: "Pos" },
		{ accessorKey: "team_name", header: "Team" },
		...buildPlayerContextColumns<DefconProbabilityPlayer>(ranges),
		{
			accessorKey: "window_minutes",
			header: "Mins",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_minutes, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Total minutes played across the recent window" },
				ranges.window_minutes,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_mins_per_appearance",
			header: "Mins Per App",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.window_mins_per_appearance,
				{ format: (v) => fmtNum(v, 0) },
			),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Average minutes per appearance in the recent window; 0-minute games are excluded",
				},
				ranges.window_mins_per_appearance,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_start_rate",
			header: "Start %",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_start_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Share of recent window games the player started" },
				ranges.window_start_rate,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "games",
			header: "Games",
			cell: heatCell<DefconProbabilityPlayer>(ranges.games, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Eligible appearances up to this gameweek" },
				ranges.games,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "hits",
			header: "Hits",
			cell: heatCell<DefconProbabilityPlayer>(ranges.hits, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Appearances clearing the DefCon threshold" },
				ranges.hits,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "raw_rate",
			header: "Raw Rate",
			cell: heatCell<DefconProbabilityPlayer>(ranges.raw_rate, {
				format: fmtPct,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Observed DefCon hit rate (hits / games)" },
				ranges.raw_rate,
			),
		},
		{
			accessorKey: "prob",
			header: "P(Hit | 60+ Mins)",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob, { format: fmtPct }),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Modelled probability of clearing the DefCon threshold, conditional on playing 60+ minutes",
				},
				ranges.prob,
			),
		},
		{
			accessorKey: "prob_std",
			header: "+/-",
			cell: heatCell<DefconProbabilityPlayer>(ranges.prob_std, {
				lowerIsBetter: true,
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Uncertainty (standard deviation) of the probability" },
				ranges.prob_std,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_defcon",
			header: "Avg DefCon",
			cell: heatCell<DefconProbabilityPlayer>(ranges.window_defcon, {
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<DefconProbabilityPlayer>(
				{
					tooltip:
						"Average defensive-contribution count per game over the recent window",
				},
				ranges.window_defcon,
			),
		},
		{
			accessorKey: "season_points_per_million",
			header: "Points Per £m",
			cell: heatCell<DefconProbabilityPlayer>(
				ranges.season_points_per_million,
				{ format: (v) => fmtNum(v, 1) },
			),
			meta: heatMeta<DefconProbabilityPlayer>(
				{ tooltip: "Total season points divided by price" },
				ranges.season_points_per_million,
			),
		},
	];
}

export function buildClubColumns(
	ranges: Record<string, Range>,
	visibleColumns: ClubColumnVisibility,
): ColumnDef<ClubForm>[] {
	function overperformanceColumn(
		period: "window" | "season",
		metric: "xG" | "xGC",
		total: boolean,
	): ColumnDef<ClubForm> {
		const defensive = metric === "xGC";
		const key =
			`${period}_${defensive ? "concession" : "finishing"}_delta${total ? "_total" : ""}` as const;
		const range = ranges[key];
		const label = period === "window" ? "Window" : "Season";
		return {
			id: key,
			accessorFn: (row) => {
				const value = row[key];
				// Preserve the API's conceded-minus-expected sign; show favourable values as positive.
				return value == null ? null : defensive ? -value : value;
			},
			header: `${label} ${metric} +/- ${total ? "Total" : "Per Match"}`,
			cell: heatCell<ClubForm>(range, { format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip: `${metric} over/underperformance: ${defensive ? "xGC minus goals conceded" : "goals scored minus xG"}${total ? " in total" : " per match"} ${period === "window" ? "over the recent window" : "over the season to date"}. Positive means ${defensive ? "fewer goals conceded" : "more goals scored"} than expected; negative means underperformance. Descriptive, not a prediction.`,
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
			accessorKey: "window_matches",
			header: "Matches",
			cell: heatCell<ClubForm>(ranges.window_matches, {
				format: (v) => fmtNum(v, 0),
			}),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Club matches in the recent window" },
				ranges.window_matches,
				{ scale: "none" },
			),
		},
		{
			accessorKey: "window_xg_per_match",
			header: "Window xG",
			cell: heatCell<ClubForm>(ranges.window_xg_per_match),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match over the recent window" },
				ranges.window_xg_per_match,
			),
		},
		{
			accessorKey: "season_xg_per_match",
			header: "Season xG",
			cell: heatCell<ClubForm>(ranges.season_xg_per_match),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals per match, season to date" },
				ranges.season_xg_per_match,
			),
		},
		{
			accessorKey: "delta_xg_per_match",
			header: "Delta xG",
			cell: heatCell<ClubForm>(ranges.delta_xg_per_match, {
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
						accessorKey: "window_goals_for_per_match",
						header: "Window Goals",
						cell: heatCell<ClubForm>(ranges.window_goals_for_per_match),
						meta: heatMeta<ClubForm>(
							{
								tooltip: "Goals scored per match over the recent window",
							},
							ranges.window_goals_for_per_match,
						),
					},
					{
						accessorKey: "delta_goals_for_per_match",
						header: "Delta Goals",
						cell: heatCell<ClubForm>(ranges.delta_goals_for_per_match, {
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
			accessorKey: "attack_form",
			header: "Attack Form",
			cell: heatCell<ClubForm>(ranges.attack_form, { format: fmtDelta }),
			meta: heatMeta<ClubForm>(
				{
					tooltip: "Recent xG per match improvement versus the season baseline",
				},
				ranges.attack_form,
				{ scale: "diverging" },
			),
		},
		{
			accessorKey: "window_xgc_per_match",
			header: "Window xGC",
			cell: heatCell<ClubForm>(ranges.window_xgc_per_match, {
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
			accessorKey: "season_xgc_per_match",
			header: "Season xGC",
			cell: heatCell<ClubForm>(ranges.season_xgc_per_match, {
				lowerIsBetter: true,
			}),
			meta: heatMeta<ClubForm>(
				{ tooltip: "Expected goals conceded per match, season to date" },
				ranges.season_xgc_per_match,
				{ lowerIsBetter: true },
			),
		},
		{
			accessorKey: "delta_xgc_per_match",
			header: "Delta xGC",
			cell: heatCell<ClubForm>(ranges.delta_xgc_per_match, {
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
						accessorKey: "window_goals_against_per_match",
						header: "Window Goals Conceded",
						cell: heatCell<ClubForm>(ranges.window_goals_against_per_match, {
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
						accessorKey: "delta_goals_against_per_match",
						header: "Delta Goals Conceded",
						cell: heatCell<ClubForm>(ranges.delta_goals_against_per_match, {
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
			accessorKey: "defence_form",
			header: "Defence Form",
			cell: heatCell<ClubForm>(ranges.defence_form, { format: fmtDelta }),
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
			accessorKey: "avg_fdr",
			header: "FDR (Next 5)",
			cell: heatCell<ClubForm>(ranges.avg_fdr, {
				lowerIsBetter: true,
				format: (v) => fmtNum(v, 1),
			}),
			meta: heatMeta<ClubForm>(
				{
					tooltip:
						"Average fixture difficulty over the next 5 gameweeks; lower is easier",
				},
				ranges.avg_fdr,
				{ scale: "fdr" },
			),
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
		avg_fdr: "fdr",
		window_finishing_delta_total: "finishing_total",
		season_finishing_delta_total: "finishing_total",
		window_finishing_delta: "finishing_rate",
		season_finishing_delta: "finishing_rate",
		window_concession_delta_total: "concession_total",
		season_concession_delta_total: "concession_total",
		window_concession_delta: "concession_rate",
		season_concession_delta: "concession_rate",
	};
	return columns.filter((column) => {
		const id =
			column.id ?? ("accessorKey" in column ? String(column.accessorKey) : "");
		const group = groups[id];
		return group === undefined || visibleColumns[group];
	});
}

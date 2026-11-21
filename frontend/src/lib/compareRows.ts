import type {
	ClubForm,
	DefconPlayer,
	DefconProbabilityPlayer,
	FormPlayer,
	PlayerDetail,
	PlayerGameweek,
	PlayerSeasonSummary,
} from "../api";
import type { PlayerOption } from "../components/PlayerCombobox";
import { fmtDelta, fmtNum, fmtPct, fmtPctPoints, fmtPrice } from "./format";

const PARTIAL_SEASON = "2022-23";

export type CompareSide = {
	option: PlayerOption | undefined;
	form: FormPlayer | undefined;
	defcon: DefconPlayer | undefined;
	defconProb: DefconProbabilityPlayer | undefined;
	club: ClubForm | undefined;
	detail: PlayerDetail | undefined;
};

export type CompareRow = {
	section: string;
	label: string;
	left: string;
	right: string;
	leftValue?: number | null;
	rightValue?: number | null;
	lowerIsBetter?: boolean;
};

type CompareRowOptions = Pick<
	CompareRow,
	"leftValue" | "rightValue" | "lowerIsBetter"
>;

type SummaryMetricKey = "xgi" | "xg" | "xa";

type GameweekRange = {
	start: number;
	end: number;
};

type PeriodSummary = {
	games: number;
	minutes: number;
	minsPerAppearance: number | null;
	points: number;
	price: number | null;
	xg: number | null;
	xa: number | null;
	xgi: number | null;
	xg90: number | null;
	xa90: number | null;
	xgi90: number | null;
	xg90PerMillion: number | null;
	xa90PerMillion: number | null;
	xgi90PerMillion: number | null;
	pointsPerMillion: number | null;
	defcon: number | null;
	defconGames: number | null;
	defconHits: number | null;
	defconHitRate: number | null;
};

type DeltaMetricKey = "delta_xgi90" | "delta_xg90" | "delta_xa90";

const DELTA_COMPARE_METRICS = [
	{ label: "xGI", delta: "delta_xgi90" },
	{ label: "xG", delta: "delta_xg90" },
	{ label: "xA", delta: "delta_xa90" },
] as const satisfies ReadonlyArray<{
	label: string;
	delta: DeltaMetricKey;
}>;

const SUMMARY_ATTACKING_METRICS = [
	{
		label: "xGI",
		total: "xgi",
		per90: "xgi90",
		perMillion: "xgi90PerMillion",
	},
	{
		label: "xG",
		total: "xg",
		per90: "xg90",
		perMillion: "xg90PerMillion",
	},
	{
		label: "xA",
		total: "xa",
		per90: "xa90",
		perMillion: "xa90PerMillion",
	},
] as const satisfies ReadonlyArray<{
	label: string;
	total: SummaryMetricKey;
	per90: `${SummaryMetricKey}90`;
	perMillion: `${SummaryMetricKey}90PerMillion`;
}>;

function comparable(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gameweekRange(window: number, asOfGw: number): GameweekRange {
	return {
		start: Math.max(1, asOfGw - window + 1),
		end: asOfGw,
	};
}

function rangeLabel(range: GameweekRange): string {
	return range.start === range.end
		? `GW${range.end}`
		: `GW${range.start}-GW${range.end}`;
}

function gameweeksInRange(
	detail: PlayerDetail | undefined,
	range: GameweekRange,
): PlayerGameweek[] {
	return (detail?.gameweeks ?? []).filter(
		(gameweek) => gameweek.round >= range.start && gameweek.round <= range.end,
	);
}

function seasonGameweeks(
	detail: PlayerDetail | undefined,
	asOfGw: number,
): PlayerGameweek[] {
	return (detail?.gameweeks ?? []).filter(
		(gameweek) => gameweek.round <= asOfGw,
	);
}

function latestPrice(gameweeks: PlayerGameweek[]): number | null {
	return (
		[...gameweeks].reverse().find((gameweek) => gameweek.price !== null)
			?.price ?? null
	);
}

function sumGameweekMetric(
	gameweeks: PlayerGameweek[],
	key: keyof PlayerGameweek,
): number | null {
	const values = gameweeks
		.map((gameweek) => gameweek[key])
		.filter(
			(value): value is number =>
				typeof value === "number" && Number.isFinite(value),
		);
	if (values.length === 0) {
		return null;
	}
	return values.reduce((total, value) => total + value, 0);
}

function minutesWithMetric(
	gameweeks: PlayerGameweek[],
	key: keyof PlayerGameweek,
): number {
	return gameweeks.reduce(
		(total, gameweek) =>
			typeof gameweek[key] === "number" ? total + gameweek.minutes : total,
		0,
	);
}

function per90(
	gameweeks: PlayerGameweek[],
	key: keyof PlayerGameweek,
	total: number | null,
): number | null {
	const minutes = minutesWithMetric(gameweeks, key);
	if (total === null || minutes === 0) {
		return null;
	}
	return (total / minutes) * 90;
}

function ratioPerMillion(
	value: number | null,
	price: number | null,
): number | null {
	return value === null || price === null || price === 0 ? null : value / price;
}

function summariseGameweeks(
	gameweeks: PlayerGameweek[],
	priceGameweeks: PlayerGameweek[] = gameweeks,
): PeriodSummary {
	const appearances = gameweeks.filter((gameweek) => gameweek.minutes > 0);
	const minutes = gameweeks.reduce(
		(total, gameweek) => total + gameweek.minutes,
		0,
	);
	const points = gameweeks.reduce(
		(total, gameweek) => total + gameweek.total_points,
		0,
	);
	const price = latestPrice(priceGameweeks);
	const xg = sumGameweekMetric(gameweeks, "expected_goals");
	const xa = sumGameweekMetric(gameweeks, "expected_assists");
	const xgi = sumGameweekMetric(gameweeks, "expected_goal_involvements");
	const xg90 = per90(gameweeks, "expected_goals", xg);
	const xa90 = per90(gameweeks, "expected_assists", xa);
	const xgi90 = per90(gameweeks, "expected_goal_involvements", xgi);
	const defcon = sumGameweekMetric(appearances, "defensive_contribution");
	const defconGames = appearances.filter(
		(gameweek) => gameweek.defcon_hit !== null,
	);
	const defconHits = defconGames.filter((gameweek) => gameweek.defcon_hit);

	return {
		games: appearances.length,
		minutes,
		minsPerAppearance:
			appearances.length === 0 ? null : minutes / appearances.length,
		points,
		price,
		xg,
		xa,
		xgi,
		xg90,
		xa90,
		xgi90,
		xg90PerMillion: ratioPerMillion(xg90, price),
		xa90PerMillion: ratioPerMillion(xa90, price),
		xgi90PerMillion: ratioPerMillion(xgi90, price),
		pointsPerMillion: ratioPerMillion(points, price),
		defcon,
		defconGames: defconGames.length === 0 ? null : defconGames.length,
		defconHits: defconGames.length === 0 ? null : defconHits.length,
		defconHitRate:
			defconGames.length === 0 ? null : defconHits.length / defconGames.length,
	};
}

// Prefer backend-computed FormPlayer and DefconPlayer aggregates whenever they
// match the comparison gameweek so Compare never drifts from the main tables.
// Appearance counts and raw window totals (not exposed on FormPlayer) come from
// the player detail gameweeks so Games, Mins Per App, and DefCon Games all stay
// consistently scoped to minutes > 0 appearances.
function buildWindowSummary(
	side: CompareSide,
	windowRange: GameweekRange,
	comparisonGw: number,
): PeriodSummary {
	const seasonGws = seasonGameweeks(side.detail, comparisonGw);
	const fallback = summariseGameweeks(
		gameweeksInRange(side.detail, windowRange),
		seasonGws,
	);
	const form = side.form?.as_of_gw === comparisonGw ? side.form : undefined;
	const defcon =
		side.defcon?.as_of_gw === comparisonGw ? side.defcon : undefined;
	const price = form !== undefined ? form.price : fallback.price;
	// Backend window_defcon_games/hits return 0 when no appearances qualify;
	// map zero qualifying appearances to null to match the empty-state display.
	const hasBackendDefcon =
		defcon !== undefined && (defcon.window_defcon_games ?? 0) > 0;

	return {
		...fallback,
		minutes: form !== undefined ? form.window_minutes : fallback.minutes,
		minsPerAppearance:
			form !== undefined
				? form.window_mins_per_appearance
				: fallback.minsPerAppearance,
		price,
		pointsPerMillion: ratioPerMillion(fallback.points, price),
		xg90: form !== undefined ? form.window_xg90 : fallback.xg90,
		xa90: form !== undefined ? form.window_xa90 : fallback.xa90,
		xgi90: form !== undefined ? form.window_xgi90 : fallback.xgi90,
		xg90PerMillion:
			form !== undefined
				? form.window_xg90_per_million
				: fallback.xg90PerMillion,
		xa90PerMillion:
			form !== undefined
				? form.window_xa90_per_million
				: fallback.xa90PerMillion,
		xgi90PerMillion:
			form !== undefined
				? form.window_xgi90_per_million
				: fallback.xgi90PerMillion,
		defconGames:
			defcon !== undefined
				? hasBackendDefcon
					? defcon.window_defcon_games
					: null
				: fallback.defconGames,
		defconHits:
			defcon !== undefined
				? hasBackendDefcon
					? defcon.window_defcon_hits
					: null
				: fallback.defconHits,
		defconHitRate:
			defcon !== undefined
				? hasBackendDefcon
					? defcon.window_defcon_hit_rate
					: null
				: fallback.defconHitRate,
	};
}

function buildSeasonSummary(
	side: CompareSide,
	comparisonGw: number,
): PeriodSummary {
	const fallback = summariseGameweeks(
		seasonGameweeks(side.detail, comparisonGw),
	);
	const form = side.form?.as_of_gw === comparisonGw ? side.form : undefined;
	const backendSeason =
		side.detail?.as_of_gw === comparisonGw
			? side.detail.seasons.find(
					(summary) => summary.season === side.detail?.selected_season,
				)
			: undefined;
	const price = form !== undefined ? form.price : fallback.price;
	const minutes =
		backendSeason !== undefined ? backendSeason.minutes : fallback.minutes;
	const xg90 =
		form !== undefined
			? form.season_xg90
			: backendSeason !== undefined
				? backendSeason.xg90
				: fallback.xg90;
	const xa90 =
		form !== undefined
			? form.season_xa90
			: backendSeason !== undefined
				? backendSeason.xa90
				: fallback.xa90;
	const xgi90 =
		form !== undefined
			? form.season_xgi90
			: backendSeason !== undefined
				? backendSeason.xgi90
				: fallback.xgi90;
	const pointsPerMillion =
		form !== undefined
			? form.season_points_per_million
			: backendSeason !== undefined
				? backendSeason.points_per_million
				: fallback.pointsPerMillion;

	return {
		...fallback,
		// Keep games and minsPerAppearance scoped to minutes > 0 appearances
		// (backend season_summaries.games counts all fixture rows including DNPs).
		minutes,
		minsPerAppearance: fallback.games === 0 ? null : minutes / fallback.games,
		points:
			backendSeason !== undefined ? backendSeason.points : fallback.points,
		price,
		pointsPerMillion,
		xg90,
		xa90,
		xgi90,
		xg90PerMillion: ratioPerMillion(xg90, price),
		xa90PerMillion: ratioPerMillion(xa90, price),
		xgi90PerMillion: ratioPerMillion(xgi90, price),
		defconHitRate:
			backendSeason !== undefined
				? backendSeason.defcon_hit_rate
				: fallback.defconHitRate,
	};
}

function seasonByName(
	detail: PlayerDetail | undefined,
	season: string,
): PlayerSeasonSummary | undefined {
	return detail?.seasons.find((summary) => summary.season === season);
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values)).sort((left, right) =>
		right.localeCompare(left),
	);
}

export function buildCompareRows(
	left: CompareSide,
	right: CompareSide,
	window: number,
	asOfGw: number | null,
	latestGw: number,
): CompareRow[] {
	const rows: CompareRow[] = [];
	const comparisonGw = asOfGw ?? latestGw;
	const windowRange = gameweekRange(window, comparisonGw);
	const leftWindow = buildWindowSummary(left, windowRange, comparisonGw);
	const rightWindow = buildWindowSummary(right, windowRange, comparisonGw);
	const leftSeason = buildSeasonSummary(left, comparisonGw);
	const rightSeason = buildSeasonSummary(right, comparisonGw);

	function add(
		section: string,
		label: string,
		leftValue: string,
		rightValue: string,
		options: CompareRowOptions = {},
	) {
		rows.push({
			section,
			label,
			left: leftValue,
			right: rightValue,
			...options,
		});
	}

	function addNumber(
		section: string,
		label: string,
		leftValue: number | null | undefined,
		rightValue: number | null | undefined,
		{
			format = fmtNum,
			lowerIsBetter = false,
		}: {
			format?: (value: number | null | undefined) => string;
			lowerIsBetter?: boolean;
		} = {},
	) {
		add(section, label, format(leftValue), format(rightValue), {
			leftValue: comparable(leftValue),
			rightValue: comparable(rightValue),
			lowerIsBetter,
		});
	}

	function addHitRate(
		section: string,
		label: string,
		leftValue: number | null | undefined,
		rightValue: number | null | undefined,
	) {
		add(
			section,
			label,
			leftValue === null || leftValue === undefined ? "n/a" : fmtPct(leftValue),
			rightValue === null || rightValue === undefined
				? "n/a"
				: fmtPct(rightValue),
			{
				leftValue: comparable(leftValue),
				rightValue: comparable(rightValue),
			},
		);
	}

	function addSummary(
		section: string,
		prefix: string,
		leftSummary: PeriodSummary,
		rightSummary: PeriodSummary,
	) {
		addNumber(
			section,
			`${prefix} Games`,
			leftSummary.games,
			rightSummary.games,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} Minutes`,
			leftSummary.minutes,
			rightSummary.minutes,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} Mins Per App`,
			leftSummary.minsPerAppearance,
			rightSummary.minsPerAppearance,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} Points`,
			leftSummary.points,
			rightSummary.points,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} Points Per \u00a3m`,
			leftSummary.pointsPerMillion,
			rightSummary.pointsPerMillion,
			{ format: (value) => fmtNum(value, 1) },
		);
		for (const metric of SUMMARY_ATTACKING_METRICS) {
			addNumber(
				section,
				`${prefix} ${metric.label}`,
				leftSummary[metric.total],
				rightSummary[metric.total],
			);
			addNumber(
				section,
				`${prefix} ${metric.label} Per 90`,
				leftSummary[metric.per90],
				rightSummary[metric.per90],
			);
			addNumber(
				section,
				`${prefix} ${metric.label} Per 90 Per \u00a3m`,
				leftSummary[metric.perMillion],
				rightSummary[metric.perMillion],
			);
		}
		addNumber(
			section,
			`${prefix} DefCon`,
			leftSummary.defcon,
			rightSummary.defcon,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} DefCon Games`,
			leftSummary.defconGames,
			rightSummary.defconGames,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} DefCon Hits`,
			leftSummary.defconHits,
			rightSummary.defconHits,
			{ format: (value) => fmtNum(value, 0) },
		);
		addHitRate(
			section,
			`${prefix} DefCon Hit Rate`,
			leftSummary.defconHitRate,
			rightSummary.defconHitRate,
		);
	}

	add(
		"Player",
		"Player",
		left.detail?.web_name ?? left.option?.web_name ?? "-",
		right.detail?.web_name ?? right.option?.web_name ?? "-",
	);
	add(
		"Player",
		"Position",
		left.detail?.position ?? "-",
		right.detail?.position ?? "-",
	);
	add(
		"Player",
		"Team",
		left.detail?.team_name ?? "-",
		right.detail?.team_name ?? "-",
	);
	addNumber("Player", "Price", left.form?.price, right.form?.price, {
		format: fmtPrice,
		lowerIsBetter: true,
	});
	addNumber(
		"Player",
		"Owned %",
		left.form?.current_ownership,
		right.form?.current_ownership,
		{ format: (value) => fmtPctPoints(value, 1), lowerIsBetter: true },
	);
	addNumber("Player", "FDR (Next 5)", left.form?.avg_fdr, right.form?.avg_fdr, {
		format: (value) => fmtNum(value, 1),
		lowerIsBetter: true,
	});
	addNumber(
		"Projection",
		"Projected xGI",
		left.form?.projected_xgi,
		right.form?.projected_xgi,
	);
	addNumber(
		"Projection",
		"Projected Mins",
		left.form?.projected_minutes,
		right.form?.projected_minutes,
		{ format: (value) => fmtNum(value, 0) },
	);
	addNumber(
		"Projection",
		"Est. xGI Per 90",
		left.form?.est_xgi90,
		right.form?.est_xgi90,
	);

	const windowRangeText = rangeLabel(windowRange);
	add("Selected Window", "Window Range", windowRangeText, windowRangeText);
	addSummary("Selected Window", "Window", leftWindow, rightWindow);
	addNumber(
		"Selected Window",
		"Window Start %",
		left.form?.window_start_rate,
		right.form?.window_start_rate,
		{ format: fmtPct },
	);

	const seasonRangeText = rangeLabel({ start: 1, end: comparisonGw });
	add("Season To Date", "Season Range", seasonRangeText, seasonRangeText);
	addSummary("Season To Date", "Season", leftSeason, rightSeason);

	// Deltas are descriptive, so neither side is highlighted as the winner.
	for (const metric of DELTA_COMPARE_METRICS) {
		add(
			"Recent Vs Season",
			`Delta ${metric.label} Per 90`,
			fmtDelta(left.form?.[metric.delta]),
			fmtDelta(right.form?.[metric.delta]),
		);
	}
	addNumber(
		"Recent Vs Season",
		"Upcoming Fixtures",
		left.form?.upcoming_fixtures,
		right.form?.upcoming_fixtures,
		{ format: (value) => fmtNum(value, 0) },
	);

	addNumber(
		"DefCon",
		"Raw DefCon Hit Rate",
		left.defconProb?.raw_rate,
		right.defconProb?.raw_rate,
		{ format: fmtPct },
	);
	addNumber(
		"DefCon",
		"P(Hit | 60+ Mins)",
		left.defconProb?.prob,
		right.defconProb?.prob,
		{ format: fmtPct },
	);

	addNumber(
		"Club Form",
		"Attack Form",
		left.club?.attack_form,
		right.club?.attack_form,
		{ format: fmtDelta },
	);
	addNumber(
		"Club Form",
		"Defence Form",
		left.club?.defence_form,
		right.club?.defence_form,
		{ format: fmtDelta },
	);
	addNumber(
		"Club Form",
		"Window Club xG Per Match",
		left.club?.window_xg_per_match,
		right.club?.window_xg_per_match,
	);
	addNumber(
		"Club Form",
		"Season Club xG Per Match",
		left.club?.season_xg_per_match,
		right.club?.season_xg_per_match,
	);
	addNumber(
		"Club Form",
		"Delta Club xG Per Match",
		left.club?.delta_xg_per_match,
		right.club?.delta_xg_per_match,
		{ format: fmtDelta },
	);
	addNumber(
		"Club Form",
		"Window Club xGC Per Match",
		left.club?.window_xgc_per_match,
		right.club?.window_xgc_per_match,
		{ lowerIsBetter: true },
	);
	addNumber(
		"Club Form",
		"Season Club xGC Per Match",
		left.club?.season_xgc_per_match,
		right.club?.season_xgc_per_match,
		{ lowerIsBetter: true },
	);
	addNumber(
		"Club Form",
		"Delta Club xGC Per Match",
		left.club?.delta_xgc_per_match,
		right.club?.delta_xgc_per_match,
		{ format: fmtDelta, lowerIsBetter: true },
	);

	const seasons = uniqueSorted([
		...(left.detail?.seasons.map((season) => season.season) ?? []),
		...(right.detail?.seasons.map((season) => season.season) ?? []),
	]);
	const selectedSeasons = new Set(
		[left.detail?.selected_season, right.detail?.selected_season].filter(
			(season): season is string => Boolean(season),
		),
	);
	for (const season of seasons) {
		if (selectedSeasons.has(season)) {
			continue;
		}
		const leftSummary = seasonByName(left.detail, season);
		const rightSummary = seasonByName(right.detail, season);
		const suffix = season === PARTIAL_SEASON ? " (GW16+)" : "";
		addNumber(
			"Season History",
			`${season} Games`,
			leftSummary?.games,
			rightSummary?.games,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			"Season History",
			`${season} Minutes`,
			leftSummary?.minutes,
			rightSummary?.minutes,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			"Season History",
			`${season} Points`,
			leftSummary?.points,
			rightSummary?.points,
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			"Season History",
			`${season} xG Per 90${suffix}`,
			leftSummary?.xg90,
			rightSummary?.xg90,
		);
		addNumber(
			"Season History",
			`${season} xA Per 90${suffix}`,
			leftSummary?.xa90,
			rightSummary?.xa90,
		);
		addNumber(
			"Season History",
			`${season} xGI Per 90${suffix}`,
			leftSummary?.xgi90,
			rightSummary?.xgi90,
		);
		addNumber(
			"Season History",
			`${season} Points Per \u00a3m`,
			leftSummary?.points_per_million,
			rightSummary?.points_per_million,
			{ format: (value) => fmtNum(value, 1) },
		);
		add(
			"Season History",
			`${season} DefCon Hit Rate`,
			leftSummary?.defcon_hit_rate === null
				? "n/a"
				: fmtPct(leftSummary?.defcon_hit_rate),
			rightSummary?.defcon_hit_rate === null
				? "n/a"
				: fmtPct(rightSummary?.defcon_hit_rate),
			{
				leftValue: comparable(leftSummary?.defcon_hit_rate),
				rightValue: comparable(rightSummary?.defcon_hit_rate),
			},
		);
	}

	return rows;
}

export function winningSide(row: CompareRow): "left" | "right" | null {
	if (
		row.leftValue === undefined ||
		row.leftValue === null ||
		row.rightValue === undefined ||
		row.rightValue === null ||
		row.leftValue === row.rightValue
	) {
		return null;
	}
	if (row.lowerIsBetter) {
		return row.leftValue < row.rightValue ? "left" : "right";
	}
	return row.leftValue > row.rightValue ? "left" : "right";
}

import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
	type ClubForm,
	type DefconPlayer,
	type DefconProbabilityPlayer,
	type FormPlayer,
	fetchPlayerDetail,
	type PlayerDetail,
	type PlayerGameweek,
	type PlayerSeasonSummary,
} from "../api";
import {
	fmtDelta,
	fmtNum,
	fmtPct,
	fmtPctPoints,
	fmtPrice,
} from "../lib/format";

const PARTIAL_SEASON = "2022-23";

type PlayerOption = Pick<
	FormPlayer,
	"element" | "web_name" | "position" | "team_name"
>;

type CompareSide = {
	option: PlayerOption | undefined;
	form: FormPlayer | undefined;
	defcon: DefconPlayer | undefined;
	defconProb: DefconProbabilityPlayer | undefined;
	club: ClubForm | undefined;
	detail: PlayerDetail | undefined;
};

type CompareRow = {
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

type GameweekSummary = {
	games: number;
	minutes: number;
	points: number;
	price: number | null;
	xg: number | null;
	xa: number | null;
	xgi: number | null;
	xg90: number | null;
	xa90: number | null;
	xgi90: number | null;
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
	{ label: "xGI", total: "xgi", per90: "xgi90" },
	{ label: "xG", total: "xg", per90: "xg90" },
	{ label: "xA", total: "xa", per90: "xa90" },
] as const satisfies ReadonlyArray<{
	label: string;
	total: SummaryMetricKey;
	per90: `${SummaryMetricKey}90`;
}>;

function playerOptionLabel(option: PlayerOption): string {
	return `${option.web_name} - ${option.team_name ?? "No Team"} - ${option.position ?? "-"}`;
}

function comparable(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function selectedGameweeks(
	detail: PlayerDetail | undefined,
	asOfGw: number | null,
): PlayerGameweek[] {
	return (detail?.gameweeks ?? []).filter(
		(gameweek) => asOfGw === null || gameweek.round <= asOfGw,
	);
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

function summariseGameweeks(
	gameweeks: PlayerGameweek[],
	priceGameweeks: PlayerGameweek[] = gameweeks,
): GameweekSummary {
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
	const defcon = sumGameweekMetric(gameweeks, "defensive_contribution");
	const defconGames = gameweeks.filter(
		(gameweek) => gameweek.defcon_hit !== null,
	);
	const defconHits = defconGames.filter((gameweek) => gameweek.defcon_hit);

	return {
		games: appearances.length,
		minutes,
		points,
		price,
		xg,
		xa,
		xgi,
		xg90: per90(gameweeks, "expected_goals", xg),
		xa90: per90(gameweeks, "expected_assists", xa),
		xgi90: per90(gameweeks, "expected_goal_involvements", xgi),
		pointsPerMillion: price == null || price === 0 ? null : points / price,
		defcon,
		defconGames: defconGames.length === 0 ? null : defconGames.length,
		defconHits: defconGames.length === 0 ? null : defconHits.length,
		defconHitRate:
			defconGames.length === 0 ? null : defconHits.length / defconGames.length,
	};
}

function pointInTimeSeasonSummary(
	detail: PlayerDetail | undefined,
	asOfGw: number | null,
): PlayerSeasonSummary | undefined {
	if (!detail) {
		return undefined;
	}
	const gameweeks = selectedGameweeks(detail, asOfGw);
	const summary = summariseGameweeks(gameweeks);

	return {
		season: detail.selected_season,
		games: summary.games,
		minutes: summary.minutes,
		points: summary.points,
		xg90: summary.xg90,
		xa90: summary.xa90,
		xgi90: summary.xgi90,
		points_per_million: summary.pointsPerMillion,
		defcon_hit_rate: summary.defconHitRate,
	};
}

function seasonByName(
	detail: PlayerDetail | undefined,
	season: string,
	asOfGw: number | null,
): PlayerSeasonSummary | undefined {
	if (detail?.selected_season === season) {
		return pointInTimeSeasonSummary(detail, asOfGw);
	}
	return detail?.seasons.find((summary) => summary.season === season);
}

function uniqueSorted(values: Array<number | string>): Array<number | string> {
	return Array.from(new Set(values)).sort((left, right) => {
		if (typeof left === "number" && typeof right === "number") {
			return left - right;
		}
		return String(right).localeCompare(String(left));
	});
}

function buildCompareRows(
	left: CompareSide,
	right: CompareSide,
	window: number,
	asOfGw: number | null,
	latestGw: number,
): CompareRow[] {
	const rows: CompareRow[] = [];
	const comparisonGw = asOfGw ?? latestGw;
	const windowRange = gameweekRange(window, comparisonGw);
	const leftSeasonGameweeks = seasonGameweeks(left.detail, comparisonGw);
	const rightSeasonGameweeks = seasonGameweeks(right.detail, comparisonGw);
	const leftWindow = summariseGameweeks(
		gameweeksInRange(left.detail, windowRange),
		leftSeasonGameweeks,
	);
	const rightWindow = summariseGameweeks(
		gameweeksInRange(right.detail, windowRange),
		rightSeasonGameweeks,
	);
	const leftSeason = summariseGameweeks(leftSeasonGameweeks);
	const rightSeason = summariseGameweeks(rightSeasonGameweeks);

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

	function metricPerMillion(
		summary: GameweekSummary,
		metric: (typeof SUMMARY_ATTACKING_METRICS)[number],
	): number | null {
		const per90Value = summary[metric.per90];
		if (per90Value === null || summary.price === null || summary.price === 0) {
			return null;
		}
		return per90Value / summary.price;
	}

	function minsPerAppearance(summary: GameweekSummary): number | null {
		return summary.games === 0 ? null : summary.minutes / summary.games;
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
		leftSummary: GameweekSummary,
		rightSummary: GameweekSummary,
	) {
		addNumber(
			section,
			`${prefix} Games`,
			leftSummary.games,
			rightSummary.games,
			{
				format: (value) => fmtNum(value, 0),
			},
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
			minsPerAppearance(leftSummary),
			minsPerAppearance(rightSummary),
			{ format: (value) => fmtNum(value, 0) },
		);
		addNumber(
			section,
			`${prefix} Points`,
			leftSummary.points,
			rightSummary.points,
			{
				format: (value) => fmtNum(value, 0),
			},
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
				metricPerMillion(leftSummary, metric),
				metricPerMillion(rightSummary, metric),
			);
		}
		addNumber(
			section,
			`${prefix} DefCon`,
			leftSummary.defcon,
			rightSummary.defcon,
			{
				format: (value) => fmtNum(value, 0),
			},
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

	for (const metric of DELTA_COMPARE_METRICS) {
		addNumber(
			"Recent Vs Season",
			`Delta ${metric.label} Per 90`,
			left.form?.[metric.delta],
			right.form?.[metric.delta],
			{ format: fmtDelta },
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
		"DefCon",
		"Probability Std",
		left.defconProb?.prob_std,
		right.defconProb?.prob_std,
		{ lowerIsBetter: true },
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
	]) as string[];
	const selectedSeasons = new Set(
		[left.detail?.selected_season, right.detail?.selected_season].filter(
			(season): season is string => Boolean(season),
		),
	);
	for (const season of seasons) {
		if (selectedSeasons.has(season)) {
			continue;
		}
		const leftSummary = seasonByName(left.detail, season, asOfGw);
		const rightSummary = seasonByName(right.detail, season, asOfGw);
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

function PlayerSelect({
	id,
	label,
	options,
	value,
	onChange,
}: {
	id: string;
	label: string;
	options: PlayerOption[];
	value: number | null;
	onChange: (element: number | null) => void;
}) {
	const selected = options.find((option) => option.element === value);
	const selectedLabel = selected ? playerOptionLabel(selected) : "";
	const [input, setInput] = useState(selectedLabel);

	useEffect(() => {
		setInput(selectedLabel);
	}, [selectedLabel]);

	function handleInputChange(nextValue: string) {
		setInput(nextValue);
		if (nextValue.trim() === "") {
			onChange(null);
			return;
		}
		const match = options.find(
			(option) => playerOptionLabel(option) === nextValue,
		);
		if (match) {
			onChange(match.element);
		}
	}

	return (
		<label className="flex min-w-0 flex-1 flex-col text-xs font-medium text-zinc-600">
			{label}
			<input
				type="search"
				list={`${id}-options`}
				className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
				value={input}
				onChange={(event) => handleInputChange(event.target.value)}
				onBlur={() => setInput(selectedLabel)}
			/>
			<datalist id={`${id}-options`}>
				{options.map((option) => (
					<option key={option.element} value={playerOptionLabel(option)} />
				))}
			</datalist>
		</label>
	);
}

function winningSide(row: CompareRow): "left" | "right" | null {
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

function valueCellClass(row: CompareRow, side: "left" | "right"): string {
	return winningSide(row) === side
		? "bg-emerald-50 font-semibold text-emerald-800"
		: "text-zinc-900";
}

export function PlayerComparePanel({
	playerOptions,
	formPlayers,
	defconPlayers,
	defconProbabilityPlayers,
	clubForms,
	contextLoading,
	contextError,
	leftElement,
	rightElement,
	window,
	asOfGw,
	latestGw,
	onWindowChange,
	onAsOfGwChange,
	onLeftChange,
	onRightChange,
	onClose,
}: {
	playerOptions: PlayerOption[];
	formPlayers: FormPlayer[];
	defconPlayers: DefconPlayer[];
	defconProbabilityPlayers: DefconProbabilityPlayer[];
	clubForms: ClubForm[];
	contextLoading: boolean;
	contextError: boolean;
	leftElement: number | null;
	rightElement: number | null;
	window: number;
	asOfGw: number | null;
	latestGw: number;
	onWindowChange: (window: number) => void;
	onAsOfGwChange: (gameweek: number | null) => void;
	onLeftChange: (element: number | null) => void;
	onRightChange: (element: number | null) => void;
	onClose: () => void;
}) {
	const leftQuery = useQuery({
		queryKey: ["comparePlayer", leftElement, window, asOfGw],
		queryFn: () =>
			fetchPlayerDetail(leftElement as number, window, null, asOfGw),
		enabled: leftElement !== null,
	});
	const rightQuery = useQuery({
		queryKey: ["comparePlayer", rightElement, window, asOfGw],
		queryFn: () =>
			fetchPlayerDetail(rightElement as number, window, null, asOfGw),
		enabled: rightElement !== null,
	});

	const left = useMemo<CompareSide>(
		() => ({
			option: playerOptions.find((player) => player.element === leftElement),
			form: formPlayers.find((player) => player.element === leftElement),
			defcon: defconPlayers.find((player) => player.element === leftElement),
			defconProb: defconProbabilityPlayers.find(
				(player) => player.element === leftElement,
			),
			club: clubForms.find(
				(club) =>
					club.team_name ===
					(formPlayers.find((player) => player.element === leftElement)
						?.team_name ?? leftQuery.data?.team_name),
			),
			detail: leftQuery.data,
		}),
		[
			playerOptions,
			formPlayers,
			defconPlayers,
			defconProbabilityPlayers,
			clubForms,
			leftElement,
			leftQuery.data,
		],
	);
	const right = useMemo<CompareSide>(
		() => ({
			option: playerOptions.find((player) => player.element === rightElement),
			form: formPlayers.find((player) => player.element === rightElement),
			defcon: defconPlayers.find((player) => player.element === rightElement),
			defconProb: defconProbabilityPlayers.find(
				(player) => player.element === rightElement,
			),
			club: clubForms.find(
				(club) =>
					club.team_name ===
					(formPlayers.find((player) => player.element === rightElement)
						?.team_name ?? rightQuery.data?.team_name),
			),
			detail: rightQuery.data,
		}),
		[
			playerOptions,
			formPlayers,
			defconPlayers,
			defconProbabilityPlayers,
			clubForms,
			rightElement,
			rightQuery.data,
		],
	);
	const rows = useMemo(
		() => buildCompareRows(left, right, window, asOfGw, latestGw),
		[left, right, window, asOfGw, latestGw],
	);
	const canCompare = leftElement !== null && rightElement !== null;
	const isLoading =
		canCompare &&
		(contextLoading || leftQuery.isPending || rightQuery.isPending);
	const isError = contextError || leftQuery.isError || rightQuery.isError;

	return (
		<div className="fixed inset-0 z-40 overflow-y-auto p-4">
			<button
				type="button"
				aria-label="Close player compare"
				className="fixed inset-0 cursor-default bg-black/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="player-compare-title"
				className="relative mx-auto mt-6 w-full max-w-6xl rounded-lg bg-white p-5 shadow-xl"
			>
				<div className="mb-4 flex items-start justify-between gap-4">
					<div>
						<h2 id="player-compare-title" className="font-semibold text-xl">
							Compare Players
						</h2>
						<p className="mt-1 text-sm text-zinc-500">
							As Of GW {asOfGw ?? latestGw}, Window {window} Gameweeks
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-sm text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-50"
					>
						Close
					</button>
				</div>

				<div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
					<PlayerSelect
						id="compare-left-player"
						label="First Player"
						options={playerOptions}
						value={leftElement}
						onChange={onLeftChange}
					/>
					<PlayerSelect
						id="compare-right-player"
						label="Second Player"
						options={playerOptions}
						value={rightElement}
						onChange={onRightChange}
					/>
					<label className="flex min-w-28 flex-col text-xs font-medium text-zinc-600">
						Window (Gameweeks)
						<select
							className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
							value={window}
							onChange={(event) => onWindowChange(Number(event.target.value))}
						>
							{Array.from({ length: 19 }, (_, index) => index + 2).map(
								(value) => (
									<option key={value} value={value}>
										{value}
									</option>
								),
							)}
						</select>
					</label>
					<label className="flex min-w-28 flex-col text-xs font-medium text-zinc-600">
						As Of GW
						<select
							className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
							value={asOfGw ?? ""}
							onChange={(event) =>
								onAsOfGwChange(
									event.target.value === "" ? null : Number(event.target.value),
								)
							}
						>
							<option value="">Latest ({latestGw})</option>
							{Array.from(
								{ length: latestGw },
								(_, index) => latestGw - index,
							).map((gameweek) => (
								<option key={gameweek} value={gameweek}>
									{gameweek}
								</option>
							))}
						</select>
					</label>
				</div>

				{!canCompare ? (
					<p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500">
						Select two players to compare.
					</p>
				) : isLoading ? (
					<p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500">
						Loading comparison...
					</p>
				) : isError ? (
					<p className="rounded-md border border-red-200 bg-red-50 px-3 py-6 text-center text-red-700 text-sm">
						Failed to load player comparison.
					</p>
				) : (
					<div className="max-h-[70vh] overflow-auto rounded-md border border-zinc-200">
						<table className="w-full min-w-[44rem] border-collapse text-sm">
							<thead className="sticky top-0 z-20 bg-zinc-100 text-left text-zinc-600">
								<tr>
									<th className="w-1/3 px-3 py-2 font-medium">Stat</th>
									<th className="w-1/3 px-3 py-2 font-medium">
										{left.detail?.web_name ??
											left.option?.web_name ??
											"Player 1"}
									</th>
									<th className="w-1/3 px-3 py-2 font-medium">
										{right.detail?.web_name ??
											right.option?.web_name ??
											"Player 2"}
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row, index) => {
									const showSection =
										index === 0 || rows[index - 1]?.section !== row.section;
									return (
										<Fragment key={`${row.section}-${row.label}`}>
											{showSection ? (
												<tr>
													<th
														colSpan={3}
														className="border-zinc-200 border-t bg-zinc-50 px-3 py-2 text-left font-semibold text-zinc-700"
													>
														{row.section}
													</th>
												</tr>
											) : null}
											<tr className="border-zinc-100 border-t">
												<th className="px-3 py-2 text-left font-medium text-zinc-600">
													{row.label}
												</th>
												<td
													className={`px-3 py-2 ${valueCellClass(row, "left")}`}
												>
													{row.left}
												</td>
												<td
													className={`px-3 py-2 ${valueCellClass(row, "right")}`}
												>
													{row.right}
												</td>
											</tr>
										</Fragment>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

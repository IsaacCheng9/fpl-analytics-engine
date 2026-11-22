import type {
	CurrentPlayerContext,
	FormPlayer,
	FplTeamPick,
	UpcomingFixture,
} from "../api";
import { isUnavailableStatus, statusLabel } from "./playerStatus";

export const MIN_PROJECTION_GAIN = 0.1;
export const DEFAULT_CAPTAIN_LIMIT = 3;
export const DEFAULT_START_SIT_LIMIT = 3;

type OutfieldPosition = "DEF" | "MID" | "FWD";

const MIN_FORMATION_COUNT: Record<OutfieldPosition, number> = {
	DEF: 3,
	MID: 2,
	FWD: 1,
};

// Tolerance for IEEE-754 subtraction (e.g. 0.3 - 0.2 = 0.09999999999999998).
const FLOAT_EPSILON = 1e-9;

export type SquadInsightRow = {
	pick: FplTeamPick;
	form?: FormPlayer;
	current?: CurrentPlayerContext;
};

export type CaptainCandidate = {
	element: number;
	webName: string;
	position: string | null;
	teamName: string | null;
	projectedXgi: number;
	estXgi90: number | null;
	nextFixtureLabel: string | null;
	nextFdr: number | null;
	isCurrentCaptain: boolean;
	isDoubtful: boolean;
};

export type StartSitPlayerRef = {
	element: number;
	webName: string;
	position: string | null;
	projectedXgi: number | null;
	nextFixtureLabel: string | null;
	nextFdr: number | null;
	isDoubtful: boolean;
};

export type StartSitCue = {
	reason: "unavailable" | "projection";
	bench: StartSitPlayerRef;
	starter: StartSitPlayerRef;
	starterIssue: string | null;
	projectionGain: number | null;
};

export type CaptainRankingOptions = {
	nextGw?: number | null;
};

export type StartSitOptions = {
	minProjectionGain?: number;
	limit?: number;
	nextGw?: number | null;
};

function isFiniteNumber(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isOutfieldPosition(
	position: string | null,
): position is OutfieldPosition {
	return position === "DEF" || position === "MID" || position === "FWD";
}

function playerName(row: SquadInsightRow): string {
	const name = row.current ? row.current.web_name : row.pick.web_name;
	return name ?? `#${row.pick.element}`;
}

function playerPosition(row: SquadInsightRow): string | null {
	return row.current ? row.current.position : row.pick.position;
}

function playerTeam(row: SquadInsightRow): string | null {
	return row.current ? row.current.team_name : row.pick.team_name;
}

function liveStatus(row: SquadInsightRow): string | null {
	return (row.current ?? row.form)?.status ?? null;
}

function compareNullableAsc(a: number | null, b: number | null): number {
	if (a === b) {
		return 0;
	}
	if (a === null) {
		return 1;
	}
	if (b === null) {
		return -1;
	}
	return a - b;
}

function compareNullableDesc(a: number | null, b: number | null): number {
	if (a === b) {
		return 0;
	}
	if (a === null) {
		return 1;
	}
	if (b === null) {
		return -1;
	}
	return b - a;
}

function formatFixtureLeg(fixture: UpcomingFixture): string {
	const venue = fixture.was_home ? "H" : "A";
	return `${fixture.opponent_short_name} (${venue})`;
}

// Find the earliest upcoming gameweek across a list of fixture contexts.
export function findNextGwFromContexts(
	contexts: readonly (CurrentPlayerContext | undefined)[],
): number | null {
	let earliest: number | null = null;
	for (const context of contexts) {
		const fixtures = context?.next_fixtures ?? [];
		if (fixtures.length > 0) {
			for (const fixture of fixtures) {
				if (
					isFiniteNumber(fixture.gw) &&
					(earliest === null || fixture.gw < earliest)
				) {
					earliest = fixture.gw;
				}
			}
			continue;
		}
		const fallbackGw = context?.next_fixture_gw;
		if (
			isFiniteNumber(fallbackGw) &&
			(earliest === null || fallbackGw < earliest)
		) {
			earliest = fallbackGw;
		}
	}
	return earliest;
}

// Find the earliest upcoming gameweek across the squad's fixture contexts.
export function findSquadNextGw(
	rows: readonly SquadInsightRow[],
): number | null {
	return findNextGwFromContexts(rows.map((row) => row.current));
}

// Return true when nextGw is known and this player has current fixture context
// with no fixture scheduled in nextGw.
export function hasBlankNextGw(
	row: SquadInsightRow,
	nextGw: number | null,
): boolean {
	if (nextGw === null || !row.current) {
		return false;
	}
	const fixtures = row.current.next_fixtures ?? [];
	if (fixtures.length > 0) {
		return !fixtures.some((fixture) => fixture.gw === nextGw);
	}
	return row.current.next_fixture_gw !== nextGw;
}

function getNextFixtureSummary(
	row: SquadInsightRow,
	nextGw: number | null,
): { nextFixtureLabel: string | null; nextFdr: number | null } {
	if (hasBlankNextGw(row, nextGw)) {
		return { nextFixtureLabel: null, nextFdr: null };
	}

	const fixtures = row.current?.next_fixtures ?? [];
	if (fixtures.length > 0 && nextGw !== null) {
		const nextGwFixtures = fixtures.filter((fixture) => fixture.gw === nextGw);
		if (nextGwFixtures.length > 0) {
			const fdrs = nextGwFixtures
				.map((fixture) => fixture.fdr)
				.filter((fdr) => isFiniteNumber(fdr));
			const avgFdr =
				fdrs.length > 0
					? fdrs.reduce((sum, value) => sum + value, 0) / fdrs.length
					: null;
			return {
				nextFixtureLabel: nextGwFixtures.map(formatFixtureLeg).join(" / "),
				nextFdr: avgFdr,
			};
		}
	}

	const opponent = row.current?.next_opponent_name;
	let nextFixtureLabel: string | null = null;
	if (opponent) {
		if (typeof row.current?.next_was_home === "boolean") {
			nextFixtureLabel = `${opponent} (${row.current.next_was_home ? "H" : "A"})`;
		} else {
			nextFixtureLabel = opponent;
		}
	}

	const nextFdr = isFiniteNumber(row.current?.next_fdr)
		? row.current.next_fdr
		: null;
	return { nextFixtureLabel, nextFdr };
}

function toPlayerRef(
	row: SquadInsightRow,
	nextGw: number | null,
): StartSitPlayerRef {
	const projectedXgi = isFiniteNumber(row.form?.projected_xgi)
		? row.form.projected_xgi
		: null;
	const { nextFixtureLabel, nextFdr } = getNextFixtureSummary(row, nextGw);
	return {
		element: row.pick.element,
		webName: playerName(row),
		position: playerPosition(row),
		projectedXgi,
		nextFixtureLabel,
		nextFdr,
		isDoubtful: liveStatus(row) === "d",
	};
}

function isFormationLegalSwap(
	formationCounts: Readonly<Record<OutfieldPosition, number>>,
	benchPos: OutfieldPosition,
	starterPos: OutfieldPosition,
): boolean {
	return (
		benchPos === starterPos ||
		formationCounts[starterPos] > MIN_FORMATION_COUNT[starterPos]
	);
}

function applyFormationSwap(
	formationCounts: Record<OutfieldPosition, number>,
	benchPos: OutfieldPosition,
	starterPos: OutfieldPosition,
): void {
	if (benchPos !== starterPos) {
		formationCounts[starterPos] -= 1;
		formationCounts[benchPos] += 1;
	}
}

function starterUnavailableIssue(
	row: SquadInsightRow,
	nextGw: number | null,
): string | null {
	const status = liveStatus(row);
	if (isUnavailableStatus(status)) {
		return statusLabel(status) ?? "Unavailable";
	}
	if (hasBlankNextGw(row, nextGw)) {
		return "BGW";
	}
	return null;
}

// Rank eligible outfield Starting XI players for captaincy by projected xGI,
// breaking ties with next FDR, estimated xGI/90, and player name.
export function rankCaptainCandidates(
	startingRows: readonly SquadInsightRow[],
	limit = DEFAULT_CAPTAIN_LIMIT,
	options?: CaptainRankingOptions,
): CaptainCandidate[] {
	if (limit <= 0) {
		return [];
	}

	const nextGw =
		options?.nextGw !== undefined
			? options.nextGw
			: findSquadNextGw(startingRows);
	const candidates: CaptainCandidate[] = [];

	for (const row of startingRows) {
		const position = playerPosition(row);
		if (position === "GK" || position === "MNG") {
			continue;
		}
		const status = liveStatus(row);
		if (isUnavailableStatus(status) || hasBlankNextGw(row, nextGw)) {
			continue;
		}
		const projectedXgi = row.form?.projected_xgi;
		if (!isFiniteNumber(projectedXgi) || projectedXgi <= 0) {
			continue;
		}

		const estXgi90 = isFiniteNumber(row.form?.est_xgi90)
			? row.form.est_xgi90
			: null;
		const { nextFixtureLabel, nextFdr } = getNextFixtureSummary(row, nextGw);

		candidates.push({
			element: row.pick.element,
			webName: playerName(row),
			position,
			teamName: playerTeam(row),
			projectedXgi,
			estXgi90,
			nextFixtureLabel,
			nextFdr,
			isCurrentCaptain: row.pick.is_captain,
			isDoubtful: status === "d",
		});
	}

	candidates.sort((left, right) => {
		if (left.projectedXgi !== right.projectedXgi) {
			return right.projectedXgi - left.projectedXgi;
		}
		const fdrDiff = compareNullableAsc(left.nextFdr, right.nextFdr);
		if (fdrDiff !== 0) {
			return fdrDiff;
		}
		const estDiff = compareNullableDesc(left.estXgi90, right.estXgi90);
		if (estDiff !== 0) {
			return estDiff;
		}
		return left.webName.localeCompare(right.webName);
	});

	return candidates.slice(0, limit);
}

function compareBenchCoverCandidates(
	left: SquadInsightRow,
	right: SquadInsightRow,
	nextGw: number | null,
	isGoalkeeper: boolean,
): number {
	// Always prefer fit bench players over doubtful ones for unavailable cover.
	const leftDoubtful = liveStatus(left) === "d" ? 1 : 0;
	const rightDoubtful = liveStatus(right) === "d" ? 1 : 0;
	if (leftDoubtful !== rightDoubtful) {
		return leftDoubtful - rightDoubtful;
	}

	if (!isGoalkeeper) {
		const leftXgi = isFiniteNumber(left.form?.projected_xgi)
			? left.form.projected_xgi
			: null;
		const rightXgi = isFiniteNumber(right.form?.projected_xgi)
			? right.form.projected_xgi
			: null;
		const xgiDiff = compareNullableDesc(leftXgi, rightXgi);
		if (xgiDiff !== 0) {
			return xgiDiff;
		}
	}

	const leftFdr = getNextFixtureSummary(left, nextGw).nextFdr;
	const rightFdr = getNextFixtureSummary(right, nextGw).nextFdr;
	const fdrDiff = compareNullableAsc(leftFdr, rightFdr);
	if (fdrDiff !== 0) {
		return fdrDiff;
	}

	if (left.pick.squad_position !== right.pick.squad_position) {
		return left.pick.squad_position - right.pick.squad_position;
	}
	return playerName(left).localeCompare(playerName(right));
}

// Identify formation-legal bench-to-starter swap cues for unavailable or
// blanking starters first, then projection-based outfield upgrades.
export function findStartSitCues(
	startingRows: readonly SquadInsightRow[],
	benchRows: readonly SquadInsightRow[],
	options?: StartSitOptions,
): StartSitCue[] {
	const limit = options?.limit ?? DEFAULT_START_SIT_LIMIT;
	if (limit <= 0) {
		return [];
	}

	const minProjectionGain = options?.minProjectionGain ?? MIN_PROJECTION_GAIN;
	const nextGw =
		options?.nextGw !== undefined
			? options.nextGw
			: findSquadNextGw([...startingRows, ...benchRows]);

	const formationCounts: Record<OutfieldPosition, number> = {
		DEF: 0,
		MID: 0,
		FWD: 0,
	};
	for (const row of startingRows) {
		const pos = playerPosition(row);
		if (isOutfieldPosition(pos)) {
			formationCounts[pos] += 1;
		}
	}

	const eligibleBench = benchRows.filter((row) => {
		const status = liveStatus(row);
		return !isUnavailableStatus(status) && !hasBlankNextGw(row, nextGw);
	});

	const cues: StartSitCue[] = [];
	const usedStarters = new Set<number>();
	const usedBench = new Set<number>();

	const unavailableStarters = startingRows
		.map((row) => ({ row, issue: starterUnavailableIssue(row, nextGw) }))
		.filter(
			(item): item is { row: SquadInsightRow; issue: string } =>
				item.issue !== null,
		);

	// 1. Cover unavailable or blanking starters first, resolving the most
	// constrained starters first so floor-locked positions are not starved.
	while (cues.length < limit) {
		const optionsByStarter = unavailableStarters
			.filter(({ row }) => !usedStarters.has(row.pick.element))
			.map(({ row, issue }) => {
				const starterPos = playerPosition(row);
				const replacements = eligibleBench.filter((benchRow) => {
					if (usedBench.has(benchRow.pick.element)) {
						return false;
					}
					const benchPos = playerPosition(benchRow);
					if (starterPos === "GK") {
						return benchPos === "GK";
					}
					if (isOutfieldPosition(starterPos) && isOutfieldPosition(benchPos)) {
						return isFormationLegalSwap(formationCounts, benchPos, starterPos);
					}
					return false;
				});
				return { row, issue, starterPos, replacements };
			})
			.filter((entry) => entry.replacements.length > 0);

		if (optionsByStarter.length === 0) {
			break;
		}

		optionsByStarter.sort((left, right) => {
			if (left.replacements.length !== right.replacements.length) {
				return left.replacements.length - right.replacements.length;
			}
			if (left.row.pick.squad_position !== right.row.pick.squad_position) {
				return left.row.pick.squad_position - right.row.pick.squad_position;
			}
			return playerName(left.row).localeCompare(playerName(right.row));
		});

		const chosen = optionsByStarter[0];
		const isGk = chosen.starterPos === "GK";
		chosen.replacements.sort((left, right) =>
			compareBenchCoverCandidates(left, right, nextGw, isGk),
		);
		const bestBench = chosen.replacements[0];

		cues.push({
			reason: "unavailable",
			bench: toPlayerRef(bestBench, nextGw),
			starter: toPlayerRef(chosen.row, nextGw),
			starterIssue: chosen.issue,
			projectionGain: null,
		});
		usedStarters.add(chosen.row.pick.element);
		usedBench.add(bestBench.pick.element);

		const benchPos = playerPosition(bestBench);
		if (isOutfieldPosition(chosen.starterPos) && isOutfieldPosition(benchPos)) {
			applyFormationSwap(formationCounts, benchPos, chosen.starterPos);
		}
	}

	// 2. Flag fit outfield bench players who out-project a formation-legal
	// outfield starter by at least minProjectionGain.
	const projectionStarters = startingRows.filter((row) => {
		if (usedStarters.has(row.pick.element)) {
			return false;
		}
		const pos = playerPosition(row);
		if (!isOutfieldPosition(pos)) {
			return false;
		}
		if (starterUnavailableIssue(row, nextGw) !== null) {
			return false;
		}
		return isFiniteNumber(row.form?.projected_xgi);
	});

	const projectionBench = eligibleBench.filter((row) => {
		if (usedBench.has(row.pick.element)) {
			return false;
		}
		const pos = playerPosition(row);
		if (!isOutfieldPosition(pos)) {
			return false;
		}
		if (liveStatus(row) === "d") {
			return false;
		}
		return isFiniteNumber(row.form?.projected_xgi);
	});

	while (cues.length < limit) {
		let bestPair: {
			bench: SquadInsightRow;
			benchPos: OutfieldPosition;
			starter: SquadInsightRow;
			starterPos: OutfieldPosition;
			gain: number;
			benchXgi: number;
		} | null = null;

		for (const benchRow of projectionBench) {
			if (usedBench.has(benchRow.pick.element)) {
				continue;
			}
			const benchPos = playerPosition(benchRow);
			const benchXgi = benchRow.form?.projected_xgi;
			if (!isOutfieldPosition(benchPos) || !isFiniteNumber(benchXgi)) {
				continue;
			}

			for (const starterRow of projectionStarters) {
				if (usedStarters.has(starterRow.pick.element)) {
					continue;
				}
				const starterPos = playerPosition(starterRow);
				const starterXgi = starterRow.form?.projected_xgi;
				if (!isOutfieldPosition(starterPos) || !isFiniteNumber(starterXgi)) {
					continue;
				}
				if (!isFormationLegalSwap(formationCounts, benchPos, starterPos)) {
					continue;
				}

				const gain: number = benchXgi - starterXgi;
				if (gain + FLOAT_EPSILON < minProjectionGain) {
					continue;
				}

				if (bestPair === null) {
					bestPair = {
						bench: benchRow,
						benchPos,
						starter: starterRow,
						starterPos,
						gain,
						benchXgi,
					};
					continue;
				}

				const gainDiff = gain - bestPair.gain;
				let isBetter = false;
				if (Math.abs(gainDiff) > FLOAT_EPSILON) {
					isBetter = gainDiff > 0;
				} else if (benchXgi !== bestPair.benchXgi) {
					isBetter = benchXgi > bestPair.benchXgi;
				} else if (
					benchRow.pick.squad_position !== bestPair.bench.pick.squad_position
				) {
					isBetter =
						benchRow.pick.squad_position < bestPair.bench.pick.squad_position;
				} else {
					const benchNameDiff = playerName(benchRow).localeCompare(
						playerName(bestPair.bench),
					);
					if (benchNameDiff !== 0) {
						isBetter = benchNameDiff < 0;
					} else {
						isBetter =
							playerName(starterRow).localeCompare(
								playerName(bestPair.starter),
							) < 0;
					}
				}

				if (isBetter) {
					bestPair = {
						bench: benchRow,
						benchPos,
						starter: starterRow,
						starterPos,
						gain,
						benchXgi,
					};
				}
			}
		}

		if (bestPair === null) {
			break;
		}

		cues.push({
			reason: "projection",
			bench: toPlayerRef(bestPair.bench, nextGw),
			starter: toPlayerRef(bestPair.starter, nextGw),
			starterIssue: null,
			projectionGain: bestPair.gain,
		});
		usedBench.add(bestPair.bench.pick.element);
		usedStarters.add(bestPair.starter.pick.element);
		applyFormationSwap(formationCounts, bestPair.benchPos, bestPair.starterPos);
	}

	return cues;
}

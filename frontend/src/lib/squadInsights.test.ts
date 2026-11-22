import { describe, expect, test } from "vitest";
import type { CurrentPlayerContext, FormPlayer, FplTeamPick } from "../api";
import {
	findSquadNextGw,
	findStartSitCues,
	hasBlankNextGw,
	MIN_PROJECTION_GAIN,
	rankCaptainCandidates,
	type SquadInsightRow,
} from "./squadInsights";

function makePick(
	overrides: Partial<FplTeamPick> & { element: number },
): FplTeamPick {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		squad_position: overrides.element,
		multiplier: 1,
		is_captain: false,
		is_vice_captain: false,
		is_starting: true,
		...overrides,
	};
}

function makeCurrent(
	overrides: Partial<CurrentPlayerContext> & { element: number },
): CurrentPlayerContext {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		price: 7.5,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
		next_fixtures: [
			{
				gw: 11,
				opponent_name: "Everton",
				opponent_short_name: "EVE",
				was_home: true,
				fdr: 2,
			},
		],
		current_ownership: 15,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		...overrides,
	};
}

function makeForm(
	overrides: Partial<FormPlayer> & { element: number },
): FormPlayer {
	return {
		web_name: `Player ${overrides.element}`,
		position: "MID",
		team_name: "Arsenal",
		price: 7.5,
		window_games: 5,
		window_minutes: 450,
		window_xg90: 0.3,
		window_xa90: 0.2,
		window_xgi90: 0.5,
		season_xg90: 0.3,
		season_xa90: 0.2,
		season_xgi90: 0.5,
		delta_xg90: 0,
		delta_xa90: 0,
		delta_xgi90: 0,
		est_xg90: 0.3,
		est_xa90: 0.2,
		est_xgi90: 0.5,
		projected_minutes: 85,
		projected_xgi: 0.45,
		window_xg90_per_million: 0.04,
		window_xa90_per_million: 0.03,
		window_xgi90_per_million: 0.07,
		season_points_per_million: 4,
		window_start_rate: 1.0,
		window_mins_per_appearance: 85,
		upcoming_fixtures: 5,
		avg_fdr: 2.8,
		next_fixture_gw: 11,
		next_opponent_name: "Everton",
		next_was_home: true,
		next_fdr: 2,
		next_fixtures: [],
		current_ownership: 15,
		status: "a",
		chance_of_playing_next_round: null,
		news: null,
		yellow_cards: 0,
		penalties_order: null,
		corners_order: null,
		direct_freekicks_order: null,
		as_of_gw: 10,
		...overrides,
	};
}

function makeRow({
	element,
	webName,
	position = "MID",
	teamName = "Arsenal",
	squadPosition = element,
	isStarting = true,
	isCaptain = false,
	projectedXgi = 0.4,
	estXgi90 = 0.4,
	status = "a",
	nextFixtures,
	nextFixtureGw = 11,
	nextOpponentName = "Everton",
	nextWasHome = true,
	nextFdr = 2,
	omitCurrent = false,
	omitForm = false,
}: {
	element: number;
	webName: string;
	position?: string | null;
	teamName?: string | null;
	squadPosition?: number;
	isStarting?: boolean;
	isCaptain?: boolean;
	projectedXgi?: number | null;
	estXgi90?: number | null;
	status?: string | null;
	nextFixtures?: CurrentPlayerContext["next_fixtures"];
	nextFixtureGw?: number | null;
	nextOpponentName?: string | null;
	nextWasHome?: boolean | null;
	nextFdr?: number | null;
	omitCurrent?: boolean;
	omitForm?: boolean;
}): SquadInsightRow {
	const pick = makePick({
		element,
		web_name: webName,
		position,
		team_name: teamName,
		squad_position: squadPosition,
		is_starting: isStarting,
		is_captain: isCaptain,
		multiplier: isStarting ? (isCaptain ? 2 : 1) : 0,
	});
	const form = omitForm
		? undefined
		: makeForm({
				element,
				web_name: webName,
				position,
				team_name: teamName,
				projected_xgi: projectedXgi,
				est_xgi90: estXgi90,
				status,
			});
	const current = omitCurrent
		? undefined
		: makeCurrent({
				element,
				web_name: webName,
				position,
				team_name: teamName,
				status,
				next_fixture_gw: nextFixtureGw,
				next_opponent_name: nextOpponentName,
				next_was_home: nextWasHome,
				next_fdr: nextFdr,
				next_fixtures:
					nextFixtures ??
					(nextFixtureGw !== null
						? [
								{
									gw: nextFixtureGw,
									opponent_name: nextOpponentName ?? "Everton",
									opponent_short_name: (nextOpponentName ?? "EVE")
										.slice(0, 3)
										.toUpperCase(),
									was_home: nextWasHome ?? true,
									fdr: nextFdr ?? 2,
								},
							]
						: []),
			});
	return { pick, form, current };
}

function makeStandardStartingXi({
	defCount = 3,
	midCount = 4,
	fwdCount = 3,
	defaultXgi = 0.4,
}: {
	defCount?: number;
	midCount?: number;
	fwdCount?: number;
	defaultXgi?: number;
} = {}): SquadInsightRow[] {
	const rows: SquadInsightRow[] = [
		makeRow({
			element: 1,
			webName: "Raya",
			position: "GK",
			squadPosition: 1,
			projectedXgi: null,
		}),
	];
	let nextId = 2;
	for (let i = 1; i <= defCount; i += 1) {
		rows.push(
			makeRow({
				element: nextId,
				webName: `Def${i}`,
				position: "DEF",
				squadPosition: nextId,
				projectedXgi: defaultXgi,
			}),
		);
		nextId += 1;
	}
	for (let i = 1; i <= midCount; i += 1) {
		rows.push(
			makeRow({
				element: nextId,
				webName: `Mid${i}`,
				position: "MID",
				squadPosition: nextId,
				projectedXgi: defaultXgi,
			}),
		);
		nextId += 1;
	}
	for (let i = 1; i <= fwdCount; i += 1) {
		rows.push(
			makeRow({
				element: nextId,
				webName: `Fwd${i}`,
				position: "FWD",
				squadPosition: nextId,
				projectedXgi: defaultXgi,
			}),
		);
		nextId += 1;
	}
	return rows;
}

describe("findSquadNextGw and hasBlankNextGw", () => {
	test("finds earliest upcoming GW across next_fixtures and next_fixture_gw fallback", () => {
		const fixtureRow = makeRow({
			element: 1,
			webName: "Saka",
			nextFixtures: [
				{
					gw: 12,
					opponent_name: "Chelsea",
					opponent_short_name: "CHE",
					was_home: false,
					fdr: 3,
				},
			],
		});
		const fallbackRow = makeRow({
			element: 2,
			webName: "Palmer",
			nextFixtures: [],
			nextFixtureGw: 11,
		});

		const nextGw = findSquadNextGw([fixtureRow, fallbackRow]);
		expect(nextGw).toBe(11);
		expect(hasBlankNextGw(fixtureRow, nextGw)).toBe(true);
		expect(hasBlankNextGw(fallbackRow, nextGw)).toBe(false);
	});

	test("does not falsely mark blanks when no fixture data exists for anyone", () => {
		const rowA = makeRow({ element: 1, webName: "Saka", omitCurrent: true });
		const rowB = makeRow({
			element: 2,
			webName: "Palmer",
			nextFixtures: [],
			nextFixtureGw: null,
		});

		const nextGw = findSquadNextGw([rowA, rowB]);
		expect(nextGw).toBeNull();
		expect(hasBlankNextGw(rowA, nextGw)).toBe(false);
		expect(hasBlankNextGw(rowB, nextGw)).toBe(false);
	});
});

describe("rankCaptainCandidates", () => {
	test("ranks by projected_xgi, then nextFdr asc (null last), est_xgi90 desc (null last), and webName asc", () => {
		const rows: SquadInsightRow[] = [
			makeRow({
				element: 1,
				webName: "Zeta",
				projectedXgi: 0.6,
				nextFdr: 2,
				estXgi90: 0.55,
			}),
			makeRow({
				element: 2,
				webName: "Alpha",
				projectedXgi: 0.6,
				nextFdr: 2,
				estXgi90: 0.55,
			}),
			makeRow({
				element: 3,
				webName: "HarderFixture",
				projectedXgi: 0.6,
				nextFdr: 4,
				estXgi90: 0.9,
			}),
			makeRow({
				element: 4,
				webName: "NullFdr",
				projectedXgi: 0.6,
				nextFixtures: [],
				nextFixtureGw: 11,
				nextFdr: null,
				estXgi90: 0.9,
			}),
			makeRow({
				element: 5,
				webName: "HigherEst",
				projectedXgi: 0.6,
				nextFdr: 2,
				estXgi90: 0.7,
			}),
			makeRow({
				element: 6,
				webName: "NullEst",
				projectedXgi: 0.6,
				nextFdr: 2,
				estXgi90: null,
			}),
			makeRow({
				element: 7,
				webName: "Haaland",
				position: "FWD",
				projectedXgi: 0.85,
				nextFdr: 3,
				estXgi90: 0.8,
				isCaptain: true,
			}),
		];

		const top3 = rankCaptainCandidates(rows);
		expect(top3.map((c) => c.webName)).toEqual([
			"Haaland",
			"HigherEst",
			"Alpha",
		]);
		expect(top3[0].isCurrentCaptain).toBe(true);

		const all = rankCaptainCandidates(rows, 10);
		expect(all.map((c) => c.webName)).toEqual([
			"Haaland",
			"HigherEst",
			"Alpha",
			"Zeta",
			"NullEst",
			"HarderFixture",
			"NullFdr",
		]);
	});

	test("excludes GK, MNG, unavailable, BGW, and non-positive projected_xgi while keeping doubtful starters", () => {
		const rows: SquadInsightRow[] = [
			makeRow({
				element: 1,
				webName: "Raya",
				position: "GK",
				projectedXgi: 0.9,
			}),
			makeRow({
				element: 2,
				webName: "Arteta",
				position: "MNG",
				projectedXgi: 0.9,
			}),
			makeRow({
				element: 3,
				webName: "InjuredStar",
				projectedXgi: 0.9,
				status: "i",
			}),
			makeRow({
				element: 4,
				webName: "SuspendedStar",
				projectedXgi: 0.9,
				status: "s",
			}),
			makeRow({
				element: 5,
				webName: "UnavailableStar",
				projectedXgi: 0.9,
				status: "u",
			}),
			makeRow({
				element: 6,
				webName: "IneligibleStar",
				projectedXgi: 0.9,
				status: "n",
			}),
			makeRow({
				element: 7,
				webName: "BlankingStar",
				projectedXgi: 0.9,
				nextFixtures: [
					{
						gw: 12,
						opponent_name: "Chelsea",
						opponent_short_name: "CHE",
						was_home: true,
						fdr: 3,
					},
				],
			}),
			makeRow({
				element: 8,
				webName: "ZeroXgi",
				projectedXgi: 0,
			}),
			makeRow({
				element: 9,
				webName: "NullXgi",
				projectedXgi: null,
			}),
			makeRow({
				element: 10,
				webName: "DoubtfulPalmer",
				projectedXgi: 0.62,
				status: "d",
			}),
		];

		const candidates = rankCaptainCandidates(rows);
		expect(candidates).toHaveLength(1);
		expect(candidates[0].webName).toBe("DoubtfulPalmer");
		expect(candidates[0].isDoubtful).toBe(true);
	});

	test("formats DGW labels with averaged FDR and falls back to next_opponent_name when next_fixtures is empty", () => {
		const rows: SquadInsightRow[] = [
			makeRow({
				element: 1,
				webName: "Salah",
				projectedXgi: 1.15,
				nextFixtures: [
					{
						gw: 25,
						opponent_name: "Arsenal",
						opponent_short_name: "ARS",
						was_home: true,
						fdr: 4,
					},
					{
						gw: 25,
						opponent_name: "Wolves",
						opponent_short_name: "WOL",
						was_home: false,
						fdr: 2,
					},
					{
						gw: 26,
						opponent_name: "Everton",
						opponent_short_name: "EVE",
						was_home: true,
						fdr: 2,
					},
				],
			}),
			makeRow({
				element: 2,
				webName: "Saka",
				projectedXgi: 0.72,
				nextFixtures: [],
				nextFixtureGw: 25,
				nextOpponentName: "Fulham",
				nextWasHome: false,
				nextFdr: 2,
			}),
		];

		const candidates = rankCaptainCandidates(rows);
		expect(candidates[0]).toMatchObject({
			webName: "Salah",
			nextFixtureLabel: "ARS (H) / WOL (A)",
			nextFdr: 3,
		});
		expect(candidates[1]).toMatchObject({
			webName: "Saka",
			nextFixtureLabel: "Fulham (A)",
			nextFdr: 2,
		});
	});
});

describe("findStartSitCues", () => {
	test("enforces 3-DEF, 2-MID, and 1-FWD formation floors while allowing same-position swaps", () => {
		// 3-4-3 is at the DEF=3 floor; a bench FWD cannot replace a starting DEF.
		const xi343 = makeStandardStartingXi({
			defCount: 3,
			midCount: 4,
			fwdCount: 3,
			defaultXgi: 0.5,
		});
		// Drop Def1 to very low xGI so bench FWD would love to swap if legal.
		if (xi343[1].form) {
			xi343[1].form.projected_xgi = 0.05;
		}
		const benchFwd = makeRow({
			element: 20,
			webName: "Isak",
			position: "FWD",
			squadPosition: 12,
			isStarting: false,
			projectedXgi: 0.55,
		});
		// Bench FWD vs Mid/Fwd is only +0.05 (below 0.10), and vs Def1 is illegal.
		expect(findStartSitCues(xi343, [benchFwd])).toEqual([]);

		// Same-position DEF swap IS legal even at the 3-DEF floor.
		const benchDef = makeRow({
			element: 21,
			webName: "Trent",
			position: "DEF",
			squadPosition: 13,
			isStarting: false,
			projectedXgi: 0.35,
		});
		const defCues = findStartSitCues(xi343, [benchFwd, benchDef]);
		expect(defCues).toHaveLength(1);
		expect(defCues[0]).toMatchObject({
			reason: "projection",
			bench: { webName: "Trent" },
			starter: { webName: "Def1" },
		});

		// 5-2-3 is at the MID=2 floor; bench DEF cannot replace a starting MID.
		const xi523 = makeStandardStartingXi({
			defCount: 5,
			midCount: 2,
			fwdCount: 3,
			defaultXgi: 0.5,
		});
		if (xi523[6].form) {
			xi523[6].form.projected_xgi = 0.05;
		}
		expect(findStartSitCues(xi523, [benchDef])).toEqual([]);

		// 5-4-1 is at the FWD=1 floor; bench MID cannot replace the lone FWD.
		const xi541 = makeStandardStartingXi({
			defCount: 5,
			midCount: 4,
			fwdCount: 1,
			defaultXgi: 0.5,
		});
		if (xi541[10].form) {
			xi541[10].form.projected_xgi = 0.05;
		}
		const benchMid = makeRow({
			element: 22,
			webName: "Palmer",
			position: "MID",
			squadPosition: 12,
			isStarting: false,
			projectedXgi: 0.55,
		});
		expect(findStartSitCues(xi541, [benchMid])).toEqual([]);
	});

	test("updates virtual formation counts across multiple swaps so DEF never drops below 3", () => {
		// 4-4-2 has 1 spare DEF above the 3-DEF floor.
		const xi442 = makeStandardStartingXi({
			defCount: 4,
			midCount: 4,
			fwdCount: 2,
			defaultXgi: 0.45,
		});
		// Two weak DEFs (0.05 and 0.10) and one weak MID (0.20).
		if (xi442[1].form) {
			xi442[1].form.projected_xgi = 0.05; // Def1.
		}
		if (xi442[2].form) {
			xi442[2].form.projected_xgi = 0.1; // Def2.
		}
		if (xi442[5].form) {
			xi442[5].form.projected_xgi = 0.2; // Mid1.
		}

		const bench: SquadInsightRow[] = [
			makeRow({
				element: 20,
				webName: "Palmer",
				position: "MID",
				squadPosition: 12,
				isStarting: false,
				projectedXgi: 0.65,
			}),
			makeRow({
				element: 21,
				webName: "Rogers",
				position: "MID",
				squadPosition: 13,
				isStarting: false,
				projectedXgi: 0.5,
			}),
		];

		const cues = findStartSitCues(xi442, bench);
		expect(cues).toHaveLength(2);
		// Swap 1: Palmer (MID) replaces Def1 (DEF) -> virtual formation becomes 3-5-2.
		expect(cues[0]).toMatchObject({
			reason: "projection",
			bench: { webName: "Palmer" },
			starter: { webName: "Def1" },
		});
		// Swap 2: Rogers (MID) CANNOT replace Def2 (would drop DEF to 2), so replaces Mid1.
		expect(cues[1]).toMatchObject({
			reason: "projection",
			bench: { webName: "Rogers" },
			starter: { webName: "Mid1" },
		});
	});

	test("flags GK cover only when starting GK is unavailable or blanking and bench GK is available", () => {
		const xi = makeStandardStartingXi({ defaultXgi: 0.4 });
		const benchGk = makeRow({
			element: 20,
			webName: "Kelleher",
			position: "GK",
			squadPosition: 12,
			isStarting: false,
			projectedXgi: 0.9,
		});

		// Healthy starting GK never triggers a projection-based GK swap.
		expect(findStartSitCues(xi, [benchGk])).toEqual([]);

		// Blanking starting GK triggers BGW cover with available bench GK.
		if (xi[0].current) {
			xi[0].current.next_fixtures = [
				{
					gw: 12,
					opponent_name: "Chelsea",
					opponent_short_name: "CHE",
					was_home: true,
					fdr: 3,
				},
			];
		}
		const bgwCues = findStartSitCues(xi, [benchGk]);
		expect(bgwCues).toHaveLength(1);
		expect(bgwCues[0]).toMatchObject({
			reason: "unavailable",
			starterIssue: "BGW",
			bench: { webName: "Kelleher" },
			starter: { webName: "Raya" },
			projectionGain: null,
		});

		// Unavailable bench GK cannot cover an unavailable starting GK.
		if (benchGk.current) {
			benchGk.current.status = "i";
		}
		expect(findStartSitCues(xi, [benchGk])).toEqual([]);

		// Outfield bench player can never replace a starting GK.
		const benchMid = makeRow({
			element: 21,
			webName: "Rogers",
			position: "MID",
			squadPosition: 13,
			isStarting: false,
			projectedXgi: 0.44,
		});
		expect(findStartSitCues(xi, [benchMid])).toEqual([]);
	});

	test("enforces the 0.10 projection threshold (including float precision) and excludes doubtful bench players", () => {
		expect(MIN_PROJECTION_GAIN).toBe(0.1);
		const xi = makeStandardStartingXi({ defaultXgi: 0.5 });
		// Mid1 = 0.20, Mid2 = 0.21.
		if (xi[4].form) {
			xi[4].form.projected_xgi = 0.2;
		}
		if (xi[5].form) {
			xi[5].form.projected_xgi = 0.21;
		}

		const bench: SquadInsightRow[] = [
			// 0.30 - 0.20 = 0.09999999999999998 in IEEE-754 -> must still meet 0.10.
			makeRow({
				element: 20,
				webName: "ExactThreshold",
				position: "MID",
				squadPosition: 12,
				isStarting: false,
				projectedXgi: 0.3,
			}),
			// 0.30 - 0.21 = 0.09 -> below threshold once Mid1 is taken.
			makeRow({
				element: 21,
				webName: "JustBelow",
				position: "MID",
				squadPosition: 13,
				isStarting: false,
				projectedXgi: 0.3,
			}),
			// Doubtful bench player excluded from projection-based swaps.
			makeRow({
				element: 22,
				webName: "DoubtfulBench",
				position: "MID",
				squadPosition: 14,
				isStarting: false,
				projectedXgi: 0.9,
				status: "d",
			}),
		];

		const cues = findStartSitCues(xi, bench);
		expect(cues).toHaveLength(1);
		expect(cues[0]).toMatchObject({
			reason: "projection",
			bench: { webName: "ExactThreshold" },
			starter: { webName: "Mid1" },
		});
		expect(cues[0].projectionGain).toBeCloseTo(0.1, 6);
	});

	test("prioritises unavailable cover before projection upgrades, caps at 3, and never reuses players", () => {
		const xi = makeStandardStartingXi({
			defCount: 3,
			midCount: 4,
			fwdCount: 3,
			defaultXgi: 0.3,
		});
		// Injured Mid1 starter.
		if (xi[4].current) {
			xi[4].current.status = "i";
		}
		// Weak healthy Mid2, Mid3, Mid4 starters.
		if (xi[5].form) {
			xi[5].form.projected_xgi = 0.1;
		}
		if (xi[6].form) {
			xi[6].form.projected_xgi = 0.12;
		}
		if (xi[7].form) {
			xi[7].form.projected_xgi = 0.15;
		}

		const bench: SquadInsightRow[] = [
			makeRow({
				element: 20,
				webName: "BenchA",
				position: "MID",
				squadPosition: 12,
				isStarting: false,
				projectedXgi: 0.65,
			}),
			makeRow({
				element: 21,
				webName: "BenchB",
				position: "MID",
				squadPosition: 13,
				isStarting: false,
				projectedXgi: 0.55,
			}),
			makeRow({
				element: 22,
				webName: "BenchC",
				position: "MID",
				squadPosition: 14,
				isStarting: false,
				projectedXgi: 0.45,
			}),
			makeRow({
				element: 23,
				webName: "BenchD",
				position: "MID",
				squadPosition: 15,
				isStarting: false,
				projectedXgi: 0.4,
			}),
		];

		const cues = findStartSitCues(xi, bench);
		expect(cues).toHaveLength(3);
		expect(cues[0]).toMatchObject({
			reason: "unavailable",
			starterIssue: "Injured",
			starter: { webName: "Mid1" },
			bench: { webName: "BenchA" },
		});
		expect(cues[1]).toMatchObject({
			reason: "projection",
			bench: { webName: "BenchB" },
			starter: { webName: "Mid2" },
		});
		expect(cues[2]).toMatchObject({
			reason: "projection",
			bench: { webName: "BenchC" },
			starter: { webName: "Mid3" },
		});

		const benchIds = cues.map((cue) => cue.bench.element);
		const starterIds = cues.map((cue) => cue.starter.element);
		expect(new Set(benchIds).size).toBe(benchIds.length);
		expect(new Set(starterIds).size).toBe(starterIds.length);
	});

	test("resolves floor-constrained unavailable starters first so bench cover is not starved", () => {
		// 3-4-3 has DEF at its floor of 3. Both Def1 and Mid1 are injured.
		const xi = makeStandardStartingXi({
			defCount: 3,
			midCount: 4,
			fwdCount: 3,
			defaultXgi: 0.45,
		});
		if (xi[1].current) {
			xi[1].current.status = "i"; // Def1 (must be covered by a bench DEF).
		}
		if (xi[4].current) {
			xi[4].current.status = "s"; // Mid1 (can be covered by bench DEF or FWD).
		}

		const bench: SquadInsightRow[] = [
			makeRow({
				element: 20,
				webName: "BenchDef",
				position: "DEF",
				squadPosition: 12,
				isStarting: false,
				projectedXgi: 0.5,
			}),
			makeRow({
				element: 21,
				webName: "BenchFwd",
				position: "FWD",
				squadPosition: 13,
				isStarting: false,
				projectedXgi: 0.4,
			}),
		];

		const cues = findStartSitCues(xi, bench);
		expect(cues).toHaveLength(2);
		expect(cues[0]).toMatchObject({
			reason: "unavailable",
			starterIssue: "Injured",
			starter: { webName: "Def1" },
			bench: { webName: "BenchDef" },
		});
		expect(cues[1]).toMatchObject({
			reason: "unavailable",
			starterIssue: "Suspended",
			starter: { webName: "Mid1" },
			bench: { webName: "BenchFwd" },
		});
	});

	test("does not treat missing current context as a blank gameweek", () => {
		const xi = makeStandardStartingXi({ defaultXgi: 0.4 });
		// Replace Mid1 with a starter who has form data but no current context.
		xi[4] = makeRow({
			element: 105,
			webName: "NoCurrentStarter",
			position: "MID",
			squadPosition: 5,
			isStarting: true,
			projectedXgi: 0.85,
			omitCurrent: true,
		});
		const benchMid = makeRow({
			element: 20,
			webName: "BenchMid",
			position: "MID",
			squadPosition: 12,
			isStarting: false,
			projectedXgi: 0.45,
			omitCurrent: true,
		});

		expect(hasBlankNextGw(xi[4], 11)).toBe(false);
		const captains = rankCaptainCandidates(xi, 3, { nextGw: 11 });
		expect(captains[0]?.webName).toBe("NoCurrentStarter");

		const cues = findStartSitCues(xi, [benchMid], { nextGw: 11 });
		expect(cues).toEqual([]);
	});

	test("prefers fit bench cover over higher-xGI doubtful bench player, falling back to doubtful when needed", () => {
		const xi = makeStandardStartingXi({ defaultXgi: 0.45 });
		if (xi[4].current) {
			xi[4].current.status = "i";
		}

		const doubtfulHigh = makeRow({
			element: 20,
			webName: "DoubtfulHigh",
			position: "MID",
			squadPosition: 12,
			isStarting: false,
			projectedXgi: 0.85,
			status: "d",
		});
		const fitLower = makeRow({
			element: 21,
			webName: "FitLower",
			position: "MID",
			squadPosition: 13,
			isStarting: false,
			projectedXgi: 0.35,
			status: "a",
		});

		// Fit bench cover must beat a doubtful player with higher historical xGI.
		const withFitOption = findStartSitCues(xi, [doubtfulHigh, fitLower]);
		expect(withFitOption).toHaveLength(1);
		expect(withFitOption[0]).toMatchObject({
			reason: "unavailable",
			starter: { webName: "Mid1" },
			bench: { webName: "FitLower", isDoubtful: false },
		});

		// When only doubtful cover exists, surface it with isDoubtful flagged.
		const fallbackOnly = findStartSitCues(xi, [doubtfulHigh]);
		expect(fallbackOnly).toHaveLength(1);
		expect(fallbackOnly[0]).toMatchObject({
			reason: "unavailable",
			starter: { webName: "Mid1" },
			bench: { webName: "DoubtfulHigh", isDoubtful: true },
		});
	});
});

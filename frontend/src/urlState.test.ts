import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_MIN_MINUTES, DEFAULT_PLAYER_WINDOW } from "./state";
import { DEFAULT_URL_STATE, readUrlState, writeUrlState } from "./urlState";

beforeEach(() => {
	window.history.replaceState(null, "", "/");
});

describe("urlState integer parsing and evidence season sync", () => {
	test("rejects float values for integer query parameters and does not open Compare on invalid IDs", () => {
		window.history.replaceState(
			null,
			"",
			"/?fpl_team=12.5&as_of_gw=4.5&player=7.2&compare_a=1.1&compare_b=2.9&compare_as_of_gw=3.5&min_games=2.5&window=5.5&min_minutes=90.5&player_window=4.2",
		);

		const state = readUrlState();
		expect(state.fplTeamId).toBeNull();
		expect(state.asOfGw).toBeNull();
		expect(state.selectedElement).toBeNull();
		expect(state.compareOpen).toBe(false);
		expect(state.compareLeftElement).toBeNull();
		expect(state.compareRightElement).toBeNull();
		expect(state.compareAsOfGw).toBeNull();
		expect(state.minGames).toBeNull();
		expect(state.windowSize).toBeNull();
		expect(state.minMinutes).toBe(DEFAULT_MIN_MINUTES);
		expect(state.playerWindow).toBe(DEFAULT_PLAYER_WINDOW);
	});

	test("still allows decimals for float threshold parameters", () => {
		window.history.replaceState(
			null,
			"",
			"/?max_price=7.5&max_fdr=2.5&min_hit_rate=0.4&min_window_xgi90=0.35",
		);

		const state = readUrlState();
		expect(state.transferFilters.maxPrice).toBe(7.5);
		expect(state.transferFilters.maxFdr).toBe(2.5);
		expect(state.minHitRate).toBe(0.4);
		expect(state.attackingThreatFilters.xgi.window).toBe(0.35);
	});

	test("round-trips valid evidence_season only on the evidence tab and rejects non-consecutive or pre-2025 seasons", () => {
		writeUrlState({
			...DEFAULT_URL_STATE,
			tab: "evidence",
			evidenceSeason: "2025-26",
		});
		expect(
			new URLSearchParams(window.location.search).get("evidence_season"),
		).toBe("2025-26");
		expect(readUrlState().evidenceSeason).toBe("2025-26");

		writeUrlState({
			...DEFAULT_URL_STATE,
			tab: "form",
			evidenceSeason: "2025-26",
		});
		expect(
			new URLSearchParams(window.location.search).get("evidence_season"),
		).toBeNull();

		for (const invalid of ["bad", "2025-99", "2019-20", "2024-25"]) {
			window.history.replaceState(
				null,
				"",
				`/?tab=evidence&evidence_season=${invalid}`,
			);
			expect(readUrlState().evidenceSeason).toBeNull();
		}
	});

	test("round-trips exclude_unavailable and penalties_only on player tabs only", () => {
		writeUrlState({
			...DEFAULT_URL_STATE,
			tab: "form",
			transferFilters: {
				...DEFAULT_URL_STATE.transferFilters,
				excludeUnavailable: true,
				penaltiesOnly: true,
			},
		});
		const params = new URLSearchParams(window.location.search);
		expect(params.get("exclude_unavailable")).toBe("1");
		expect(params.get("penalties_only")).toBe("1");

		const parsed = readUrlState();
		expect(parsed.transferFilters.excludeUnavailable).toBe(true);
		expect(parsed.transferFilters.penaltiesOnly).toBe(true);

		writeUrlState({
			...DEFAULT_URL_STATE,
			tab: "clubs",
			transferFilters: {
				...DEFAULT_URL_STATE.transferFilters,
				excludeUnavailable: true,
				penaltiesOnly: true,
			},
		});
		const clubParams = new URLSearchParams(window.location.search);
		expect(clubParams.get("exclude_unavailable")).toBeNull();
		expect(clubParams.get("penalties_only")).toBeNull();

		window.history.replaceState(
			null,
			"",
			"/?exclude_unavailable=0&penalties_only=yes",
		);
		const invalid = readUrlState();
		expect(invalid.transferFilters.excludeUnavailable).toBe(false);
		expect(invalid.transferFilters.penaltiesOnly).toBe(false);
	});
});

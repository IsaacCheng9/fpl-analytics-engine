// DefCon and per-fixture club data only exist from 2025-26, so no earlier
// season can be backtested.
export const EVIDENCE_START_SEASON = "2025-26";
// Until the live season is halfway through, its backtests score too few
// predictions to judge the models, so the last complete season is shown.
export const EVIDENCE_MIN_LIVE_GW = 19;

function seasonStartYear(season: string): number {
	return Number(season.slice(0, 4));
}

function seasonLabel(startYear: number): string {
	return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// List the seasons that can be backtested, newest first.
export function evidenceSeasons(liveSeason: string): string[] {
	const seasons: string[] = [];
	const firstYear = seasonStartYear(EVIDENCE_START_SEASON);
	for (let year = seasonStartYear(liveSeason); year >= firstYear; year--) {
		seasons.push(seasonLabel(year));
	}
	return seasons.length > 0 ? seasons : [liveSeason];
}

// Prefer the last complete season while the live season's sample is small.
export function defaultEvidenceSeason(
	liveSeason: string,
	latestGw: number,
): string {
	const [live, previous] = evidenceSeasons(liveSeason);
	return latestGw < EVIDENCE_MIN_LIVE_GW && previous !== undefined
		? previous
		: live;
}

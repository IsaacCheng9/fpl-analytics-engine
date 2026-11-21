import type { UpcomingFixture } from "../api";

export const DEFAULT_FIXTURE_HORIZON = 5;
export const MAX_GAMEWEEK = 38;

function fdrPillClass(fdr: number): string {
	if (fdr <= 1) {
		return "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700/80 dark:bg-emerald-950/80 dark:text-emerald-200";
	}
	if (fdr <= 2) {
		return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300";
	}
	if (fdr === 3) {
		return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300";
	}
	if (fdr === 4) {
		return "border-red-200 bg-red-50 text-red-800 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300";
	}
	return "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-700/80 dark:bg-rose-950/80 dark:text-rose-200";
}

function venueTag(wasHome: boolean): "H" | "A" {
	return wasHome ? "H" : "A";
}

function formatFixtureShort(fixture: UpcomingFixture): string {
	return `${fixture.opponent_short_name} (${venueTag(fixture.was_home)})`;
}

function formatFixtureTitle(fixture: UpcomingFixture): string {
	return `GW${fixture.gw}: ${fixture.opponent_name} (${venueTag(fixture.was_home)}) - FDR ${fixture.fdr}`;
}

function formatDoubleTitle(gw: number, fixtures: UpcomingFixture[]): string {
	const legs = fixtures
		.map(
			(fixture) =>
				`${fixture.opponent_name} (${venueTag(fixture.was_home)}) - FDR ${fixture.fdr}`,
		)
		.join(" / ");
	return `GW${gw} (DGW): ${legs}`;
}

export function FixtureStrip({
	fixtures,
	startGw,
	horizon = DEFAULT_FIXTURE_HORIZON,
	maxGw = MAX_GAMEWEEK,
}: {
	fixtures: readonly UpcomingFixture[];
	startGw?: number | null;
	horizon?: number;
	maxGw?: number;
}) {
	if (fixtures.length === 0) {
		return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
	}

	const firstGw =
		startGw != null
			? startGw
			: Math.min(...fixtures.map((fixture) => fixture.gw));
	const maxFixtureGw = Math.max(...fixtures.map((fixture) => fixture.gw));
	const upperBound = Math.max(maxGw, maxFixtureGw);
	const endGw = Math.min(firstGw + horizon - 1, upperBound);
	if (endGw < firstGw) {
		return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
	}

	const byGw = new Map<number, UpcomingFixture[]>();
	for (const fixture of fixtures) {
		const existing = byGw.get(fixture.gw);
		if (existing) {
			existing.push(fixture);
		} else {
			byGw.set(fixture.gw, [fixture]);
		}
	}

	const slots = Array.from(
		{ length: endGw - firstGw + 1 },
		(_, index) => firstGw + index,
	);
	if (!slots.some((gw) => byGw.has(gw))) {
		return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
	}

	const rangeLabel =
		firstGw === endGw ? `GW${firstGw}` : `GW${firstGw} to GW${endGw}`;

	return (
		<ul
			className="inline-flex items-center gap-1"
			aria-label={`Upcoming fixtures ${rangeLabel}`}
		>
			{slots.map((gw) => {
				const slotFixtures = byGw.get(gw) ?? [];
				if (slotFixtures.length === 0) {
					const blankTitle = `GW${gw}: Blank gameweek`;
					return (
						<li key={gw} aria-label={blankTitle}>
							<span
								title={blankTitle}
								className="inline-flex min-w-[3.75rem] items-center justify-center rounded border border-dashed border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-medium text-[11px] leading-tight text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
							>
								BGW
							</span>
						</li>
					);
				}

				if (slotFixtures.length === 1) {
					const fixture = slotFixtures[0];
					const label = formatFixtureTitle(fixture);
					return (
						<li key={gw} aria-label={label}>
							<span
								title={label}
								className={`inline-flex min-w-[3.75rem] items-center justify-center whitespace-nowrap rounded border px-1.5 py-0.5 font-medium text-[11px] leading-tight ${fdrPillClass(fixture.fdr)}`}
							>
								{formatFixtureShort(fixture)}
							</span>
						</li>
					);
				}

				const dgwTitle = formatDoubleTitle(gw, slotFixtures);
				const keyCounts = new Map<string, number>();
				const keyedFixtures = slotFixtures.map((fixture) => {
					const baseKey = `${gw}-${fixture.opponent_name}-${venueTag(fixture.was_home)}-${fixture.fdr}`;
					const occurrence = (keyCounts.get(baseKey) ?? 0) + 1;
					keyCounts.set(baseKey, occurrence);
					return { fixture, key: `${baseKey}-${occurrence}` };
				});
				return (
					<li key={gw} aria-label={dgwTitle}>
						<span
							title={dgwTitle}
							className="inline-flex items-center gap-0.5 rounded border border-sky-300 bg-sky-50/70 px-0.5 py-0.5 dark:border-sky-700/80 dark:bg-sky-950/60"
						>
							{keyedFixtures.map(({ fixture, key }) => (
								<span
									key={key}
									className={`inline-flex items-center justify-center whitespace-nowrap rounded border px-1 py-0.5 font-medium text-[10px] leading-none ${fdrPillClass(fixture.fdr)}`}
								>
									{formatFixtureShort(fixture)}
								</span>
							))}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

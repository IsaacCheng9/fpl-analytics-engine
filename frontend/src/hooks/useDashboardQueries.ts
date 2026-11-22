import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type FplTeamPick,
	fetchClubForm,
	fetchClubFormValidation,
	fetchCurrentPlayerContext,
	fetchDefcon,
	fetchDefconProbability,
	fetchDefconProbabilityValidation,
	fetchForm,
	fetchFormValidation,
	fetchFplTeam,
	fetchMeta,
} from "../api";
import { defaultEvidenceSeason, evidenceSeasons } from "../lib/evidenceSeason";
import { LIVE_TEAM_STALE_TIME_MS } from "../queryClient";
import { defaultMinGames, defaultWindowSize, isPlayerTab } from "../state";
import type { UrlState } from "../urlState";

export function useDashboardQueries(urlState: UrlState) {
	const {
		tab,
		windowSize: windowSizeChoice,
		minMinutes,
		minGames: minGamesChoice,
		asOfGw,
		fplTeamId,
		showSquadView,
		compareOpen,
		compareWindow,
		compareAsOfGw,
		evidenceSeason: evidenceSeasonChoice,
	} = urlState;

	const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
	const analyticsReady = meta.data?.data_status === "ready";
	const latestGw = meta.data?.latest_gw ?? 0;
	const gameweeksPlayed = asOfGw ?? latestGw;
	const windowSize = windowSizeChoice ?? defaultWindowSize(gameweeksPlayed);
	const minGames = minGamesChoice ?? defaultMinGames(gameweeksPlayed);
	const isSquadViewActive =
		isPlayerTab(tab) && showSquadView && fplTeamId !== null;

	const fplTeamQuery = useQuery({
		queryKey: ["fplTeam", fplTeamId],
		queryFn: () => fetchFplTeam(fplTeamId as number, null),
		enabled: analyticsReady && fplTeamId !== null,
		staleTime: LIVE_TEAM_STALE_TIME_MS,
	});
	const importedTeam =
		fplTeamQuery.data?.entry_id === fplTeamId ? fplTeamQuery.data : undefined;
	const teamImportIdentityError =
		fplTeamQuery.data !== undefined && importedTeam === undefined;
	const ownedElements = useMemo(
		() => new Set(importedTeam?.owned_elements ?? []),
		[importedTeam],
	);
	const ownedElementList = useMemo(
		() => importedTeam?.owned_elements ?? [],
		[importedTeam],
	);
	const ownedCount = importedTeam?.owned_elements.length ?? 0;
	const hasImportedTeam = importedTeam !== undefined;
	const importedTeamBank = importedTeam?.bank ?? null;
	const squadPicks: FplTeamPick[] = importedTeam?.picks ?? [];

	// Fetch each table league-wide so heat ranges stay fixed as filters change;
	// position, hit-rate and games filters then apply client-side.
	const base = {
		window: windowSize,
		position: "" as const,
		minMinutes,
		asOfGw,
	};
	const squadBase = {
		window: windowSize,
		position: "" as const,
		minMinutes: 0,
		asOfGw,
	};
	const formQuery = useQuery({
		queryKey: ["form", windowSize, minMinutes, asOfGw],
		queryFn: () => fetchForm(base),
		enabled: analyticsReady && tab === "form",
	});
	const defconQuery = useQuery({
		queryKey: ["defcon", windowSize, minMinutes, asOfGw],
		queryFn: () => fetchDefcon({ ...base, minHitRate: 0 }),
		enabled: analyticsReady && tab === "defcon",
	});
	const defconProbQuery = useQuery({
		queryKey: ["defconProb", asOfGw],
		queryFn: () =>
			fetchDefconProbability({ position: "", minGames: 0, asOfGw }),
		enabled: analyticsReady && tab === "defconProb",
	});
	const clubQuery = useQuery({
		queryKey: ["clubs", windowSize, asOfGw],
		queryFn: () => fetchClubForm({ window: windowSize, asOfGw }),
		enabled: analyticsReady && tab === "clubs",
	});

	const liveSeason = meta.data?.season ?? "";
	const availableEvidenceSeasons = liveSeason
		? evidenceSeasons(liveSeason)
		: [];
	const evidenceSeason =
		evidenceSeasonChoice !== null &&
		(availableEvidenceSeasons.length === 0 ||
			availableEvidenceSeasons.includes(evidenceSeasonChoice))
			? evidenceSeasonChoice
			: defaultEvidenceSeason(liveSeason, latestGw);
	// Keep the previous season on screen while a newly selected one loads, so
	// the season selector stays put.
	const defconValidationQuery = useQuery({
		queryKey: ["defconValidation", evidenceSeason],
		queryFn: () => fetchDefconProbabilityValidation({ season: evidenceSeason }),
		enabled: analyticsReady && tab === "evidence",
		placeholderData: keepPreviousData,
	});
	const formValidationQuery = useQuery({
		queryKey: ["formValidation", evidenceSeason],
		queryFn: () => fetchFormValidation({ season: evidenceSeason }),
		enabled: analyticsReady && tab === "evidence",
		placeholderData: keepPreviousData,
	});
	const clubValidationQuery = useQuery({
		queryKey: ["clubValidation", evidenceSeason],
		queryFn: () => fetchClubFormValidation({ season: evidenceSeason }),
		enabled: analyticsReady && tab === "evidence",
		placeholderData: keepPreviousData,
	});

	const squadFormQuery = useQuery({
		queryKey: ["form", windowSize, 0, asOfGw],
		queryFn: () => fetchForm(squadBase),
		enabled: analyticsReady && isSquadViewActive,
	});
	const squadCurrentContextQuery = useQuery({
		queryKey: ["squadCurrentContext"],
		queryFn: fetchCurrentPlayerContext,
		enabled: analyticsReady && isSquadViewActive,
	});
	const squadDefconProbabilityQuery = useQuery({
		queryKey: ["defconProb", asOfGw],
		queryFn: () =>
			fetchDefconProbability({
				position: "",
				minGames: 0,
				asOfGw,
			}),
		enabled: analyticsReady && isSquadViewActive,
	});

	const compareFormQuery = useQuery({
		queryKey: ["form", compareWindow, 0, compareAsOfGw],
		queryFn: () =>
			fetchForm({
				window: compareWindow,
				position: "",
				minMinutes: 0,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareDefconQuery = useQuery({
		queryKey: ["defcon", compareWindow, 0, compareAsOfGw],
		queryFn: () =>
			fetchDefcon({
				window: compareWindow,
				position: "",
				minMinutes: 0,
				minHitRate: 0,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareDefconProbabilityQuery = useQuery({
		queryKey: ["defconProb", compareAsOfGw],
		queryFn: () =>
			fetchDefconProbability({
				position: "",
				minGames: 0,
				asOfGw: compareAsOfGw,
			}),
		enabled: analyticsReady && compareOpen,
	});
	const compareClubQuery = useQuery({
		queryKey: ["clubs", compareWindow, compareAsOfGw],
		queryFn: () =>
			fetchClubForm({ window: compareWindow, asOfGw: compareAsOfGw }),
		enabled: analyticsReady && compareOpen,
	});

	const comparePlayerOptions = useMemo(
		() =>
			[...(compareFormQuery.data ?? [])]
				.sort((left, right) => {
					const name = left.web_name.localeCompare(right.web_name);
					return name !== 0
						? name
						: (left.team_name ?? "").localeCompare(right.team_name ?? "");
				})
				.map((player) => ({
					element: player.element,
					web_name: player.web_name,
					position: player.position,
					team_name: player.team_name,
				})),
		[compareFormQuery.data],
	);
	const compareOptionElements = useMemo(
		() => new Set(comparePlayerOptions.map((player) => player.element)),
		[comparePlayerOptions],
	);

	const active =
		tab === "form"
			? formQuery
			: tab === "defcon"
				? defconQuery
				: tab === "defconProb"
					? defconProbQuery
					: tab === "clubs"
						? clubQuery
						: null;

	// Team dropdown options derived from the loaded players, independent of the
	// client-side player/team filters so the list stays stable.
	const teamOptions = useMemo(() => {
		const rows = (active?.data ?? []) as Array<{ team_name: string | null }>;
		const names = rows
			.map((row) => row.team_name)
			.filter((name): name is string => name !== null);
		return Array.from(new Set(names)).sort();
	}, [active?.data]);

	return {
		meta,
		analyticsReady,
		latestGw,
		liveSeason,
		evidenceSeason,
		gameweeksPlayed,
		windowSize,
		minGames,
		isSquadViewActive,
		fplTeamQuery,
		teamImportIdentityError,
		ownedElements,
		ownedElementList,
		ownedCount,
		hasImportedTeam,
		importedTeamBank,
		squadPicks,
		formQuery,
		defconQuery,
		defconProbQuery,
		clubQuery,
		defconValidationQuery,
		formValidationQuery,
		clubValidationQuery,
		squadFormQuery,
		squadCurrentContextQuery,
		squadDefconProbabilityQuery,
		compareFormQuery,
		compareDefconQuery,
		compareDefconProbabilityQuery,
		compareClubQuery,
		comparePlayerOptions,
		compareOptionElements,
		active,
		teamOptions,
	};
}

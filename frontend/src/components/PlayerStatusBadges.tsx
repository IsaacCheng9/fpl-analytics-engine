import {
	availabilityBadge,
	cardRiskBadge,
	type PlayerLiveStatus,
	type StatusTone,
	setPieceDuties,
} from "../lib/playerStatus";

const statusBadgeClass: Record<StatusTone, string> = {
	risk: "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300",
	watch:
		"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300",
};

const basePillClass =
	"inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-0.5 font-semibold text-[10px] leading-tight";

export function PlayerStatusBadges({
	player,
	mode = "compact",
}: {
	player: PlayerLiveStatus | null | undefined;
	mode?: "compact" | "full";
}) {
	if (!player) {
		return null;
	}
	const availability = availabilityBadge(player);
	const cardRisk = cardRiskBadge(player.yellow_cards);
	const allDuties = setPieceDuties(player);
	const duties =
		mode === "full" ? allDuties : allDuties.filter((duty) => duty.code === "P");

	if (!availability && !cardRisk && duties.length === 0) {
		return null;
	}

	return (
		<span className="inline-flex shrink-0 items-center gap-1">
			{availability ? (
				<span
					title={availability.tooltip}
					className={`${basePillClass} ${statusBadgeClass[availability.tone]}`}
				>
					<span aria-hidden="true">{availability.label}</span>
					<span className="sr-only">{availability.tooltip}</span>
				</span>
			) : null}
			{cardRisk ? (
				<span
					title={cardRisk.tooltip}
					className={`${basePillClass} ${statusBadgeClass[cardRisk.tone]}`}
				>
					<span aria-hidden="true">{cardRisk.label}</span>
					<span className="sr-only">{cardRisk.tooltip}</span>
				</span>
			) : null}
			{duties.map((duty) => (
				<span
					key={duty.code}
					title={duty.tooltip}
					className={`${basePillClass} border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300`}
				>
					<span aria-hidden="true">{duty.code}</span>
					<span className="sr-only">{duty.tooltip}</span>
				</span>
			))}
		</span>
	);
}

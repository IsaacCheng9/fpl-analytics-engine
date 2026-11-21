import type { ReactNode } from "react";
import type { Meta } from "../api";

function formatDeadline(deadline: string | null): string {
	if (deadline === null) {
		return "To Be Confirmed";
	}
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/London",
		timeZoneName: "short",
	}).format(new Date(deadline));
}

export function SeasonStatus({
	meta,
	state,
	onRetry,
	headerAction,
}: {
	meta?: Meta;
	state: "loading" | "error" | "preseason";
	onRetry?: () => void;
	headerAction?: ReactNode;
}) {
	const title =
		state === "loading"
			? "Checking The Live Season"
			: state === "error"
				? "Season Status Unavailable"
				: "Waiting For GW1 Data";
	const description =
		state === "loading"
			? "Loading the current FPL season metadata."
			: state === "error"
				? "The API could not report the current season. Try again after the service is available."
				: "The new FPL season is live and its players and fixtures are archived. Current-season form and DefCon analytics will appear after GW1 is complete and the next data refresh has run.";

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
			<div className="app-shell mx-auto px-6 py-8">
				<header className="mb-8">
					<div className="flex items-start justify-between gap-4">
						<h1 className="font-semibold text-2xl">FPL Analytics Engine</h1>
						{headerAction}
					</div>
					<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
						Point-in-time transfer research for the {meta?.season ?? "live"}{" "}
						season.
					</p>
				</header>
				<section
					aria-labelledby="season-status-title"
					className="border-zinc-200 border-y bg-white py-8 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div className="grid gap-6 px-1 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
						<div>
							<p className="mb-2 font-medium text-emerald-700 text-sm dark:text-emerald-400">
								{meta?.season ?? "Live Season"}
							</p>
							<h2
								id="season-status-title"
								className="font-semibold text-2xl text-zinc-900 dark:text-zinc-100"
							>
								{title}
							</h2>
							<p className="mt-3 max-w-2xl text-sm text-zinc-600 leading-6 dark:text-zinc-300">
								{description}
							</p>
							{state === "error" && onRetry ? (
								<button
									type="button"
									className="mt-4 rounded-md px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
									onClick={onRetry}
								>
									Retry
								</button>
							) : null}
						</div>
						{state === "preseason" ? (
							<div className="border-zinc-200 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6 dark:border-zinc-800">
								<p className="font-medium text-xs text-zinc-500 uppercase dark:text-zinc-400">
									Next Deadline
								</p>
								<p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">
									{formatDeadline(meta?.next_deadline ?? null)}
								</p>
								<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
									Gameweek 1
								</p>
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	);
}

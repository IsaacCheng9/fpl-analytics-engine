import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const LIVE_TEAM_STALE_TIME_MS = 60_000;

// Skip retries on 4xx client errors (e.g. unknown FPL team ID) and cap
// retries for transient network or 5xx failures.
export function shouldRetryQuery(
	failureCount: number,
	error: unknown,
): boolean {
	if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
		return false;
	}
	return failureCount < 2;
}

// Snapshot-backed API endpoints are immutable for the lifetime of a
// deployment, so keep them fresh across tab switches and window focus changes.
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Number.POSITIVE_INFINITY,
				refetchOnWindowFocus: false,
				retry: shouldRetryQuery,
			},
		},
	});
}

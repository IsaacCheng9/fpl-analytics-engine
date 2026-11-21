import { describe, expect, test } from "vitest";
import { ApiError } from "./api";
import { createQueryClient, shouldRetryQuery } from "./queryClient";

describe("queryClient defaults", () => {
	test("keeps snapshot queries fresh and disables window-focus refetches", () => {
		const client = createQueryClient();
		const defaults = client.getDefaultOptions().queries;

		expect(defaults?.staleTime).toBe(Number.POSITIVE_INFINITY);
		expect(defaults?.refetchOnWindowFocus).toBe(false);
		expect(defaults?.retry).toBe(shouldRetryQuery);
	});

	test("skips retries on 4xx ApiError responses but retries transient failures", () => {
		expect(shouldRetryQuery(0, new ApiError(404))).toBe(false);
		expect(shouldRetryQuery(0, new ApiError(422))).toBe(false);
		expect(shouldRetryQuery(0, new ApiError(502))).toBe(true);
		expect(shouldRetryQuery(1, new ApiError(503))).toBe(true);
		expect(shouldRetryQuery(2, new ApiError(503))).toBe(false);
		expect(shouldRetryQuery(0, new Error("network"))).toBe(true);
	});
});

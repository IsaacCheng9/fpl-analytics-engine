import { describe, expect, test } from "vitest";
import { DEFAULT_TRANSFER_FILTERS, type TransferFilterRow } from "../state";
import { filterTransferCandidates } from "./filters";

type Candidate = TransferFilterRow & { web_name: string };

const candidates: Candidate[] = [
	{ web_name: "AvailablePen", status: "a", penalties_order: 1 },
	{ web_name: "Doubtful", status: "d", penalties_order: 2 },
	{ web_name: "InjuredPen", status: "i", penalties_order: 1 },
	{ web_name: "Suspended", status: "s", penalties_order: null },
	{ web_name: "Unavailable", status: "u", penalties_order: null },
	{ web_name: "UnknownStatus", status: null, penalties_order: null },
];

describe("filterTransferCandidates live-snapshot filters", () => {
	test("excludeUnavailable drops i/s/u rows and keeps a/d/null rows", () => {
		const filtered = filterTransferCandidates(candidates, {
			...DEFAULT_TRANSFER_FILTERS,
			excludeUnavailable: true,
		});
		expect(filtered.map((row) => row.web_name)).toEqual([
			"AvailablePen",
			"Doubtful",
			"UnknownStatus",
		]);
	});

	test("penaltiesOnly keeps only primary penalty takers", () => {
		const filtered = filterTransferCandidates(candidates, {
			...DEFAULT_TRANSFER_FILTERS,
			penaltiesOnly: true,
		});
		expect(filtered.map((row) => row.web_name)).toEqual([
			"AvailablePen",
			"InjuredPen",
		]);
	});

	test("combines excludeUnavailable and penaltiesOnly", () => {
		const filtered = filterTransferCandidates(candidates, {
			...DEFAULT_TRANSFER_FILTERS,
			excludeUnavailable: true,
			penaltiesOnly: true,
		});
		expect(filtered.map((row) => row.web_name)).toEqual(["AvailablePen"]);
	});
});

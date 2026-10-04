import { expect, test } from "vitest";
import { defaultEvidenceSeason, evidenceSeasons } from "./evidenceSeason";

test("offers only seasons from 2025-26 onwards, newest first", () => {
	expect(evidenceSeasons("2027-28")).toEqual(["2027-28", "2026-27", "2025-26"]);
	expect(evidenceSeasons("2025-26")).toEqual(["2025-26"]);
	expect(evidenceSeasons("2099-00")[1]).toBe("2098-99");
});

test("defaults to the last complete season until the live season reaches GW19", () => {
	expect(defaultEvidenceSeason("2026-27", 4)).toBe("2025-26");
	expect(defaultEvidenceSeason("2026-27", 18)).toBe("2025-26");
	expect(defaultEvidenceSeason("2026-27", 19)).toBe("2026-27");
	expect(defaultEvidenceSeason("2026-27", 38)).toBe("2026-27");
});

test("keeps the live season when no earlier season has DefCon data", () => {
	expect(defaultEvidenceSeason("2025-26", 4)).toBe("2025-26");
});

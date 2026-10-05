import { expect, test } from "vitest";
import { fmtDelta, fmtNum, fmtPctPoints } from "./format";

test("shows deltas that round to zero without a sign", () => {
	expect(fmtDelta(-0.004)).toBe("0.00");
	expect(fmtDelta(0.004)).toBe("0.00");
	expect(fmtDelta(-0)).toBe("0.00");
	expect(fmtDelta(0.005)).toBe("+0.01");
	expect(fmtDelta(-0.32)).toBe("-0.32");
	expect(fmtDelta(0.4, 1)).toBe("+0.4");
	expect(fmtDelta(null)).toBe("-");
});

test("shows numbers and percentage points that round to zero as zero", () => {
	expect(fmtNum(-0.001)).toBe("0.00");
	expect(fmtNum(-1.5, 1)).toBe("-1.5");
	expect(fmtPctPoints(-0.01)).toBe("0.0%");
	expect(fmtPctPoints(15.55, 1)).toBe("15.6%");
});

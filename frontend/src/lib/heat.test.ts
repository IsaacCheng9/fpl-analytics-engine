import { expect, test } from "vitest";
import { divergingScale, FDR_SCALE, heatColour, sequentialScale } from "./heat";

test("leaves zero uncoloured on a diverging scale", () => {
	const scale = divergingScale({ min: -0.2, max: 0.4 });

	expect(heatColour(0, scale)).toBeUndefined();
	expect(heatColour(null, scale)).toBeUndefined();
});

test("shades gains and losses of equal size with equal translucent strength", () => {
	const scale = divergingScale({ min: -0.2, max: 0.4 });

	// Half the 0.4 extent gives half the maximum alpha in each direction so
	// shading adapts to both light and dark table backgrounds.
	expect(heatColour(0.2, scale)).toBe("rgba(34, 197, 94, 0.225)");
	expect(heatColour(-0.2, scale)).toBe("rgba(239, 68, 68, 0.225)");
});

test("treats lower values as favourable when lower is better", () => {
	const scale = divergingScale({ min: -1, max: 1 }, true);

	expect(heatColour(-0.5, scale)).toBe(
		heatColour(0.5, divergingScale({ min: -1, max: 1 })),
	);
});

test("shades FDR on its fixed scale with 3 as neutral", () => {
	expect(heatColour(3, FDR_SCALE)).toBeUndefined();
	expect(heatColour(2, FDR_SCALE)).toBe(
		heatColour(0.5, divergingScale({ min: -1, max: 1 })),
	);
	expect(heatColour(4, FDR_SCALE)).toBe(
		heatColour(-0.5, divergingScale({ min: -1, max: 1 })),
	);
});

test("shades sequential metrics transparently from the minimum value", () => {
	const scale = sequentialScale({ min: 0, max: 1 });

	expect(heatColour(0, scale)).toBeUndefined();
	expect(heatColour(1, scale)).toBe(
		heatColour(1, divergingScale({ min: -1, max: 1 })),
	);
	expect(heatColour(0, sequentialScale({ min: 0, max: 1 }, true))).toBe(
		heatColour(1, scale),
	);
	expect(heatColour(1, sequentialScale({ min: 1, max: 1 }))).toBeUndefined();
});

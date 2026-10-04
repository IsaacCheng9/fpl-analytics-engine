export type Range = { min: number; max: number };

// Sequential scales shade more-is-better metrics in one hue; diverging scales
// split favourable and unfavourable values around a neutral centre.
export type HeatScale =
	| { kind: "sequential"; range: Range; lowerIsBetter: boolean }
	| {
			kind: "diverging";
			centre: number;
			extent: number;
			lowerIsBetter: boolean;
	  };

type Rgb = [number, number, number];

// Green and red match the fixture difficulty colours FPL players already read.
const FAVOURABLE: Rgb = [34, 197, 94];
const UNFAVOURABLE: Rgb = [239, 68, 68];
// Cap the tint so dark cell text stays readable on the strongest fills.
const MAX_TINT = 0.45;

// FDR is a fixed 1-5 rating, so shade it on that scale rather than the
// observed range, with 3 as neutral.
export const FDR_SCALE: HeatScale = {
	kind: "diverging",
	centre: 3,
	extent: 2,
	lowerIsBetter: true,
};

export function sequentialScale(
	range: Range,
	lowerIsBetter = false,
): HeatScale {
	return { kind: "sequential", range, lowerIsBetter };
}

// Centre on zero and use the larger side of the range for both directions, so
// equal-sized gains and losses get equally strong colours.
export function divergingScale(range: Range, lowerIsBetter = false): HeatScale {
	return {
		kind: "diverging",
		centre: 0,
		extent: Math.max(Math.abs(range.min), Math.abs(range.max)),
		lowerIsBetter,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function tint([red, green, blue]: Rgb, strength: number): string {
	const mix = (channel: number) =>
		Math.round(255 - (255 - channel) * strength * MAX_TINT);
	return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

export function heatColour(
	value: number | null | undefined,
	scale: HeatScale,
): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (scale.kind === "sequential") {
		const { min, max } = scale.range;
		if (max <= min) {
			return undefined;
		}
		const t = clamp((value - min) / (max - min), 0, 1);
		return tint(FAVOURABLE, scale.lowerIsBetter ? 1 - t : t);
	}
	if (scale.extent <= 0) {
		return undefined;
	}
	const direction = scale.lowerIsBetter ? -1 : 1;
	const score = clamp((value - scale.centre) / scale.extent, -1, 1) * direction;
	if (score === 0) {
		return undefined;
	}
	return tint(score > 0 ? FAVOURABLE : UNFAVOURABLE, Math.abs(score));
}

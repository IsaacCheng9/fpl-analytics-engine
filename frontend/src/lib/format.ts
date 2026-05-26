// A missing metric (null from the API, or undefined if a field is absent)
// renders as a dash rather than throwing, so a partial payload never crashes
// the view.
type Maybe = number | null | undefined;

export function fmtNum(value: Maybe, digits = 2): string {
	return value == null ? "-" : value.toFixed(digits);
}

export function fmtPrice(value: number): string {
	// £ is the pound sign; kept as an escape to keep the source ASCII.
	return `£${value.toFixed(1)}m`;
}

export function fmtPct(value: Maybe): string {
	return value == null ? "-" : `${Math.round(value * 100)}%`;
}

// Format a value already expressed in percentage points (e.g. ownership 15.5).
export function fmtPctPoints(value: Maybe, digits = 1): string {
	return value == null ? "-" : `${value.toFixed(digits)}%`;
}

// Format a signed delta with an explicit leading plus for positive values.
export function fmtDelta(value: Maybe, digits = 2): string {
	if (value == null) {
		return "-";
	}
	return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

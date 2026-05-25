export function fmtNum(value: number | null, digits = 2): string {
	return value === null ? "-" : value.toFixed(digits);
}

export function fmtPrice(value: number): string {
	// £ is the pound sign; kept as an escape to keep the source ASCII.
	return `£${value.toFixed(1)}m`;
}

export function fmtPct(value: number | null): string {
	return value === null ? "-" : `${Math.round(value * 100)}%`;
}

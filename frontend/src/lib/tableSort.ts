import type { SortingState } from "@tanstack/react-table";

// A table sort is shared in the URL as `column:asc` or `column:desc`.
const SORT_PARAM = /^(\w+):(asc|desc)$/;

export function parseSortParam(value: string | null): string | null {
	return value !== null && SORT_PARAM.test(value) ? value : null;
}

export function sortingFromParam(value: string | null): SortingState {
	const match = value === null ? null : SORT_PARAM.exec(value);
	return match ? [{ id: match[1], desc: match[2] === "desc" }] : [];
}

export function sortingToParam(sorting: SortingState): string | null {
	const [first] = sorting;
	return first ? `${first.id}:${first.desc ? "desc" : "asc"}` : null;
}

import { expect, test } from "vitest";
import { parseSortParam, sortingFromParam, sortingToParam } from "./tableSort";

test("round-trips a table sort through the URL parameter", () => {
	expect(sortingFromParam("delta_xgi90:desc")).toEqual([
		{ id: "delta_xgi90", desc: true },
	]);
	expect(sortingToParam([{ id: "price", desc: false }])).toBe("price:asc");
	expect(sortingToParam([])).toBeNull();
	expect(sortingFromParam(null)).toEqual([]);
});

test("rejects malformed sort parameters", () => {
	expect(parseSortParam("price:up")).toBeNull();
	expect(parseSortParam("price")).toBeNull();
	expect(parseSortParam("bad id:asc")).toBeNull();
	expect(parseSortParam("price:desc")).toBe("price:desc");
});

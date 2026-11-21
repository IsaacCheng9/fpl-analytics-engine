import type { ColumnDef } from "@tanstack/react-table";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { DataTable } from "./DataTable";

type Player = { name: string; points: number };
const players: Player[] = Array.from({ length: 63 }, (_, index) => ({
	name: `Player ${index + 1}`,
	points: index + 1,
}));
const columns: ColumnDef<Player>[] = [
	{ accessorKey: "name", header: "Player" },
	{ accessorKey: "points", header: "Points" },
];
const pageButton = (name: string) => screen.getAllByRole("button", { name })[0];
const sizeSelect = () =>
	screen.getAllByRole("combobox", { name: "Rows Per Page" })[0];
const bodyRows = () =>
	within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

const scrollIntoView = vi.fn();
beforeEach(() => {
	scrollIntoView.mockClear();
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoView,
	});
});

test("paginates with synchronised controls and correct boundary states", () => {
	render(<DataTable data={players} columns={columns} paginate />);
	expect(bodyRows()).toHaveLength(25);
	expect(screen.getAllByText("1-25 of 63 rows")).toHaveLength(2);
	expect(pageButton("First Page")).toBeDisabled();
	expect(pageButton("Previous Page")).toBeDisabled();
	fireEvent.click(pageButton("Next Page"));
	expect(screen.getByText("Player 26")).toBeInTheDocument();
	expect(screen.queryByText("Player 1")).not.toBeInTheDocument();
	fireEvent.click(pageButton("Last Page"));
	expect(bodyRows()).toHaveLength(13);
	expect(screen.getAllByText("51-63 of 63 rows")).toHaveLength(2);
	expect(pageButton("Next Page")).toBeDisabled();
	expect(pageButton("Last Page")).toBeDisabled();
	fireEvent.click(pageButton("Previous Page"));
	expect(screen.getByText("Player 26")).toBeInTheDocument();
	fireEvent.click(pageButton("First Page"));
	expect(screen.getByText("Player 1")).toBeInTheDocument();
});

test("changes page size from either control and keeps All dynamic", async () => {
	const { rerender } = render(
		<DataTable data={players} columns={columns} paginate />,
	);
	fireEvent.click(pageButton("Last Page"));
	fireEvent.change(
		screen.getAllByRole("combobox", { name: "Rows Per Page" })[1],
		{ target: { value: "10" } },
	);
	expect(bodyRows()).toHaveLength(10);
	expect(sizeSelect()).toHaveValue("10");
	expect(screen.getByText("Player 1")).toBeInTheDocument();
	for (const size of [50, 100]) {
		fireEvent.change(sizeSelect(), { target: { value: String(size) } });
		expect(bodyRows()).toHaveLength(Math.min(size, players.length));
	}
	fireEvent.change(sizeSelect(), { target: { value: "all" } });
	expect(bodyRows()).toHaveLength(63);
	expect(pageButton("Next Page")).toBeDisabled();
	rerender(
		<DataTable
			data={[...players, { name: "New Player", points: 99 }]}
			columns={columns}
			paginate
		/>,
	);
	await waitFor(() => expect(bodyRows()).toHaveLength(64));
	expect(sizeSelect()).toHaveValue("all");
});

test("sorts all results before pagination and resets to the first page", async () => {
	render(<DataTable data={players} columns={columns} paginate />);
	await screen.findByText("Player 1");
	fireEvent.click(pageButton("Last Page"));
	fireEvent.click(screen.getByRole("button", { name: "Points" }));
	await waitFor(() =>
		expect(screen.getAllByText("Page 1 of 3")).toHaveLength(2),
	);
	expect(within(bodyRows()[0]).getByText("Player 63")).toBeInTheDocument();
	expect(screen.queryByText("Player 1")).not.toBeInTheDocument();
});

test("resets when filtered results change and handles empty results", async () => {
	const { rerender } = render(
		<DataTable data={players} columns={columns} paginate />,
	);
	await screen.findByText("Player 1");
	fireEvent.click(pageButton("Last Page"));
	rerender(
		<DataTable data={players.slice(10, 13)} columns={columns} paginate />,
	);
	await waitFor(() =>
		expect(screen.getByText("Player 11")).toBeInTheDocument(),
	);
	expect(screen.getAllByText("1-3 of 3 rows")).toHaveLength(2);
	rerender(
		<DataTable
			data={[]}
			columns={columns}
			paginate
			emptyTitle="No players match"
		/>,
	);
	await waitFor(() =>
		expect(screen.getAllByText("0-0 of 0 rows")).toHaveLength(2),
	);
	expect(screen.getByText("No players match")).toBeInTheDocument();
	for (const name of [
		"First Page",
		"Previous Page",
		"Next Page",
		"Last Page",
	]) {
		expect(pageButton(name)).toBeDisabled();
	}
});

test("retains row identity and cell styling on later pages", () => {
	const onRowClick = vi.fn();
	const action = vi.fn();
	render(
		<DataTable
			data={players}
			columns={columns}
			paginate
			onRowClick={onRowClick}
			stickyDataColumns={1}
			rowStickyClassName={() => "bg-sky-100"}
			renderRowActions={(player) => (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						action(player);
					}}
				>
					Shortlist {player.name}
				</button>
			)}
		/>,
	);
	fireEvent.click(pageButton("Next Page"));
	fireEvent.click(screen.getByText("Player 26"));
	expect(onRowClick).toHaveBeenCalledWith(players[25]);
	expect(screen.getByText("Player 26")).toHaveClass("bg-sky-100");
	fireEvent.click(screen.getByRole("button", { name: "Shortlist Player 26" }));
	expect(action).toHaveBeenCalledWith(players[25]);
	expect(onRowClick).toHaveBeenCalledTimes(1);
});

test("leaves tables unpaginated unless enabled", () => {
	render(<DataTable data={players} columns={columns} />);
	expect(bodyRows()).toHaveLength(63);
	expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

test("returns focus to the top controls after footer navigation", () => {
	const onPageSizeChange = vi.fn();
	render(
		<DataTable
			data={players}
			columns={columns}
			paginate
			onPageSizeChange={onPageSizeChange}
		/>,
	);
	const top = screen.getByRole("navigation", {
		name: "Table Pagination (Top)",
	});
	const bottom = screen.getByRole("navigation", {
		name: "Table Pagination (Bottom)",
	});
	expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
	fireEvent.click(within(top).getByRole("button", { name: "Next Page" }));
	expect(scrollIntoView).not.toHaveBeenCalled();
	fireEvent.click(within(bottom).getByRole("button", { name: "Next Page" }));
	expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
	expect(top).toHaveFocus();
	expect(screen.getByText("Player 51")).toBeInTheDocument();
	fireEvent.change(within(bottom).getByRole("combobox"), {
		target: { value: "50" },
	});
	expect(scrollIntoView).toHaveBeenCalledTimes(2);
	expect(onPageSizeChange).toHaveBeenCalledWith(50);
	expect(top).toHaveFocus();
	expect(bodyRows()).toHaveLength(50);
});

test("right-aligns numeric columns with fixed-width digits", () => {
	render(
		<DataTable
			data={players.slice(0, 1)}
			columns={[
				{ accessorKey: "name", header: "Player" },
				{ accessorKey: "points", header: "Points", meta: { numeric: true } },
			]}
		/>,
	);

	const [nameCell, pointsCell] = within(bodyRows()[0]).getAllByRole("cell");
	expect(pointsCell).toHaveClass("text-right", "tabular-nums");
	expect(nameCell).not.toHaveClass("text-right");
	expect(screen.getByRole("button", { name: "Points" })).toHaveClass(
		"text-right",
	);
});

test("opens clickable rows from the keyboard without hijacking row buttons", () => {
	const onRowClick = vi.fn();
	const onAction = vi.fn();
	render(
		<DataTable
			data={players.slice(0, 1)}
			columns={columns}
			onRowClick={onRowClick}
			renderRowActions={() => (
				<button type="button" onClick={onAction}>
					Shortlist
				</button>
			)}
		/>,
	);

	const row = bodyRows()[0];
	expect(row).toHaveAttribute("tabindex", "0");
	fireEvent.keyDown(row, { key: "Enter" });
	fireEvent.keyDown(row, { key: " " });
	expect(onRowClick).toHaveBeenCalledTimes(2);

	fireEvent.keyDown(within(row).getByRole("button", { name: "Shortlist" }), {
		key: "Enter",
	});
	expect(onRowClick).toHaveBeenCalledTimes(2);
});

test("restricts horizontal sticky columns to medium and wider viewports", () => {
	render(
		<DataTable
			data={players.slice(0, 1)}
			columns={columns}
			stickyDataColumns={1}
			renderRowActions={() => <button type="button">Shortlist</button>}
		/>,
	);

	const headerCells = screen.getAllByRole("columnheader");
	const [actionHeader, playerHeader, pointsHeader] = headerCells;
	expect(actionHeader).toHaveClass("md:left-0", "md:z-40");
	expect(actionHeader).not.toHaveClass("left-0");
	expect(playerHeader).toHaveClass("md:left-(--sticky-left)", "md:z-40");
	expect(playerHeader.style.getPropertyValue("--sticky-left")).toBe("48px");
	expect(playerHeader.style.getPropertyValue("--sticky-width")).toBe("144px");
	expect(playerHeader.style.left).toBe("");
	expect(pointsHeader).not.toHaveClass("md:left-(--sticky-left)");

	const [actionCell, playerCell, pointsCell] = within(
		bodyRows()[0],
	).getAllByRole("cell");
	expect(actionCell).toHaveClass("md:sticky", "md:left-0");
	expect(actionCell).not.toHaveClass("sticky");
	expect(playerCell).toHaveClass("md:sticky", "md:left-(--sticky-left)");
	expect(playerCell).not.toHaveClass("sticky");
	expect(playerCell.style.getPropertyValue("--sticky-left")).toBe("48px");
	expect(playerCell.style.left).toBe("");
	expect(pointsCell).not.toHaveClass("md:sticky");
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PlayerCombobox, type PlayerOption } from "./PlayerCombobox";

const options: PlayerOption[] = [
	{ element: 1, web_name: "Saka", team_name: "Arsenal", position: "MID" },
	{ element: 2, web_name: "Salah", team_name: "Liverpool", position: "MID" },
	{ element: 3, web_name: "Haaland", team_name: "Man City", position: "FWD" },
];

describe("PlayerCombobox", () => {
	test("filters by partial text and selects the active option on Enter", () => {
		const onChange = vi.fn();
		render(
			<PlayerCombobox
				id="player-a"
				label="First Player"
				options={options}
				value={null}
				onChange={onChange}
			/>,
		);

		const input = screen.getByRole("combobox", { name: "First Player" });
		fireEvent.change(input, { target: { value: "Sa" } });
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		expect(screen.getAllByRole("option")).toHaveLength(2);

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).toHaveBeenCalledWith(2);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	test("closes open dropdown on Escape without propagating to parent dialogs", () => {
		const onDialogEscape = vi.fn();
		const onChange = vi.fn();
		render(
			<div
				role="dialog"
				onKeyDown={(event) => {
					if (event.key === "Escape" && !event.defaultPrevented) {
						onDialogEscape();
					}
				}}
			>
				<PlayerCombobox
					id="player-b"
					label="Second Player"
					options={options}
					value={1}
					onChange={onChange}
				/>
			</div>,
		);

		const input = screen.getByRole("combobox", { name: "Second Player" });
		fireEvent.change(input, { target: { value: "Haa" } });
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(input).toHaveValue("Saka - Arsenal - MID");
		expect(onDialogEscape).not.toHaveBeenCalled();

		fireEvent.keyDown(input, { key: "Escape" });
		expect(onDialogEscape).toHaveBeenCalledTimes(1);
	});
});

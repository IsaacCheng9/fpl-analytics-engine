import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { InfoTooltip } from "./InfoTooltip";

describe("InfoTooltip", () => {
	test("shows on focus and hides on blur, Escape, or scroll while focused", () => {
		render(<InfoTooltip text="Explains the metric" />);
		const button = screen.getByRole("button", { name: "Show explanation" });

		fireEvent.focus(button);
		expect(screen.getByRole("tooltip")).toHaveTextContent(
			"Explains the metric",
		);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		fireEvent.focus(button);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();
		fireEvent.scroll(window);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		fireEvent.focus(button);
		fireEvent.blur(button);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("toggles off on second click even when focused and hovered", () => {
		render(<InfoTooltip text="Toggle help text" />);
		const trigger = screen.getByRole("button", { name: "Show explanation" });

		fireEvent.mouseEnter(trigger);
		fireEvent.focus(trigger);
		fireEvent.click(trigger);
		expect(screen.getByRole("tooltip")).toHaveTextContent("Toggle help text");

		fireEvent.click(trigger);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("capture-phase Escape dismisses tooltip without closing a parent dialog listener", () => {
		const onDialogEscape = vi.fn();
		function onDocumentEscape(event: KeyboardEvent) {
			if (event.key === "Escape" && !event.defaultPrevented) {
				onDialogEscape();
			}
		}
		document.addEventListener("keydown", onDocumentEscape);
		try {
			render(<InfoTooltip text="Inside modal" />);
			const trigger = screen.getByRole("button", { name: "Show explanation" });
			fireEvent.click(trigger);
			expect(screen.getByRole("tooltip")).toBeInTheDocument();

			fireEvent.keyDown(document, { key: "Escape" });
			expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
			expect(onDialogEscape).not.toHaveBeenCalled();

			fireEvent.keyDown(document, { key: "Escape" });
			expect(onDialogEscape).toHaveBeenCalledTimes(1);
		} finally {
			document.removeEventListener("keydown", onDocumentEscape);
		}
	});

	test("dismisses pinned tooltip on outside click", () => {
		render(
			<div>
				<InfoTooltip text="Pinned help text" />
				<button type="button">Outside</button>
			</div>,
		);
		const trigger = screen.getByRole("button", { name: "Show explanation" });
		fireEvent.click(trigger);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();

		fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

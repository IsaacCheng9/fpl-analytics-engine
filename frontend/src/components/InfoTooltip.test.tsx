import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { InfoTooltip } from "./InfoTooltip";

describe("InfoTooltip", () => {
	test("shows on focus and hides on blur", () => {
		render(<InfoTooltip text="Explains the metric" />);
		const button = screen.getByRole("button", { name: "Show explanation" });

		fireEvent.focus(button);
		expect(screen.getByRole("tooltip")).toHaveTextContent(
			"Explains the metric",
		);

		fireEvent.blur(button);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("dismisses pinned tooltip on Escape, outside click, and scroll", () => {
		render(
			<div>
				<InfoTooltip text="Pinned help text" />
				<button type="button">Outside</button>
			</div>,
		);
		const trigger = screen.getByRole("button", { name: "Show explanation" });

		fireEvent.click(trigger);
		expect(screen.getByRole("tooltip")).toHaveTextContent("Pinned help text");
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		fireEvent.click(trigger);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();
		fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		fireEvent.click(trigger);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();
		fireEvent.scroll(window);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

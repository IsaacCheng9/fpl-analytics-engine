import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
	test("marks the active theme button pressed and emits selections", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<ThemeToggle theme="system" onChange={onChange} />,
		);

		const light = screen.getByRole("button", { name: "Light theme" });
		const system = screen.getByRole("button", { name: "System theme" });
		const dark = screen.getByRole("button", { name: "Dark theme" });

		expect(light).toHaveAttribute("aria-pressed", "false");
		expect(system).toHaveAttribute("aria-pressed", "true");
		expect(dark).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(dark);
		expect(onChange).toHaveBeenCalledWith("dark");

		rerender(<ThemeToggle theme="dark" onChange={onChange} />);
		expect(dark).toHaveAttribute("aria-pressed", "true");
		expect(system).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(light);
		expect(onChange).toHaveBeenCalledWith("light");

		rerender(<ThemeToggle theme="light" onChange={onChange} />);
		expect(light).toHaveAttribute("aria-pressed", "true");
		expect(dark).toHaveAttribute("aria-pressed", "false");
		expect(system).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(system);
		expect(onChange).toHaveBeenCalledWith("system");
	});
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { FplTeamPick } from "../api";
import { SquadInspection } from "./SquadInspection";

const picks: FplTeamPick[] = [
	{
		element: 1,
		web_name: "Saka",
		position: "MID",
		team_name: "Arsenal",
		squad_position: 1,
		multiplier: 2,
		is_captain: true,
		is_vice_captain: false,
		is_starting: true,
	},
	{
		element: 2,
		web_name: "Palmer",
		position: "MID",
		team_name: "Chelsea",
		squad_position: 2,
		multiplier: 1,
		is_captain: false,
		is_vice_captain: true,
		is_starting: true,
	},
	{
		element: 3,
		web_name: "Gusto",
		position: "DEF",
		team_name: "Chelsea",
		squad_position: 12,
		multiplier: 0,
		is_captain: false,
		is_vice_captain: false,
		is_starting: false,
	},
];

describe("SquadInspection", () => {
	test("renders accessible captain, vice-captain, and bench badges and interactive player buttons", () => {
		const onPlayerClick = vi.fn();
		render(
			<SquadInspection
				picks={picks}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={false}
				onPlayerClick={onPlayerClick}
			/>,
		);

		expect(screen.getByText("Captain")).toBeInTheDocument();
		expect(screen.getByText("Vice-captain")).toBeInTheDocument();
		expect(screen.getByText("Bench")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Saka" }));
		expect(onPlayerClick).toHaveBeenCalledWith(1);

		const palmerRow = screen
			.getByRole("button", { name: "Palmer" })
			.closest("tr");
		fireEvent.keyDown(palmerRow as HTMLElement, { key: "Enter" });
		expect(onPlayerClick).toHaveBeenCalledWith(2);
	});

	test("renders a Retry button when squad loading fails", () => {
		const onRetry = vi.fn();
		render(
			<SquadInspection
				picks={[]}
				formPlayers={[]}
				currentPlayers={[]}
				defconPlayers={[]}
				window={5}
				asOfGw={10}
				latestGw={10}
				loading={false}
				error={true}
				onRetry={onRetry}
				onPlayerClick={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});

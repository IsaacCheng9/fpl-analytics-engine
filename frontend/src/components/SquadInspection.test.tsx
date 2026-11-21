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
	test("renders captain, vice-captain, and bench badges and opens player on Enter", () => {
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

		expect(screen.getByText("C")).toBeInTheDocument();
		expect(screen.getByText("VC")).toBeInTheDocument();
		expect(screen.getByText("Bench")).toBeInTheDocument();

		const sakaRow = screen.getByText("Saka").closest("tr");
		expect(sakaRow).toHaveAttribute("tabindex", "0");
		fireEvent.keyDown(sakaRow as HTMLElement, { key: "Enter" });
		expect(onPlayerClick).toHaveBeenCalledWith(1);
	});
});

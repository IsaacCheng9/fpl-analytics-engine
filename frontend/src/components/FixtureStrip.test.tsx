import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { UpcomingFixture } from "../api";
import { FixtureStrip } from "./FixtureStrip";

const sampleFixtures: UpcomingFixture[] = [
	{
		gw: 11,
		opponent_name: "Bournemouth",
		opponent_short_name: "BOU",
		was_home: true,
		fdr: 2,
	},
	{
		gw: 12,
		opponent_name: "Chelsea",
		opponent_short_name: "CHE",
		was_home: false,
		fdr: 3,
	},
	// GW13 is blank.
	{
		gw: 14,
		opponent_name: "Man City",
		opponent_short_name: "MCI",
		was_home: false,
		fdr: 5,
	},
	{
		gw: 14,
		opponent_name: "Southampton",
		opponent_short_name: "SOU",
		was_home: true,
		fdr: 1,
	},
	{
		gw: 15,
		opponent_name: "Liverpool",
		opponent_short_name: "LIV",
		was_home: true,
		fdr: 4,
	},
];

describe("FixtureStrip", () => {
	test("renders single, blank, and double gameweeks with FDR colours and tooltips", () => {
		render(<FixtureStrip fixtures={sampleFixtures} startGw={11} />);

		expect(screen.getAllByRole("listitem")).toHaveLength(5);

		const easy = screen.getByText("BOU (H)");
		expect(easy).toHaveAttribute("title", "GW11: Bournemouth (H) - FDR 2");
		expect(easy.className).toContain("bg-emerald-50");

		const medium = screen.getByText("CHE (A)");
		expect(medium).toHaveAttribute("title", "GW12: Chelsea (A) - FDR 3");
		expect(medium.className).toContain("bg-amber-50");

		const blank = screen.getByText("BGW");
		expect(blank).toHaveAttribute("title", "GW13: Blank gameweek");

		const dgwLegOne = screen.getByText("MCI (A)");
		const dgwLegTwo = screen.getByText("SOU (H)");
		expect(dgwLegOne.className).toContain("bg-rose-100");
		expect(dgwLegTwo.className).toContain("bg-emerald-100");
		expect(dgwLegOne.parentElement).toHaveAttribute(
			"title",
			"GW14 (DGW): Man City (A) - FDR 5 / Southampton (H) - FDR 1",
		);

		const hard = screen.getByText("LIV (H)");
		expect(hard).toHaveAttribute("title", "GW15: Liverpool (H) - FDR 4");
		expect(hard.className).toContain("bg-red-50");
	});

	test("infers startGw from the earliest fixture when omitted", () => {
		render(
			<FixtureStrip
				fixtures={[
					{
						gw: 20,
						opponent_name: "Everton",
						opponent_short_name: "EVE",
						was_home: true,
						fdr: 2,
					},
				]}
			/>,
		);

		expect(
			screen.getByRole("list", { name: "Upcoming fixtures GW20 to GW24" }),
		).toBeInTheDocument();
		expect(screen.getByText("EVE (H)")).toHaveAttribute(
			"title",
			"GW20: Everton (H) - FDR 2",
		);
		expect(screen.getAllByText("BGW")).toHaveLength(4);
	});

	test("renders a dash when no upcoming fixtures exist", () => {
		render(<FixtureStrip fixtures={[]} startGw={39} />);

		expect(screen.getByText("-")).toBeInTheDocument();
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});

	test("clamps end-of-season slots at GW38 without fabricating GW39+ BGW pills", () => {
		render(
			<FixtureStrip
				startGw={37}
				fixtures={[
					{
						gw: 37,
						opponent_name: "Chelsea",
						opponent_short_name: "CHE",
						was_home: true,
						fdr: 3,
					},
					{
						gw: 38,
						opponent_name: "Everton",
						opponent_short_name: "EVE",
						was_home: false,
						fdr: 2,
					},
				]}
			/>,
		);

		expect(
			screen.getByRole("list", { name: "Upcoming fixtures GW37 to GW38" }),
		).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
		expect(screen.queryByText("BGW")).not.toBeInTheDocument();
	});

	test("renders a dash when fixtures fall entirely outside the requested window", () => {
		render(
			<FixtureStrip
				startGw={6}
				fixtures={[
					{
						gw: 11,
						opponent_name: "Chelsea",
						opponent_short_name: "CHE",
						was_home: true,
						fdr: 3,
					},
				]}
			/>,
		);

		expect(screen.getByText("-")).toBeInTheDocument();
		expect(screen.queryByText("BGW")).not.toBeInTheDocument();
	});
});

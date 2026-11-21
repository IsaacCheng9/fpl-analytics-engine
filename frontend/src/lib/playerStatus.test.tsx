import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PlayerStatusBadges } from "../components/PlayerStatusBadges";
import {
	availabilityBadge,
	cardRiskBadge,
	formatAvailabilitySummary,
	formatSetPiecesSummary,
	isCardRisk,
	isUnavailableStatus,
	setPieceDuties,
} from "./playerStatus";

describe("playerStatus helpers", () => {
	test("identifies unavailable statuses and card-risk thresholds", () => {
		expect(isUnavailableStatus("i")).toBe(true);
		expect(isUnavailableStatus("s")).toBe(true);
		expect(isUnavailableStatus("u")).toBe(true);
		expect(isUnavailableStatus("n")).toBe(true);
		expect(isUnavailableStatus("d")).toBe(false);
		expect(isUnavailableStatus("a")).toBe(false);
		expect(isUnavailableStatus("x")).toBe(false);
		expect(isUnavailableStatus(null)).toBe(false);

		expect(isCardRisk(4)).toBe(true);
		expect(isCardRisk(9)).toBe(true);
		expect(isCardRisk(3)).toBe(false);
		expect(isCardRisk(5)).toBe(false);
		expect(isCardRisk(10)).toBe(false);
		expect(isCardRisk(null)).toBe(false);
	});

	test("builds availability badges with chance and news tooltips", () => {
		expect(
			availabilityBadge({
				status: "i",
				chance_of_playing_next_round: 0,
				news: "Hamstring injury",
			}),
		).toEqual({
			label: "Inj",
			tone: "risk",
			tooltip: "Injured - 0% chance: Hamstring injury",
		});
		expect(
			availabilityBadge({
				status: "n",
				chance_of_playing_next_round: 0,
				news: "Not registered in squad",
			}),
		).toEqual({
			label: "Out",
			tone: "risk",
			tooltip: "Unavailable - 0% chance: Not registered in squad",
		});
		expect(
			availabilityBadge({
				status: "d",
				chance_of_playing_next_round: 75,
				news: "Knock",
			}),
		).toEqual({
			label: "75%",
			tone: "watch",
			tooltip: "Doubtful - 75% chance: Knock",
		});
		expect(
			availabilityBadge({
				status: "d",
				chance_of_playing_next_round: null,
				news: null,
			}),
		).toEqual({
			label: "Doubt",
			tone: "watch",
			tooltip: "Doubtful",
		});
		expect(availabilityBadge({ status: "a" })).toBeNull();
		expect(availabilityBadge({ status: "x" })).toBeNull();
	});

	test("formats card risk, set-piece duties, and compare summaries", () => {
		expect(cardRiskBadge(4)).toEqual({
			label: "4 YC",
			tone: "watch",
			tooltip: "4 yellow cards - suspension watch",
		});
		expect(cardRiskBadge(2)).toBeNull();

		expect(
			setPieceDuties({
				penalties_order: 1,
				corners_order: 2,
				direct_freekicks_order: 1,
			}).map((duty) => duty.code),
		).toEqual(["P", "FK"]);

		expect(
			formatAvailabilitySummary({
				status: "a",
				yellow_cards: 9,
			}),
		).toBe("Available (9 YC - suspension watch)");
		expect(
			formatAvailabilitySummary({
				status: "d",
				chance_of_playing_next_round: 50,
				news: "Groin injury",
			}),
		).toBe("Doubtful (50%) - Groin injury");
		expect(formatAvailabilitySummary({})).toBe("-");

		expect(
			formatSetPiecesSummary({
				status: "a",
				penalties_order: 1,
				corners_order: 1,
				direct_freekicks_order: 1,
			}),
		).toBe("Penalties, Corners, Free Kicks");
		expect(formatSetPiecesSummary({ status: "a" })).toBe("None");
		expect(formatSetPiecesSummary({})).toBe("-");
	});
});

describe("PlayerStatusBadges", () => {
	test("renders compact badges in table mode and full set-piece pills in full mode", () => {
		const player = {
			status: "i",
			chance_of_playing_next_round: 0,
			news: "Knee injury",
			yellow_cards: 4,
			penalties_order: 1,
			corners_order: 1,
			direct_freekicks_order: 1,
		};

		const { rerender } = render(
			<PlayerStatusBadges player={player} mode="compact" />,
		);
		expect(screen.getByText("Inj")).toHaveAttribute("aria-hidden", "true");
		expect(
			screen.getByTitle("Injured - 0% chance: Knee injury"),
		).toHaveTextContent("InjInjured - 0% chance: Knee injury");
		expect(screen.getByText("4 YC")).toHaveAttribute("aria-hidden", "true");
		expect(
			screen.getByTitle("4 yellow cards - suspension watch"),
		).toHaveTextContent("4 YC4 yellow cards - suspension watch");
		expect(screen.getByText("P")).toHaveAttribute("aria-hidden", "true");
		expect(screen.getByTitle("Primary penalty taker")).toHaveTextContent(
			"PPrimary penalty taker",
		);
		expect(screen.queryByText("C")).not.toBeInTheDocument();
		expect(screen.queryByText("FK")).not.toBeInTheDocument();

		rerender(<PlayerStatusBadges player={player} mode="full" />);
		expect(screen.getByText("P")).toBeInTheDocument();
		expect(screen.getByText("C")).toHaveAttribute("aria-hidden", "true");
		expect(
			screen.getByTitle("Primary corner and indirect free-kick taker"),
		).toHaveTextContent("CPrimary corner and indirect free-kick taker");
		expect(screen.getByText("FK")).toHaveAttribute("aria-hidden", "true");
		expect(
			screen.getByTitle("Primary direct free-kick taker"),
		).toHaveTextContent("FKPrimary direct free-kick taker");
	});
});

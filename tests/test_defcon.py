"""Tests for the empirical-Bayes DefCon hit-probability model."""

import polars as pl
import pytest

from fpl_analytics_engine import defcon


def _game(
    element: int,
    round_: int,
    *,
    hit: bool,
    position: str = "DEF",
    minutes: int = 90,
) -> dict:
    """Build one eligible per-gameweek history row for tests."""
    return {
        "element": element,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": minutes,
        "defcon_hit": hit,
        "position": position,
        "web_name": f"P{element}",
        "team_name": "T",
    }


def _frame(rows: list[dict]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def test_probability_shrinks_more_for_smaller_samples() -> None:
    rows: list[dict] = []
    # Anchor a sub-1.0 position base rate.
    rows += [_game(1, r, hit=r <= 4) for r in range(1, 11)]
    rows += [_game(2, r, hit=r <= 4) for r in range(1, 11)]
    # Two perfect records of different sample sizes.
    rows += [_game(3, r, hit=True) for r in (1, 2)]
    rows += [_game(4, r, hit=True) for r in range(1, 21)]

    table = defcon.defcon_probabilities(_frame(rows), as_of_gw=20)
    by_element = {row["element"]: row for row in table.to_dicts()}

    assert by_element[3]["raw_rate"] == 1.0
    assert by_element[4]["raw_rate"] == 1.0
    # Both shrink below 1.0, but the larger sample shrinks less.
    assert by_element[3]["prob"] < 1.0
    assert by_element[4]["prob"] > by_element[3]["prob"]


def test_probabilities_are_point_in_time() -> None:
    # Misses early (GW1-3), hits later (GW4-6).
    history = _frame([_game(1, r, hit=r >= 4) for r in range(1, 7)])

    at_gw3 = defcon.defcon_probabilities(history, as_of_gw=3).to_dicts()[0]
    at_gw6 = defcon.defcon_probabilities(history, as_of_gw=6).to_dicts()[0]

    assert at_gw3["raw_rate"] == 0.0
    assert at_gw6["raw_rate"] == 0.5
    # The later hits are invisible at GW3.
    assert at_gw3["prob"] < at_gw6["prob"]


def test_brier_score_and_calibration() -> None:
    scored = pl.DataFrame({"prob": [0.0, 1.0, 0.5, 0.5], "hit": [0.0, 1.0, 1.0, 0.0]})
    # (0 + 0 + 0.25 + 0.25) / 4 = 0.125
    assert defcon.brier_score(scored) == pytest.approx(0.125)

    table = defcon.calibration_table(scored, bins=10)
    assert table["n"].sum() == 4
    assert {"mean_predicted", "observed_rate"} <= set(table.columns)


def test_backtest_scores_against_next_gameweek() -> None:
    history = _frame(
        [_game(e, r, hit=(e + r) % 2 == 0) for e in (1, 2) for r in range(1, 5)]
    )

    scored = defcon.backtest_defcon_probabilities(history)

    assert {"prob", "raw_rate", "hit", "as_of_gw"} <= set(scored.columns)
    # Last round (4) has no following gameweek to score against.
    assert all(gw <= 3 for gw in scored["as_of_gw"].to_list())
    assert set(scored["hit"].unique()).issubset({0.0, 1.0})

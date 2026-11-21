"""Tests for the empirical-Bayes DefCon hit-probability model."""

import polars as pl
import pytest
from polars.testing import assert_frame_equal

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
    assert defcon.expected_calibration_error(table) == pytest.approx(0.0)


def test_backtest_scores_against_next_gameweek() -> None:
    history = _frame(
        [_game(e, r, hit=(e + r) % 2 == 0) for e in (1, 2) for r in range(1, 5)]
    )

    scored = defcon.backtest_defcon_probabilities(history)

    assert {"prob", "raw_rate", "hit", "as_of_gw"} <= set(scored.columns)
    # Last round (4) has no following gameweek to score against.
    assert all(gw <= 3 for gw in scored["as_of_gw"].to_list())
    assert set(scored["hit"].unique()).issubset({0.0, 1.0})


def test_flag_defcon_probabilities_filters_and_ranks() -> None:
    probs = pl.DataFrame(
        {
            "element": [1, 2, 3],
            "position": ["DEF", "MID", "DEF"],
            "games": [10, 2, 8],
            "prob": [0.3, 0.6, 0.5],
        }
    )
    # min_games drops the 2-game player; the rest rank by prob descending.
    ranked = defcon.flag_defcon_probabilities(probs, min_games=5)
    assert ranked["element"].to_list() == [3, 1]

    defenders = defcon.flag_defcon_probabilities(probs, position="DEF")
    assert set(defenders["position"].to_list()) == {"DEF"}

    top = defcon.flag_defcon_probabilities(probs, top_k=1)
    assert top.height == 1
    assert top["element"][0] == 2


def test_flag_defcon_probabilities_breaks_ties_by_games_then_element() -> None:
    probs = pl.DataFrame(
        {
            "element": [3, 1, 2],
            "position": ["DEF"] * 3,
            "games": [2, 4, 4],
            "prob": [0.4, 0.4, 0.4],
        }
    )

    ranked = defcon.flag_defcon_probabilities(probs)

    assert ranked["element"].to_list() == [1, 2, 3]


def _count_game(
    element: int,
    round_: int,
    *,
    count: int,
    threshold: int = 10,
    position: str = "DEF",
) -> dict:
    """Build one row carrying the DefCon contribution count for tests."""
    return {
        "element": element,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": 90,
        "defensive_contribution": count,
        "defcon_threshold": threshold,
        "defcon_hit": count >= threshold,
        "position": position,
        "web_name": f"P{element}",
        "team_name": "T",
    }


def test_count_model_rewards_higher_contribution_counts() -> None:
    rows: list[dict] = []
    # P1 clears the threshold comfortably; P2 scrapes it - same 5/6 hit rate.
    rows += [_count_game(1, r, count=20) for r in range(1, 6)] + [
        _count_game(1, 6, count=5)
    ]
    rows += [_count_game(2, r, count=10) for r in range(1, 6)] + [
        _count_game(2, 6, count=5)
    ]
    frame = pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})

    table = defcon.defcon_count_probabilities(frame, as_of_gw=6)
    by_element = {row["element"]: row for row in table.to_dicts()}

    # Identical binary hit rate...
    assert by_element[1]["raw_rate"] == by_element[2]["raw_rate"]
    # ...but the higher-margin player is judged more likely to hit.
    assert by_element[1]["prob"] > by_element[2]["prob"]


def test_count_calibration_shrinks_overconfident_bucket() -> None:
    predictions = pl.DataFrame(
        {
            "element": [1],
            "count_prob": [0.8],
        }
    )
    calibration_rows = pl.DataFrame(
        {
            "count_prob": [0.81, 0.82, 0.83, 0.84],
            "hit": [0.0, 0.0, 0.0, 0.0],
        }
    )

    calibrated = defcon._apply_count_calibration(
        predictions, calibration_rows, bins=10, prior_strength=1
    )

    assert calibrated["prob"][0] < predictions["count_prob"][0]


def test_backtest_count_probabilities_returns_calibrated_model() -> None:
    rows: list[dict] = []
    rows += [_count_game(1, r, count=20) for r in range(1, 5)]
    rows += [_count_game(2, r, count=8) for r in range(1, 5)]
    frame = pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})

    scored = defcon.backtest_defcon_count_probabilities(frame)

    assert {"prob", "count_prob", "binary_prob", "hit"} <= set(scored.columns)
    assert all(0 <= prob <= 1 for prob in scored["prob"].to_list())
    # Last round has no following gameweek to score against.
    assert all(gw <= 3 for gw in scored["as_of_gw"].to_list())


def test_calibrated_count_probabilities_keep_diagnostic_probabilities() -> None:
    rows: list[dict] = []
    rows += [_count_game(1, r, count=20) for r in range(1, 6)]
    rows += [_count_game(2, r, count=8) for r in range(1, 6)]
    frame = pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})

    table = defcon.calibrated_defcon_count_probabilities(frame, as_of_gw=5)

    assert {"prob", "count_prob", "binary_prob", "raw_rate"} <= set(table.columns)
    assert all(0 <= prob <= 1 for prob in table["prob"].to_list())


@pytest.mark.parametrize(
    "gw_range",
    [range(1, 7), range(4, 5), range(3, 6, 2), range(5, 2, -2), range(0), range(9, 12)],
)
def test_count_backtest_range_only_selects_scored_appearances(gw_range: range) -> None:
    history = _frame(
        [_count_game(1, gw, count=8 + gw % 3 * 4) for gw in range(1, 8)]
        + [_count_game(1, 3, count=8), _count_game(1, 6, count=12)]
    )
    full = defcon.backtest_defcon_count_probabilities(
        history, calibration_bins=1, calibration_prior_strength=2
    )
    selected = defcon.backtest_defcon_count_probabilities(
        history, gw_range, calibration_bins=1, calibration_prior_strength=2
    )
    expected = full.filter(pl.col("as_of_gw").is_in(gw_range))

    if expected.is_empty():
        assert selected.is_empty()
    else:
        assert_frame_equal(
            selected.sort("as_of_gw", "element", "hit"),
            expected.sort("as_of_gw", "element", "hit"),
        )


def test_count_backtest_bounded_range_ignores_future_counts_and_hits() -> None:
    history = _frame([_count_game(1, gw, count=8 + gw % 3 * 4) for gw in range(1, 9)])
    changed = history.with_columns(
        pl.when(pl.col("round") > 4)
        .then(0)
        .otherwise(pl.col("defensive_contribution"))
        .alias("defensive_contribution"),
        pl.when(pl.col("round") > 4)
        .then(~pl.col("defcon_hit"))
        .otherwise(pl.col("defcon_hit"))
        .alias("defcon_hit"),
    )
    original = defcon.backtest_defcon_count_probabilities(history, range(3, 5))
    poisoned = defcon.backtest_defcon_count_probabilities(changed, range(3, 5))
    truncated = defcon.backtest_defcon_count_probabilities(
        history.filter(pl.col("round") <= 5), range(3, 5)
    )

    assert_frame_equal(original, truncated)
    assert_frame_equal(original.drop("hit"), poisoned.drop("hit"))
    assert original["hit"].to_list() != poisoned["hit"].to_list()


@pytest.mark.parametrize("gw_range", [range(3, 6, 2), range(0), range(12, 15)])
def test_count_backtest_only_builds_history_through_selected_weeks(
    monkeypatch: pytest.MonkeyPatch, gw_range: range
) -> None:
    history = _frame([_count_game(1, gw, count=8) for gw in range(1, 9)])
    model = defcon._count_and_binary_probabilities
    calls = []

    def record_predictions(history, as_of_gw, *args):
        calls.append(as_of_gw)
        return model(history, as_of_gw, *args)

    monkeypatch.setattr(defcon, "_count_and_binary_probabilities", record_predictions)

    defcon.backtest_defcon_count_probabilities(history, gw_range)

    expected = list(range(1, 6)) if gw_range == range(3, 6, 2) else []
    assert calls == expected


@pytest.mark.parametrize("count_model", [False, True], ids=["binary", "count"])
@pytest.mark.parametrize("counts", [(12, 8), (12, 12), (8, 8)])
def test_backtest_scores_each_eligible_double_gameweek_appearance(
    count_model: bool, counts: tuple[int, int]
) -> None:
    history = _frame(
        [
            _count_game(1, 1, count=12),
            _count_game(2, 1, count=8),
            _count_game(4, 1, count=8),
            _count_game(1, 2, count=counts[0]),
            _count_game(1, 2, count=counts[1]),
            {**_count_game(1, 2, count=12), "minutes": 59},
            {**_count_game(1, 2, count=12), "defcon_hit": None},
            {**_count_game(2, 2, count=8), "minutes": 60},
            _count_game(3, 2, count=12),
        ]
    )
    backtest = (
        defcon.backtest_defcon_count_probabilities
        if count_model
        else defcon.backtest_defcon_probabilities
    )

    scored = backtest(history, min_minutes=60)
    double = scored.filter(pl.col("element") == 1)

    assert scored.height == 3
    assert sorted(scored["element"].to_list()) == [1, 1, 2]
    assert sorted(double["hit"].to_list()) == sorted(
        float(count >= 10) for count in counts
    )
    assert double["prob"].n_unique() == 1
    assert double["games"].to_list() == [1, 1]
    assert double["as_of_gw"].to_list() == [1, 1]
    assert double["next_round"].to_list() == [2, 2]
    probability = double["prob"][0]
    expected_brier = sum((probability - (count >= 10)) ** 2 for count in counts) / 2
    assert defcon.brier_score(double) == pytest.approx(expected_brier)
    calibration = defcon.calibration_table(double)
    assert calibration["n"].to_list() == [2]
    assert calibration["observed_rate"][0] == sum(count >= 10 for count in counts) / 2


@pytest.mark.parametrize("count_model", [False, True], ids=["binary", "count"])
def test_backtest_single_gameweeks_match_point_in_time_predictions(
    count_model: bool,
) -> None:
    history = _frame(
        [
            _count_game(e, r, count=8 + 4 * ((e + r) % 2))
            for e in (1, 2)
            for r in (1, 2, 3)
        ]
    )
    backtest = (
        defcon.backtest_defcon_count_probabilities
        if count_model
        else defcon.backtest_defcon_probabilities
    )
    model = (
        defcon.defcon_count_probabilities
        if count_model
        else defcon.defcon_probabilities
    )
    scored = backtest(history)

    assert scored.height == 4
    for as_of_gw in (1, 2):
        expected = model(history.filter(pl.col("round") <= as_of_gw), as_of_gw)
        actual = scored.filter(pl.col("as_of_gw") == as_of_gw).sort("element")
        probability_column = "count_prob" if count_model else "prob"
        assert actual[probability_column].to_list() == pytest.approx(
            expected.sort("element")["prob"].to_list()
        )
        assert actual["hit"].to_list() == [
            float((e + as_of_gw + 1) % 2) for e in (1, 2)
        ]
        if count_model:
            prior = scored.filter(pl.col("as_of_gw") < as_of_gw)
            for row in actual.iter_rows(named=True):
                bucket = min(int(row["count_prob"] * 10), 9)
                observations = [
                    prior_row["hit"]
                    for prior_row in prior.iter_rows(named=True)
                    if min(int(prior_row["count_prob"] * 10), 9) == bucket
                ]
                assert row["prob"] == pytest.approx(
                    (sum(observations) + 50 * row["count_prob"])
                    / (len(observations) + 50)
                )


def test_double_gameweek_calibration_is_per_appearance_and_point_in_time() -> None:
    history = _frame(
        [
            _count_game(1, 1, count=8),
            _count_game(1, 2, count=12),
            _count_game(1, 2, count=8),
            _count_game(1, 3, count=12),
            _count_game(1, 4, count=8),
        ]
    )
    scored = defcon.backtest_defcon_count_probabilities(
        history, calibration_bins=1, calibration_prior_strength=2
    )
    first = scored.filter(pl.col("as_of_gw") == 1)
    assert first["prob"].to_list() == first["count_prob"].to_list()
    second = scored.filter(pl.col("as_of_gw") == 2)
    assert second.height == 1
    # Use both GW2 appearances: one hit and one miss, plus two pseudo-counts.
    expected = (1 + 2 * second["count_prob"][0]) / 4
    assert second["prob"][0] == pytest.approx(expected)

    current = defcon.calibrated_defcon_count_probabilities(
        history, as_of_gw=2, calibration_bins=1, calibration_prior_strength=2
    )
    assert current["prob"][0] == pytest.approx(expected)

    changed_future = history.with_columns(
        pl.when(pl.col("round") > 2)
        .then(~pl.col("defcon_hit"))
        .otherwise(pl.col("defcon_hit"))
        .alias("defcon_hit"),
        pl.when(pl.col("round") > 2)
        .then(20 - pl.col("defensive_contribution"))
        .otherwise(pl.col("defensive_contribution"))
        .alias("defensive_contribution"),
    )
    changed_scored = defcon.backtest_defcon_count_probabilities(
        changed_future, calibration_bins=1, calibration_prior_strength=2
    )
    assert_frame_equal(
        scored.filter(pl.col("as_of_gw") <= 2).drop("hit").sort("as_of_gw"),
        changed_scored.filter(pl.col("as_of_gw") <= 2).drop("hit").sort("as_of_gw"),
    )
    changed_current = defcon.calibrated_defcon_count_probabilities(
        changed_future, as_of_gw=2, calibration_bins=1, calibration_prior_strength=2
    )
    assert_frame_equal(current, changed_current)


def test_defcon_probabilities_use_latest_club_for_mid_season_transfers() -> None:
    # Unsorted rows where the transferred player has not yet played 60+ mins
    # for the new club, plus a future transfer after as_of_gw that must not leak.
    rows = [
        {**_count_game(1, 3, count=0), "minutes": 15, "team_name": "Brighton"},
        {**_count_game(1, 1, count=12), "team_name": "West Ham"},
        {**_count_game(1, 2, count=11), "team_name": "West Ham"},
        {**_count_game(1, 4, count=10), "team_name": "Fulham"},
    ]
    history = _frame(rows)

    binary = defcon.defcon_probabilities(history, as_of_gw=3, min_minutes=60)
    count = defcon.defcon_count_probabilities(history, as_of_gw=3, min_minutes=60)
    calibrated = defcon.calibrated_defcon_count_probabilities(
        history, as_of_gw=3, min_minutes=60
    )

    assert binary["team_name"].to_list() == ["Brighton"]
    assert count["team_name"].to_list() == ["Brighton"]
    assert calibrated["team_name"].to_list() == ["Brighton"]


def test_defcon_models_return_empty_frames_when_no_appearances_qualify() -> None:
    history = _frame([_count_game(1, 1, count=12), _count_game(1, 2, count=8)])

    binary = defcon.defcon_probabilities(history, as_of_gw=2, min_minutes=200)
    count = defcon.defcon_count_probabilities(history, as_of_gw=2, min_minutes=200)
    calibrated = defcon.calibrated_defcon_count_probabilities(
        history, as_of_gw=2, min_minutes=200
    )
    backtest = defcon.backtest_defcon_count_probabilities(history, min_minutes=200)

    assert binary.is_empty()
    assert "prob" in binary.columns
    assert count.is_empty()
    assert "prob" in count.columns
    assert calibrated.is_empty()
    assert {"element", "games", "prob", "team_name"} <= set(calibrated.columns)
    assert backtest.is_empty()

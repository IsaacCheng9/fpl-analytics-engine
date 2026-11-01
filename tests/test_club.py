"""Tests for club-level form aggregation and validation."""

import polars as pl
import pytest
from polars.testing import assert_frame_equal

from fpl_analytics_engine import club


def _player_row(
    *,
    team: int,
    team_name: str,
    fixture: int,
    round_: int,
    player: int,
    xg: float,
    was_home: bool,
    minutes: int = 90,
    home_score: int = 2,
    away_score: int = 1,
) -> dict:
    return {
        "element": fixture * 100 + team * 10 + player,
        "fixture": fixture,
        "team": team,
        "team_name": team_name,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "was_home": was_home,
        "team_h_score": home_score,
        "team_a_score": away_score,
        "minutes": minutes,
        "expected_goals": xg,
        # Deliberately unrelated to opponent xG; club xGC must not use it.
        "expected_goals_conceded": 99.0,
    }


def _fixture_rows(round_: int, home_xg: float, away_xg: float) -> list[dict]:
    rows = []
    for team, name, xg, was_home in [
        (1, "Arsenal", home_xg, True),
        (2, "Chelsea", away_xg, False),
    ]:
        rows.extend(
            _player_row(
                team=team,
                team_name=name,
                fixture=round_,
                round_=round_,
                player=player,
                xg=xg / 2,
                was_home=was_home,
            )
            for player in [1, 2]
        )
    return rows


def test_compute_club_gameweeks_uses_opposing_summed_xg_for_xgc() -> None:
    rows = _fixture_rows(1, home_xg=1.0, away_xg=0.8)
    rows.append(
        _player_row(
            team=1,
            team_name="Arsenal",
            fixture=1,
            round_=1,
            player=3,
            xg=0.0,
            was_home=True,
            minutes=0,
        )
    )

    gameweeks = club.compute_club_gameweeks(pl.DataFrame(rows))
    arsenal = gameweeks.filter(pl.col("team") == 1).row(0, named=True)
    chelsea = gameweeks.filter(pl.col("team") == 2).row(0, named=True)

    assert gameweeks.height == 2
    assert arsenal["matches"] == 1
    assert arsenal["goals_for"] == 2
    assert arsenal["goals_against"] == 1
    assert arsenal["xg"] == pytest.approx(1.0)
    assert arsenal["xgc"] == pytest.approx(0.8)
    assert chelsea["xg"] == pytest.approx(0.8)
    assert chelsea["xgc"] == pytest.approx(1.0)


def test_compute_club_fixtures_requires_exactly_two_clubs() -> None:
    one_sided = pl.DataFrame(
        [
            _player_row(
                team=1,
                team_name="Arsenal",
                fixture=1,
                round_=1,
                player=1,
                xg=0.5,
                was_home=True,
            )
        ]
    )

    with pytest.raises(ValueError, match="Expected exactly two clubs per fixture"):
        club.compute_club_gameweeks(one_sided)


def test_compute_club_fixtures_has_unique_team_fixture_rows() -> None:
    history = pl.DataFrame(_fixture_rows(1, 1.0, 0.8) + _fixture_rows(2, 1.2, 0.7))

    fixtures = club._compute_club_fixtures(history)

    assert fixtures.height == 4
    assert fixtures.select("fixture", "team").unique().height == fixtures.height
    assert fixtures.group_by("fixture").len()["len"].to_list() == [2, 2]


def test_compute_club_form_table_compares_window_to_baseline() -> None:
    rows = []
    for round_, arsenal_xg, chelsea_xg in [
        (1, 0.5, 1.5),
        (2, 1.0, 1.0),
        (3, 2.5, 0.5),
    ]:
        rows.extend(_fixture_rows(round_, arsenal_xg, chelsea_xg))

    out = (
        club.compute_club_form_table(pl.DataFrame(rows), as_of_gw=3, window=2)
        .filter(pl.col("team") == 1)
        .row(0, named=True)
    )

    assert out["window_matches"] == 2
    assert out["season_matches"] == 3
    assert out["window_xg_per_match"] == pytest.approx(1.75)
    assert out["season_xg_per_match"] == pytest.approx(4.0 / 3)
    assert out["delta_xg_per_match"] == pytest.approx(1.75 - 4.0 / 3)
    assert out["window_xgc_per_match"] == pytest.approx(0.75)
    assert out["season_xgc_per_match"] == pytest.approx(1.0)
    assert out["defence_form"] == pytest.approx(0.25)
    assert out["window_xgd_per_match"] == pytest.approx(1.75 - 0.75)
    assert out["season_xgd_per_match"] == pytest.approx(4.0 / 3 - 1.0)
    assert out["window_finishing_delta_total"] == pytest.approx(0.5)
    assert out["season_finishing_delta_total"] == pytest.approx(2.0)
    assert out["window_finishing_delta"] == pytest.approx(0.25)
    assert out["season_finishing_delta"] == pytest.approx(2 / 3)
    assert out["window_concession_delta_total"] == pytest.approx(0.5)
    assert out["season_concession_delta_total"] == pytest.approx(0.0)
    assert out["window_concession_delta"] == pytest.approx(0.25)
    assert out["season_concession_delta"] == pytest.approx(0.0)
    assert out["window_goal_difference_delta_total"] == pytest.approx(0.0)
    assert out["season_goal_difference_delta_total"] == pytest.approx(2.0)
    assert out["window_goal_difference_delta"] == pytest.approx(0.0)
    assert out["season_goal_difference_delta"] == pytest.approx(2 / 3)


def test_club_form_table_breaks_attack_form_ties_by_club_name() -> None:
    rows = _fixture_rows(1, 1.0, 1.0)

    # A window covering the whole season gives every club zero attack form.
    out = club.compute_club_form_table(pl.DataFrame(rows), as_of_gw=1, window=2)

    assert out["attack_form"].to_list() == [0.0, 0.0]
    assert out["team_name"].to_list() == ["Arsenal", "Chelsea"]


@pytest.mark.parametrize("rounds", [(26, 27, 28, 29, 30, 30), (26, 28, 29)])
def test_club_window_uses_gameweeks_including_doubles_and_blanks(rounds) -> None:
    rows = _fixture_rows(25, 10.0, 10.0) + _fixture_rows(31, 100.0, 100.0)
    for fixture, gw in enumerate(rounds, 100):
        rows += [
            {**row, "fixture": fixture}
            for row in _fixture_rows(gw, home_xg=2.0, away_xg=0.5)
        ]

    row = (
        club.compute_club_form_table(pl.DataFrame(rows), as_of_gw=30, window=5)
        .filter(pl.col("team") == 1)
        .row(0, named=True)
    )

    assert row["window_matches"] == len(rounds)
    assert row["season_matches"] == len(rounds) + 1
    assert row["window_xg_per_match"] == pytest.approx(2.0)
    assert row["window_xgc_per_match"] == pytest.approx(0.5)
    assert row["season_xg_per_match"] == pytest.approx(
        (10 + 2 * len(rounds)) / (len(rounds) + 1)
    )
    assert row["attack_form"] == pytest.approx(2.0 - row["season_xg_per_match"])
    assert row["defence_form"] == pytest.approx(row["season_xgc_per_match"] - 0.5)
    for period in ("window", "season"):
        for metric in ("finishing", "concession", "goal_difference"):
            assert row[f"{period}_{metric}_delta_total"] == pytest.approx(
                row[f"{period}_{metric}_delta"] * row[f"{period}_matches"]
            )
    assert row["window_finishing_delta_total"] == pytest.approx(0.0)
    assert row["season_finishing_delta_total"] == pytest.approx(-8.0)


def test_club_window_does_not_backfill_an_entirely_blank_window() -> None:
    row = (
        club.compute_club_form_table(
            pl.DataFrame(_fixture_rows(25, 1.0, 0.5)), as_of_gw=30, window=5
        )
        .filter(pl.col("team") == 1)
        .row(0, named=True)
    )

    assert row["window_matches"] == 0
    assert row["window_xg_per_match"] is None
    for metric in ("finishing", "concession", "goal_difference"):
        assert row[f"window_{metric}_delta"] is None
        assert row[f"window_{metric}_delta_total"] == 0.0
    assert row["season_finishing_delta_total"] == 1.0
    assert row["season_concession_delta_total"] == 0.5
    assert row["attack_form"] is None
    assert row["season_xg_per_match"] == 1.0


def _validation_history() -> pl.DataFrame:
    rows = []
    for round_, arsenal_xg, chelsea_xg in [
        (1, 1.0, 1.8),
        (2, 1.5, 1.4),
        (3, 2.0, 1.1),
        (4, 2.4, 0.9),
        (5, 2.8, 0.8),
        (6, 3.0, 0.7),
    ]:
        rows.extend(_fixture_rows(round_, arsenal_xg, chelsea_xg))
    return pl.DataFrame(rows)


def test_club_form_validation_rows_are_point_in_time() -> None:
    rows = club.club_form_validation_rows(
        _validation_history(),
        window=1,
        horizon=1,
        gw_range=range(2, 3),
    )
    arsenal = rows.filter(pl.col("team_name") == "Arsenal").row(0, named=True)

    assert arsenal["as_of_gw"] == 2
    assert arsenal["target_end_gw"] == 3
    assert arsenal["season_xg_per_match"] == pytest.approx(1.25)
    assert arsenal["attack_form"] == pytest.approx(1.5 - 1.25)
    assert arsenal["future_xg_per_match"] == pytest.approx(2.0)
    assert arsenal["future_xgc_per_match"] == pytest.approx(1.1)


def _prediction_at_gw(rows: pl.DataFrame, as_of_gw: int) -> dict[str, object]:
    predictions = club._expanding_predictions(
        rows,
        "future_xg_per_match",
        "season_xg_per_match",
        "attack_form",
        min_train_rows=1,
    )
    return next(row for row in predictions if row["as_of_gw"] == as_of_gw)


def test_expanding_predictions_purge_unfinished_training_horizons() -> None:
    rows = pl.DataFrame(
        [
            {
                "as_of_gw": 2,
                "target_end_gw": 4,
                "team": 1,
                "team_name": "Arsenal",
                "season_xg_per_match": 1.0,
                "season_xgc_per_match": 1.0,
                "attack_form": 0.1,
                "defence_form": 0.1,
                "future_matches": 2,
                "future_xg_per_match": 1.2,
                "future_xgc_per_match": 1.0,
            },
            {
                "as_of_gw": 3,
                "target_end_gw": 5,
                "team": 2,
                "team_name": "Chelsea",
                "season_xg_per_match": 2.0,
                "season_xgc_per_match": 1.0,
                "attack_form": 0.2,
                "defence_form": 0.1,
                "future_matches": 2,
                "future_xg_per_match": 2.2,
                "future_xgc_per_match": 1.0,
            },
            {
                "as_of_gw": 4,
                "target_end_gw": 6,
                "team": 3,
                "team_name": "Liverpool",
                "season_xg_per_match": 1.5,
                "season_xgc_per_match": 1.0,
                "attack_form": 0.15,
                "defence_form": 0.1,
                "future_matches": 2,
                "future_xg_per_match": 1.7,
                "future_xgc_per_match": 1.0,
            },
        ],
        schema=club.VALIDATION_ROW_SCHEMA,
    )
    original = _prediction_at_gw(rows, 4)
    poisoned = rows.with_columns(
        pl.when(pl.col("as_of_gw") == 3)
        .then(10_000.0)
        .otherwise(pl.col("future_xg_per_match"))
        .alias("future_xg_per_match")
    )

    assert _prediction_at_gw(poisoned, 4) == original


def test_backtest_club_form_signals_summarises_baseline_against_form() -> None:
    scored = club.backtest_club_form_signals(
        _validation_history(),
        window=1,
        horizon=1,
        min_train_rows=4,
        gw_range=range(2, 6),
    )
    summary = club.summarise_club_form_validation(scored)

    assert set(summary["target"].to_list()) == {
        "future_xg_per_match",
        "future_xgc_per_match",
    }
    by_target = {row["target"]: row for row in summary.to_dicts()}
    assert by_target["future_xg_per_match"]["n_predictions"] == 6
    assert by_target["future_xg_per_match"]["baseline_mae"] is not None
    assert by_target["future_xg_per_match"]["baseline_plus_form_mae"] is not None


@pytest.mark.parametrize("window", [1, 2])
@pytest.mark.parametrize("horizon", [1, 2])
@pytest.mark.parametrize(
    "gw_range",
    [range(1, 6), range(4, 5), range(3, 6, 2), range(5, 2, -2), range(0), range(9, 12)],
)
def test_club_backtest_range_only_selects_scored_outputs(
    gw_range: range, horizon: int, window: int
) -> None:
    history = pl.concat(
        [
            _validation_history(),
            pl.DataFrame(
                [{**row, "fixture": 40} for row in _fixture_rows(4, 3.2, 0.6)]
            ),
        ]
    )
    full = club.backtest_club_form_signals(
        history, window=window, horizon=horizon, min_train_rows=2
    )
    selected = club.backtest_club_form_signals(
        history, window=window, horizon=horizon, min_train_rows=2, gw_range=gw_range
    )

    assert_frame_equal(
        selected.sort("target", "as_of_gw", "team"),
        full.filter(pl.col("as_of_gw").is_in(gw_range)).sort(
            "target", "as_of_gw", "team"
        ),
    )


def test_club_backtest_bounded_range_ignores_unfinished_future_targets() -> None:
    history = _validation_history()
    changed = history.with_columns(
        pl.when(pl.col("round") > 4)
        .then(1000.0)
        .otherwise(pl.col("expected_goals"))
        .alias("expected_goals")
    )
    original = club.backtest_club_form_signals(
        history, window=1, horizon=2, min_train_rows=2, gw_range=range(3, 5)
    ).sort("target", "as_of_gw", "team")
    poisoned = club.backtest_club_form_signals(
        changed, window=1, horizon=2, min_train_rows=2, gw_range=range(3, 5)
    ).sort("target", "as_of_gw", "team")
    extended = club.backtest_club_form_signals(
        pl.concat([history, pl.DataFrame(_fixture_rows(7, 1000.0, 500.0))]),
        window=1,
        horizon=2,
        min_train_rows=2,
        gw_range=range(3, 5),
    ).sort("target", "as_of_gw", "team")

    assert original.height == 8
    assert_frame_equal(original, extended)
    assert_frame_equal(original.drop("actual"), poisoned.drop("actual"))
    assert original["actual"].to_list() != poisoned["actual"].to_list()


@pytest.mark.parametrize("gw_range", [range(3, 5), range(0), range(9, 12)])
def test_club_backtest_only_builds_history_through_selected_weeks(
    monkeypatch: pytest.MonkeyPatch, gw_range: range
) -> None:
    compute_form = club.compute_club_form_table
    calls = []

    def record_form(history, as_of_gw, window):
        calls.append(as_of_gw)
        return compute_form(history, as_of_gw, window)

    monkeypatch.setattr(club, "compute_club_form_table", record_form)

    club.backtest_club_form_signals(
        _validation_history(), window=1, horizon=1, min_train_rows=2, gw_range=gw_range
    )

    expected = list(range(1, 5)) if gw_range == range(3, 5) else []
    assert calls == expected

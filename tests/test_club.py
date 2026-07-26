"""Tests for club-level form aggregation and validation."""

import polars as pl
import pytest

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
    assert by_target["future_xg_per_match"]["n_predictions"] == 4
    assert by_target["future_xg_per_match"]["baseline_mae"] is not None
    assert by_target["future_xg_per_match"]["baseline_plus_form_mae"] is not None

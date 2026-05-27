"""Tests for club-level form aggregation."""

import polars as pl
import pytest

from fpl_analytics_engine import club


def _player_row(
    *,
    team: int,
    team_name: str,
    fixture: int,
    round_: int,
    player: str,
    xg: float,
    xgc: float,
    minutes: int = 90,
    was_home: bool = True,
    home_score: int = 2,
    away_score: int = 1,
) -> dict:
    return {
        "element": fixture * 100 + len(player),
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
        "expected_goals_conceded": xgc,
    }


def test_compute_club_gameweeks_uses_scores_and_single_team_xgc() -> None:
    history = pl.DataFrame(
        [
            _player_row(
                team=1,
                team_name="Arsenal",
                fixture=1,
                round_=1,
                player="A",
                xg=0.4,
                xgc=0.8,
            ),
            _player_row(
                team=1,
                team_name="Arsenal",
                fixture=1,
                round_=1,
                player="B",
                xg=0.6,
                xgc=0.8,
            ),
            _player_row(
                team=1,
                team_name="Arsenal",
                fixture=1,
                round_=1,
                player="Bench",
                xg=0.0,
                xgc=0.0,
                minutes=0,
            ),
        ]
    )

    out = club.compute_club_gameweeks(history).row(0, named=True)

    assert out["matches"] == 1
    assert out["goals_for"] == 2
    assert out["goals_against"] == 1
    assert out["xg"] == pytest.approx(1.0)
    assert out["xgc"] == pytest.approx(0.8)


def test_compute_club_form_table_compares_window_to_baseline() -> None:
    rows = []
    for round_, xg, xgc in [(1, 0.5, 1.5), (2, 1.0, 1.0), (3, 2.5, 0.5)]:
        rows.extend(
            [
                _player_row(
                    team=1,
                    team_name="Arsenal",
                    fixture=round_,
                    round_=round_,
                    player="A",
                    xg=xg / 2,
                    xgc=xgc,
                    home_score=2,
                    away_score=1,
                ),
                _player_row(
                    team=1,
                    team_name="Arsenal",
                    fixture=round_,
                    round_=round_,
                    player="B",
                    xg=xg / 2,
                    xgc=xgc,
                    home_score=2,
                    away_score=1,
                ),
            ]
        )

    out = club.compute_club_form_table(pl.DataFrame(rows), as_of_gw=3, window=2).row(
        0, named=True
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
    for round_, team_1_xg, team_1_xgc, team_2_xg, team_2_xgc in [
        (1, 1.0, 1.4, 1.8, 0.7),
        (2, 1.5, 1.1, 1.4, 0.9),
        (3, 2.0, 0.9, 1.1, 1.1),
        (4, 2.4, 0.7, 0.9, 1.3),
        (5, 2.8, 0.6, 0.8, 1.6),
        (6, 3.0, 0.5, 0.7, 1.8),
    ]:
        for team, name, xg, xgc in [
            (1, "Arsenal", team_1_xg, team_1_xgc),
            (2, "Chelsea", team_2_xg, team_2_xgc),
        ]:
            fixture = round_ * 10 + team
            rows.extend(
                [
                    _player_row(
                        team=team,
                        team_name=name,
                        fixture=fixture,
                        round_=round_,
                        player="A",
                        xg=xg / 2,
                        xgc=xgc,
                    ),
                    _player_row(
                        team=team,
                        team_name=name,
                        fixture=fixture,
                        round_=round_,
                        player="B",
                        xg=xg / 2,
                        xgc=xgc,
                    ),
                ]
            )
    return pl.DataFrame(rows)


def _validation_fixtures() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "event": [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
            "team_h": [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
            "team_a": [91, 92, 91, 92, 91, 92, 91, 92, 91, 92, 91, 92],
            "team_h_difficulty": [2, 4, 2, 4, 2, 4, 3, 3, 3, 3, 4, 2],
            "team_a_difficulty": [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        }
    )


def test_club_form_validation_rows_are_point_in_time() -> None:
    rows = club.club_form_validation_rows(
        _validation_history(),
        _validation_fixtures(),
        window=1,
        fdr_horizon=1,
        gw_range=range(2, 3),
    )
    arsenal = rows.filter(pl.col("team_name") == "Arsenal").row(0, named=True)

    assert arsenal["as_of_gw"] == 2
    assert arsenal["avg_fdr"] == pytest.approx(2.0)
    assert arsenal["attack_form"] == pytest.approx(1.5 - 1.25)
    assert arsenal["future_xg_per_match"] == pytest.approx(2.0)
    assert arsenal["future_xgc_per_match"] == pytest.approx(0.9)


def test_backtest_club_form_signals_summarises_fdr_against_form() -> None:
    scored = club.backtest_club_form_signals(
        _validation_history(),
        _validation_fixtures(),
        window=1,
        fdr_horizon=1,
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
    assert by_target["future_xg_per_match"]["fdr_mae"] is not None
    assert by_target["future_xg_per_match"]["fdr_plus_form_mae"] is not None

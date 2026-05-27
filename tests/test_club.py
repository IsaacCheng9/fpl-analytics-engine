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

"""Tests for loading and enriching archived season data."""

from pathlib import Path

import polars as pl

from fpl_analytics_engine import data


def test_load_fixtures_returns_empty_frame_when_absent(tmp_path: Path) -> None:
    fixtures = data.load_fixtures(tmp_path)
    assert fixtures.height == 0
    # The empty frame keeps the schema the FDR transform expects.
    assert {"event", "team_h", "team_a"} <= set(fixtures.columns)


def test_load_fixtures_reads_archived_file(tmp_path: Path) -> None:
    written = pl.DataFrame({"event": [1], "team_h": [10], "team_a": [20]})
    written.write_parquet(tmp_path / "fixtures.parquet")
    assert data.load_fixtures(tmp_path).equals(written)


def test_enrich_history_casts_stats_and_labels_positions() -> None:
    history = pl.DataFrame(
        {
            "element": [1, 1, 2, 2, 3],
            "defensive_contribution": [12, 8, 12, 11, 30],
            "expected_goals": ["0.50", "0.00", "0.00", "0.00", "0.00"],
            "expected_assists": ["0.10", "0.00", "0.00", "0.00", "0.00"],
            "expected_goal_involvements": ["0.60", "0.00", "0.00", "0.00", "0.00"],
            "expected_goals_conceded": ["1.20", "0.00", "0.00", "0.00", "0.00"],
        }
    )
    players = pl.DataFrame(
        {
            "id": [1, 2, 3],
            "code": [101, 102, 103],
            "web_name": ["Def", "Mid", "Gk"],
            "element_type": [2, 3, 1],
            "team": [10, 10, 10],
        }
    )
    teams = pl.DataFrame({"id": [10], "name": ["Team"]})

    enriched = data.enrich_history(history, players, teams)

    # Expected-stat strings are parsed into floats.
    assert enriched.schema["expected_goals"] == pl.Float64

    rows = (
        enriched.select("element", "position", "defensive_contribution", "defcon_hit")
        .sort("element", "defensive_contribution")
        .to_dicts()
    )
    # Defenders hit at 10+, mids at 12+, and keepers are ineligible (null).
    assert rows == [
        {
            "element": 1,
            "position": "DEF",
            "defensive_contribution": 8,
            "defcon_hit": False,
        },
        {
            "element": 1,
            "position": "DEF",
            "defensive_contribution": 12,
            "defcon_hit": True,
        },
        {
            "element": 2,
            "position": "MID",
            "defensive_contribution": 11,
            "defcon_hit": False,
        },
        {
            "element": 2,
            "position": "MID",
            "defensive_contribution": 12,
            "defcon_hit": True,
        },
        {
            "element": 3,
            "position": "GK",
            "defensive_contribution": 30,
            "defcon_hit": None,
        },
    ]

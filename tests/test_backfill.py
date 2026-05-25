"""Tests for the historical-season backfill adapter."""

import polars as pl

from fpl_analytics_engine import backfill


def _raw_row(position: str) -> dict:
    return {
        "name": "Saliba",
        "position": position,
        "team": "Arsenal",
        "element": 1,
        "expected_assists": 0.1,
        "expected_goal_involvements": 0.3,
        "expected_goals": 0.2,
        "expected_goals_conceded": 0.9,
        "kickoff_time": "2024-08-17T14:00:00Z",
        "minutes": 90,
        "round": 1,
        "total_points": 6,
        "value": 60,
        "GW": 1,
    }


def test_adapt_vaastav_season_maps_to_enriched_schema() -> None:
    raw = pl.DataFrame([_raw_row("DEF")])

    out = backfill.adapt_vaastav_season(raw, "2024-25")

    assert out.columns == backfill.CANONICAL_COLUMNS
    row = out.to_dicts()[0]
    assert row["web_name"] == "Saliba"
    assert row["position"] == "DEF"
    assert row["team_name"] == "Arsenal"
    assert row["season"] == "2024-25"
    # DefCon data does not exist for historical seasons.
    assert row["defcon_hit"] is None
    assert row["defensive_contribution"] is None
    assert out.schema["expected_goals"] == pl.Float64


def test_adapt_vaastav_season_maps_keepers() -> None:
    out = backfill.adapt_vaastav_season(pl.DataFrame([_raw_row("GKP")]), "2024-25")
    assert out.to_dicts()[0]["position"] == "GK"

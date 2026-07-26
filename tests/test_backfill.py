"""Tests for the historical-season backfill adapter."""

from pathlib import Path

import polars as pl
import pytest

from fpl_analytics_engine import backfill


def _raw_row(position: str) -> dict:
    return {
        "name": "William Saliba",  # vaastav full name; replaced by web_name.
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


def _players_raw() -> pl.DataFrame:
    return pl.DataFrame({"id": [1], "code": [223340], "web_name": ["Saliba"]})


def test_adapt_vaastav_season_maps_to_enriched_schema() -> None:
    raw = pl.DataFrame([_raw_row("DEF")])

    out = backfill.adapt_vaastav_season(raw, _players_raw(), "2024-25")

    assert out.columns == backfill.CANONICAL_COLUMNS
    row = out.to_dicts()[0]
    # web_name and code come from players_raw, not merged_gw's full name.
    assert row["web_name"] == "Saliba"
    assert row["code"] == 223340
    assert row["position"] == "DEF"
    assert row["team_name"] == "Arsenal"
    assert row["season"] == "2024-25"
    # DefCon data does not exist for historical seasons.
    assert row["defcon_hit"] is None
    assert row["defensive_contribution"] is None
    assert out.schema["expected_goals"] == pl.Float64


def test_adapt_vaastav_season_maps_keepers() -> None:
    out = backfill.adapt_vaastav_season(
        pl.DataFrame([_raw_row("GKP")]), _players_raw(), "2024-25"
    )
    assert out.to_dicts()[0]["position"] == "GK"


def test_backfill_preserves_full_current_season_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    season_dir = tmp_path / "2026-27"
    season_dir.mkdir()
    pl.DataFrame(
        [
            {
                "element": 1,
                "fixture": 1,
                "was_home": True,
                "round": 1,
                "kickoff_time": "2026-08-15T14:00:00Z",
                "minutes": 90,
                "total_points": 6,
                "value": 85,
                "expected_goals": "0.20",
                "expected_assists": "0.10",
                "expected_goal_involvements": "0.30",
                "expected_goals_conceded": "1.00",
                "defensive_contribution": 12,
            }
        ]
    ).write_parquet(season_dir / "player_gw_history.parquet")
    pl.DataFrame(
        [{"id": 1, "code": 223340, "web_name": "Saka", "element_type": 3, "team": 10}]
    ).write_parquet(season_dir / "players.parquet")
    pl.DataFrame([{"id": 10, "name": "Arsenal"}]).write_parquet(
        season_dir / "teams.parquet"
    )
    pl.DataFrame([{"id": 1, "team_h": 10, "team_a": 20}]).write_parquet(
        season_dir / "fixtures.parquet"
    )
    monkeypatch.setattr(backfill, "SEASONS", [])

    paths = backfill.backfill(tmp_path, current_season="2026-27")

    assert paths == {"2026-27": season_dir / "enriched.parquet"}
    row = pl.read_parquet(paths["2026-27"]).to_dicts()[0]
    assert row["season"] == "2026-27"
    assert row["web_name"] == "Saka"
    assert row["fixture"] == 1


def test_backfill_skips_empty_preseason_current_archive(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    season_dir = tmp_path / "2026-27"
    season_dir.mkdir()
    pl.DataFrame(schema={"round": pl.Int64}).write_parquet(
        season_dir / "player_gw_history.parquet"
    )
    monkeypatch.setattr(backfill, "SEASONS", [])

    paths = backfill.backfill(tmp_path, current_season="2026-27")

    assert paths == {}
    assert not (season_dir / "enriched.parquet").exists()

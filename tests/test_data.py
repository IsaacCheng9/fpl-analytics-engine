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


def test_load_all_seasons_stamps_missing_season_from_folder(
    tmp_path: Path,
) -> None:
    season_dir = tmp_path / "2025-26"
    season_dir.mkdir()
    pl.DataFrame({"element": [1], "web_name": ["Saka"]}).write_parquet(
        season_dir / "enriched.parquet"
    )

    out = data.load_all_seasons(tmp_path)

    assert out.to_dicts() == [{"element": 1, "web_name": "Saka", "season": "2025-26"}]


def test_latest_archived_season_uses_raw_live_archive(tmp_path: Path) -> None:
    (tmp_path / "2025-26").mkdir()
    (tmp_path / "2026-27").mkdir()
    pl.DataFrame({"round": [1]}).write_parquet(
        tmp_path / "2025-26" / "player_gw_history.parquet"
    )
    pl.DataFrame({"round": [1]}).write_parquet(
        tmp_path / "2026-27" / "player_gw_history.parquet"
    )

    assert data.latest_archived_season(tmp_path) == "2026-27"


def test_latest_archived_season_ignores_empty_preseason_archive(
    tmp_path: Path,
) -> None:
    (tmp_path / "2025-26").mkdir()
    (tmp_path / "2026-27").mkdir()
    pl.DataFrame({"round": [1]}).write_parquet(
        tmp_path / "2025-26" / "player_gw_history.parquet"
    )
    pl.DataFrame(schema={"round": pl.Int64}).write_parquet(
        tmp_path / "2026-27" / "player_gw_history.parquet"
    )

    assert data.latest_archived_season(tmp_path) == "2025-26"


def test_latest_archived_season_falls_back_to_enriched_snapshots(
    tmp_path: Path,
) -> None:
    (tmp_path / "2024-25").mkdir()
    (tmp_path / "2025-26").mkdir()
    pl.DataFrame({"round": [1]}).write_parquet(
        tmp_path / "2024-25" / "enriched.parquet"
    )
    pl.DataFrame({"round": [1]}).write_parquet(
        tmp_path / "2025-26" / "enriched.parquet"
    )

    assert data.latest_archived_season(tmp_path) == "2025-26"

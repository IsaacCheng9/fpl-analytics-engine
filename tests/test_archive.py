"""Tests for the season-archival and live-ingestion pipeline."""

from pathlib import Path

import polars as pl
import pytest

from fpl_analytics_engine import app, archive


def _enrichable_bootstrap() -> dict:
    """Build a bootstrap payload rich enough to enrich into the served view."""
    return {
        "elements": [
            {"id": 1, "code": 101, "web_name": "Saliba", "element_type": 2, "team": 10},
            {"id": 2, "code": 102, "web_name": "Saka", "element_type": 3, "team": 10},
        ],
        "teams": [{"id": 10, "name": "Arsenal"}],
        "events": [
            {"id": 1, "deadline_time": "2025-08-15T17:30:00Z", "finished": True},
            {"id": 2, "deadline_time": "2025-08-22T17:30:00Z", "finished": False},
        ],
    }


def _history_row(round_: int, defcon: int) -> dict:
    """Build one per-gameweek history row carrying the enrichment inputs."""
    return {
        "fixture": round_,
        "was_home": True,
        "round": round_,
        "minutes": 90,
        "total_points": 6,
        "value": 60,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "expected_goals": "0.20",
        "expected_assists": "0.10",
        "expected_goal_involvements": "0.30",
        "expected_goals_conceded": "0.90",
        "defensive_contribution": defcon,
    }


def _fixtures() -> list[dict]:
    """Build the fixture metadata needed for historical club attribution."""
    return [{"id": 1, "team_h": 10, "team_a": 20}]


def test_detect_season_uses_earliest_deadline_year() -> None:
    events = [
        {"deadline_time": "2026-05-24T13:00:00Z"},
        {"deadline_time": "2025-08-15T17:30:00Z"},
    ]
    assert archive.detect_season(events) == "2025-26"


def test_detect_season_rolls_over_the_century() -> None:
    season = archive.detect_season([{"deadline_time": "2099-08-10T17:30:00Z"}])
    assert season == "2099-00"


def test_archive_season_writes_parquet_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bootstrap = {
        "elements": [{"id": 1, "web_name": "A"}, {"id": 2, "web_name": "B"}],
        "teams": [{"id": 10, "name": "Team"}],
        "events": [{"id": 1, "finished": True}],
    }
    histories = {
        1: [{"round": 1, "total_points": 5}],
        2: [{"round": 1, "total_points": 2}, {"round": 2, "total_points": 9}],
    }

    monkeypatch.setattr(app, "get_fpl_data", lambda: bootstrap)
    monkeypatch.setattr(app, "get_fixtures", _fixtures)
    monkeypatch.setattr(
        app, "get_player_history", lambda element_id: histories[element_id]
    )
    # Skip the real politeness delay between requests.
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    paths = archive.archive_season(tmp_path, enrich=False)

    for path in paths.values():
        assert path.exists()

    players = pl.read_parquet(paths["players"])
    assert players.height == 2

    history = pl.read_parquet(paths["player_gw_history"])
    # One row for player 1 plus two rows for player 2.
    assert history.height == 3
    # Every row must carry the player id for downstream joins.
    assert set(history["element"].to_list()) == {1, 2}


def test_archive_season_respects_limit(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bootstrap = {
        "elements": [{"id": 1}, {"id": 2}, {"id": 3}],
        "teams": [{"id": 10}],
        "events": [{"id": 1, "finished": True}],
    }
    fetched: list[int] = []

    def fake_history(element_id: int) -> list[dict]:
        fetched.append(element_id)
        return [{"round": 1, "total_points": 1}]

    monkeypatch.setattr(app, "get_fpl_data", lambda: bootstrap)
    monkeypatch.setattr(app, "get_fixtures", _fixtures)
    monkeypatch.setattr(app, "get_player_history", fake_history)
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    archive.archive_season(tmp_path, limit=2, enrich=False)

    assert fetched == [1, 2]


def test_archive_season_builds_enriched_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bootstrap = _enrichable_bootstrap()
    histories = {
        1: [_history_row(1, defcon=12)],
        2: [_history_row(1, defcon=5)],
    }
    monkeypatch.setattr(app, "get_fpl_data", lambda: bootstrap)
    monkeypatch.setattr(app, "get_fixtures", _fixtures)
    monkeypatch.setattr(
        app, "get_player_history", lambda element_id: histories[element_id]
    )
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    paths = archive.archive_season(tmp_path)

    assert "enriched" in paths
    enriched = pl.read_parquet(paths["enriched"])
    by_element = {row["element"]: row for row in enriched.to_dicts()}
    # Defender clearing the 10-CBIT threshold registers a hit; the other does not.
    assert by_element[1]["position"] == "DEF"
    assert by_element[1]["defcon_hit"] is True
    assert by_element[2]["defcon_hit"] is False


def test_archive_season_skips_enriched_on_early_season_cold_start(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bootstrap = _enrichable_bootstrap()
    bootstrap["events"] = [
        {**event, "finished": False} for event in bootstrap["events"]
    ]
    fetched: list[int] = []

    def fake_history(element_id: int) -> list[dict]:
        fetched.append(element_id)
        return []

    # Preseason: bootstrap exists but no gameweeks have been played yet.
    monkeypatch.setattr(app, "get_fpl_data", lambda: bootstrap)
    monkeypatch.setattr(app, "get_fixtures", _fixtures)
    monkeypatch.setattr(app, "get_player_history", fake_history)
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    paths = archive.archive_season(tmp_path)

    # Raw files are still written, but there is nothing to enrich.
    assert paths["players"].exists()
    assert "enriched" not in paths
    assert not (tmp_path / "enriched.parquet").exists()
    assert fetched == []
    assert pl.read_parquet(paths["player_gw_history"]).is_empty()


def test_ingest_current_season_targets_detected_season_dir(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bootstrap = _enrichable_bootstrap()
    histories = {
        1: [_history_row(1, defcon=12)],
        2: [_history_row(1, defcon=5)],
    }
    fetched_bootstrap = {"count": 0}

    def fake_bootstrap() -> dict:
        fetched_bootstrap["count"] += 1
        return bootstrap

    monkeypatch.setattr(app, "get_fpl_data", fake_bootstrap)
    monkeypatch.setattr(app, "get_fixtures", _fixtures)
    monkeypatch.setattr(
        app, "get_player_history", lambda element_id: histories[element_id]
    )
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    season, paths = archive.ingest_current_season(data_root=tmp_path)

    assert season == "2025-26"
    assert paths["players"] == tmp_path / "2025-26" / "players.parquet"
    assert paths["players"].exists()
    # The bootstrap is fetched once and reused, not re-requested per season dir.
    assert fetched_bootstrap["count"] == 1

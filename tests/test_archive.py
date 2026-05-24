"""Tests for the season-archival pipeline."""

from pathlib import Path

import polars as pl
import pytest

from fpl_analytics_engine import app, archive


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
    monkeypatch.setattr(
        app, "get_player_history", lambda element_id: histories[element_id]
    )
    # Skip the real politeness delay between requests.
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    paths = archive.archive_season(tmp_path)

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
        "events": [{"id": 1}],
    }
    fetched: list[int] = []

    def fake_history(element_id: int) -> list[dict]:
        fetched.append(element_id)
        return [{"round": 1, "total_points": 1}]

    monkeypatch.setattr(app, "get_fpl_data", lambda: bootstrap)
    monkeypatch.setattr(app, "get_player_history", fake_history)
    monkeypatch.setattr(archive.time, "sleep", lambda _seconds: None)

    archive.archive_season(tmp_path, limit=2)

    assert fetched == [1, 2]

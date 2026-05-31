"""Tests for the one-command data refresh workflow."""

from pathlib import Path

import pytest

from fpl_analytics_engine import data_health, refresh


def test_run_refresh_executes_steps_in_order(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[tuple] = []

    def fake_archive(
        data_root: Path, request_delay: float
    ) -> tuple[str, dict[str, Path]]:
        calls.append(("archive", data_root, request_delay))
        return "2026-27", {"players": data_root / "2026-27" / "players.parquet"}

    def fake_backfill(
        data_root: Path, current_season: str | None = None
    ) -> dict[str, Path]:
        calls.append(("backfill", data_root, current_season))
        return {"2026-27": data_root / "2026-27" / "enriched.parquet"}

    def fake_validate(data_root: Path) -> list[data_health.HealthCheck]:
        calls.append(("validate", data_root))
        return [data_health.HealthCheck("2026-27/enriched.parquet", True, "ok")]

    def fake_smoke(data_root: Path, player_name: str) -> list[str]:
        calls.append(("smoke", data_root, player_name))
        return []

    monkeypatch.setattr(refresh.archive, "ingest_current_season", fake_archive)
    monkeypatch.setattr(refresh.backfill, "backfill", fake_backfill)
    monkeypatch.setattr(refresh.data_health, "validate_data_root", fake_validate)
    monkeypatch.setattr(refresh.smoke, "smoke_failures", fake_smoke)

    results = refresh.run_refresh(
        refresh.RefreshOptions(data_root=tmp_path, request_delay=0.25)
    )

    assert all(result.ok for result in results)
    assert [result.name for result in results] == [
        "Archive Current Season",
        "Backfill Historical Seasons",
        "Validate Data",
        "Real-Data Smoke",
    ]
    assert calls == [
        ("archive", tmp_path, 0.25),
        ("backfill", tmp_path, "2026-27"),
        ("validate", tmp_path),
        ("smoke", tmp_path, "Saka"),
    ]


def test_run_refresh_stops_before_smoke_when_validation_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    smoke_called = False

    def fake_validate(data_root: Path) -> list[data_health.HealthCheck]:
        assert data_root == tmp_path
        return [
            data_health.HealthCheck(
                "2026-27/enriched.parquet", False, "Snapshot is missing."
            )
        ]

    def fake_smoke(_data_root: Path, _player_name: str) -> list[str]:
        nonlocal smoke_called
        smoke_called = True
        return []

    monkeypatch.setattr(refresh.data_health, "validate_data_root", fake_validate)
    monkeypatch.setattr(refresh.smoke, "smoke_failures", fake_smoke)

    results = refresh.run_refresh(
        refresh.RefreshOptions(
            data_root=tmp_path,
            skip_archive=True,
            skip_backfill=True,
        )
    )

    assert [result.name for result in results] == [
        "Archive Current Season",
        "Backfill Historical Seasons",
        "Validate Data",
    ]
    assert not results[-1].ok
    assert not smoke_called


def test_main_returns_failure_for_failed_step(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(
        refresh.archive,
        "ingest_current_season",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("API unavailable")),
    )

    status = refresh.main(["--data-root", str(tmp_path), "--skip-smoke"])

    assert status == 1

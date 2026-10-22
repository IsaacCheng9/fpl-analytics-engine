"""Tests for the one-command data refresh workflow."""

from pathlib import Path
from typing import Any

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

    def fake_validate(
        data_root: Path, current_season: str | None = None
    ) -> list[data_health.HealthCheck]:
        calls.append(("validate", data_root, current_season))
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
    staged = calls[0][1]
    assert staged != tmp_path
    assert not staged.exists()
    assert calls == [
        ("archive", staged, 0.25),
        ("backfill", staged, "2026-27"),
        ("validate", staged, "2026-27"),
        ("smoke", staged, "Saka"),
    ]


def test_run_refresh_stops_before_smoke_when_validation_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    smoke_called = False

    def fake_validate(
        data_root: Path, current_season: str | None = None
    ) -> list[data_health.HealthCheck]:
        assert data_root == tmp_path
        assert current_season is None
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


@pytest.mark.parametrize("failure", ["archive", "backfill", "validate", "smoke", None])
def test_refresh_preserves_published_files_until_all_steps_pass(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, failure: str | None
) -> None:
    original = tmp_path / "2026-27" / "enriched.parquet"
    original.parent.mkdir()
    original.write_bytes(b"published")
    unrelated = tmp_path / "notes.txt"
    unrelated.write_text("keep me")

    def step(data_root: Path, name: str) -> None:
        assert original.read_bytes() == b"published"
        (data_root / "2026-27" / "enriched.parquet").write_bytes(name.encode())
        if name == failure:
            raise RuntimeError(f"{name} failed")

    def fake_archive(data_root: Path, request_delay: float) -> tuple[str, dict]:
        step(data_root, "archive")
        return "2026-27", {}

    def fake_backfill(data_root: Path, current_season: str | None) -> dict:
        step(data_root, "backfill")
        return {}

    def fake_validate(data_root: Path, current_season: str | None) -> list:
        step(data_root, "validate")
        return [data_health.HealthCheck("snapshot", True, "ok")]

    def fake_smoke(data_root: Path, player_name: str) -> list:
        step(data_root, "smoke")
        return []

    monkeypatch.setattr(refresh.archive, "ingest_current_season", fake_archive)
    monkeypatch.setattr(refresh.backfill, "backfill", fake_backfill)
    monkeypatch.setattr(refresh.data_health, "validate_data_root", fake_validate)
    monkeypatch.setattr(refresh.smoke, "smoke_failures", fake_smoke)
    results = refresh.run_refresh(refresh.RefreshOptions(data_root=tmp_path))
    assert all(result.ok for result in results) is (failure is None)
    assert original.read_bytes() == (b"smoke" if failure is None else b"published")
    assert unrelated.read_text() == "keep me"


def test_validation_only_refresh_does_not_stage_or_publish(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def unexpected_write(*_args: object) -> None:
        raise AssertionError("Validation must remain read-only")

    monkeypatch.setattr(refresh.snapshots, "stage_snapshot", unexpected_write)
    monkeypatch.setattr(refresh.snapshots, "publish_snapshot", unexpected_write)
    monkeypatch.setattr(
        refresh.data_health,
        "validate_data_root",
        lambda *_args, **_kwargs: [data_health.HealthCheck("snapshot", True, "ok")],
    )
    monkeypatch.setattr(refresh.smoke, "smoke_failures", lambda *_args: [])
    results = refresh.run_refresh(
        refresh.RefreshOptions(
            data_root=tmp_path, skip_archive=True, skip_backfill=True
        )
    )
    assert all(result.ok for result in results)


def test_backup_cleanup_failure_does_not_report_failed_refresh(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    published = tmp_path / "snapshot.parquet"
    published.write_bytes(b"published")
    rmtree = refresh.snapshots.shutil.rmtree

    # Forward everything else untouched: TemporaryDirectory cleanup shares this
    # patched rmtree, and CPython 3.14.9 started passing private keywords to it.
    def fail_backup_cleanup(path: str | Path, *args: Any, **kwargs: Any) -> None:
        if Path(path).name.startswith(".fpl-backup-"):
            raise PermissionError("Cannot delete backup")
        rmtree(path, *args, **kwargs)

    def fake_steps(options: refresh.RefreshOptions) -> list[refresh.StepResult]:
        (options.data_root / "snapshot.parquet").write_bytes(b"replacement")
        return [refresh.StepResult("Verify", True, "Passed")]

    monkeypatch.setattr(refresh, "_run_refresh_steps", fake_steps)
    monkeypatch.setattr(refresh.snapshots.shutil, "rmtree", fail_backup_cleanup)
    results = refresh.run_refresh(refresh.RefreshOptions(data_root=tmp_path))

    assert all(result.ok for result in results)
    assert published.read_bytes() == b"replacement"
    assert "Could not remove snapshot backup" in caplog.text
    # Remove this deliberately retained backup after restoring real cleanup.
    for backup in tmp_path.parent.glob(".fpl-backup-*"):
        if (backup / tmp_path.name).exists():
            rmtree(backup)

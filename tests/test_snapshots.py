"""Verify failed publication restores the last usable snapshot."""

from pathlib import Path

import pytest

from fpl_analytics_engine import snapshots


@pytest.mark.parametrize("interrupt", [False, True])
def test_first_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, interrupt: bool
) -> None:
    destination = tmp_path / "data"
    replace = Path.replace
    with snapshots.stage_snapshot(destination) as staged:
        (staged / "enriched.parquet").write_bytes(b"replacement")

        def interrupt_publication(self: Path, target: Path) -> Path:
            result = replace(self, target)
            if self == staged and interrupt:
                raise KeyboardInterrupt
            return result

        monkeypatch.setattr(Path, "replace", interrupt_publication)
        if interrupt:
            with pytest.raises(KeyboardInterrupt):
                snapshots.publish_snapshot(staged, destination)
            assert not destination.exists()
        else:
            snapshots.publish_snapshot(staged, destination)
            assert (destination / "enriched.parquet").read_bytes() == b"replacement"

    assert list(tmp_path.iterdir()) == ([] if interrupt else [destination])


def test_publication_failure_restores_previous_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "data"
    destination.mkdir()
    (destination / "enriched.parquet").write_bytes(b"published")
    replace = Path.replace
    with snapshots.stage_snapshot(destination) as staged:
        (staged / "enriched.parquet").write_bytes(b"replacement")

        def fail_publication(self: Path, target: Path) -> Path:
            if self == staged:
                raise OSError("Publication failed")
            return replace(self, target)

        monkeypatch.setattr(Path, "replace", fail_publication)
        with pytest.raises(OSError, match="Publication failed"):
            snapshots.publish_snapshot(staged, destination)

    assert (destination / "enriched.parquet").read_bytes() == b"published"
    assert list(tmp_path.iterdir()) == [destination]


def test_failed_rollback_keeps_recoverable_backup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "data"
    destination.mkdir()
    (destination / "enriched.parquet").write_bytes(b"published")
    replace = Path.replace
    with snapshots.stage_snapshot(destination) as staged:

        def fail_replacement(self: Path, target: Path) -> Path:
            if self != destination:
                raise OSError("Replacement failed")
            return replace(self, target)

        monkeypatch.setattr(Path, "replace", fail_replacement)
        with pytest.raises(OSError, match="Replacement failed"):
            snapshots.publish_snapshot(staged, destination)

    backups = list(tmp_path.glob(".fpl-backup-*/data/enriched.parquet"))
    assert len(backups) == 1
    assert backups[0].read_bytes() == b"published"


def test_failed_rollback_after_publication_keeps_both_snapshots(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "data"
    destination.mkdir()
    (destination / "enriched.parquet").write_bytes(b"published")
    replace = Path.replace
    with snapshots.stage_snapshot(destination) as staged:
        (staged / "enriched.parquet").write_bytes(b"replacement")

        def fail_rollback(self: Path, target: Path) -> Path:
            if self == destination and target == staged:
                raise OSError("Rollback failed")
            result = replace(self, target)
            if self == staged:
                raise KeyboardInterrupt
            return result

        monkeypatch.setattr(Path, "replace", fail_rollback)
        with pytest.raises(OSError, match="Rollback failed"):
            snapshots.publish_snapshot(staged, destination)

    backups = list(tmp_path.glob(".fpl-backup-*/data/enriched.parquet"))
    assert len(backups) == 1
    assert backups[0].read_bytes() == b"published"
    assert (destination / "enriched.parquet").read_bytes() == b"replacement"


@pytest.mark.parametrize("interrupt_after", ["backup", "publication"])
def test_interrupted_rename_restores_published_snapshot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, interrupt_after: str
) -> None:
    destination = tmp_path / "data"
    destination.mkdir()
    (destination / "enriched.parquet").write_bytes(b"published")
    replace = Path.replace
    interrupted = False
    with snapshots.stage_snapshot(destination) as staged:
        (staged / "enriched.parquet").write_bytes(b"replacement")

        def interrupt_rename(self: Path, target: Path) -> Path:
            nonlocal interrupted
            result = replace(self, target)
            trigger = destination if interrupt_after == "backup" else staged
            if self == trigger and not interrupted:
                interrupted = True
                raise KeyboardInterrupt
            return result

        monkeypatch.setattr(Path, "replace", interrupt_rename)
        with pytest.raises(KeyboardInterrupt):
            snapshots.publish_snapshot(staged, destination)

    assert (destination / "enriched.parquet").read_bytes() == b"published"
    assert list(tmp_path.iterdir()) == [destination]


def test_publish_preserves_symlinked_destination(tmp_path: Path) -> None:
    target = tmp_path / "target"
    target.mkdir()
    (target / "enriched.parquet").write_bytes(b"published")
    destination = tmp_path / "data"
    destination.symlink_to(target, target_is_directory=True)
    with snapshots.stage_snapshot(destination) as staged:
        (staged / "enriched.parquet").write_bytes(b"replacement")
        snapshots.publish_snapshot(staged, destination)

    assert destination.is_symlink()
    assert (target / "enriched.parquet").read_bytes() == b"replacement"

"""Stage snapshot updates without modifying the published data on failure."""

import logging
import shutil
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory, mkdtemp


@contextmanager
def stage_snapshot(destination: Path) -> Generator[Path]:
    """Copy an existing snapshot to temporary storage on the same filesystem."""
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".fpl-stage-", dir=destination.parent) as directory:
        staged = Path(directory) / destination.name
        if destination.exists():
            shutil.copytree(destination, staged)
        else:
            staged.mkdir()
        yield staged


def publish_snapshot(staged: Path, destination: Path) -> None:
    """Replace a snapshot, restoring the previous directory if publication fails.

    Keep the backup on disk if restoration itself fails. Directory replacement
    has a brief gap and assumes a single refresh writer; it is not a concurrent
    reader transaction.
    """
    destination = destination.resolve()
    backup_root = Path(mkdtemp(prefix=".fpl-backup-", dir=destination.parent))
    previous = backup_root / destination.name
    try:
        try:
            if destination.exists():
                destination.replace(previous)
            staged.replace(destination)
        except BaseException:
            if not staged.exists() and destination.exists():
                destination.replace(staged)
            if previous.exists():
                previous.replace(destination)
            raise
        _remove_backup(backup_root)
    finally:
        if backup_root.exists() and not previous.exists():
            _remove_backup(backup_root)


def _remove_backup(backup_root: Path) -> None:
    """Report leftover backups without treating a committed update as failed."""
    try:
        shutil.rmtree(backup_root)
    except OSError:
        logging.getLogger(__name__).warning(
            "Could not remove snapshot backup at %s; remove it manually after "
            "checking the published data",
            backup_root,
        )

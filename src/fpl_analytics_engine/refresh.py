"""Run the full local data refresh workflow."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from fpl_analytics_engine import archive, backfill, data_health, smoke

DEFAULT_DATA_ROOT = Path("data")
DEFAULT_SMOKE_PLAYER = "Saka"


@dataclass(frozen=True)
class RefreshOptions:
    """Represent options for a data refresh run."""

    data_root: Path = DEFAULT_DATA_ROOT
    request_delay: float = archive.REQUEST_DELAY_SECONDS
    skip_archive: bool = False
    skip_backfill: bool = False
    skip_smoke: bool = False
    smoke_player: str = DEFAULT_SMOKE_PLAYER


@dataclass(frozen=True)
class StepResult:
    """Represent one refresh workflow step result."""

    name: str
    ok: bool
    message: str


def _path_summary(paths: dict[str, Path]) -> str:
    """Return a compact summary of paths written by a step."""
    return ", ".join(f"{name}={path}" for name, path in sorted(paths.items()))


def _health_summary(checks: Sequence[data_health.HealthCheck]) -> str:
    """Return a compact summary of data-health checks."""
    failures = [check for check in checks if not check.ok]
    if not failures:
        return f"{len(checks)} checks passed."
    return "; ".join(f"{check.subject}: {check.message}" for check in failures)


def _ok(name: str, message: str) -> StepResult:
    """Build a passing step result."""
    return StepResult(name=name, ok=True, message=message)


def _fail(name: str, exc: Exception) -> StepResult:
    """Build a failing step result from an exception."""
    return StepResult(name=name, ok=False, message=f"{type(exc).__name__}: {exc}")


def _archive_current_season(options: RefreshOptions) -> tuple[StepResult, str | None]:
    """Run the live current-season archive step."""
    name = "Archive Current Season"
    if options.skip_archive:
        return _ok(name, "Skipped."), None
    try:
        season, paths = archive.ingest_current_season(
            data_root=options.data_root,
            request_delay=options.request_delay,
        )
    except Exception as exc:
        return _fail(name, exc), None
    return _ok(name, f"Ingested {season}: {_path_summary(paths)}."), season


def _backfill_historical(
    options: RefreshOptions, current_season: str | None
) -> StepResult:
    """Run the historical backfill and current canonicalisation step."""
    name = "Backfill Historical Seasons"
    if options.skip_backfill:
        return _ok(name, "Skipped.")
    try:
        paths = backfill.backfill(options.data_root, current_season=current_season)
    except Exception as exc:
        return _fail(name, exc)
    return _ok(name, f"Wrote {_path_summary(paths)}.")


def _validate_data(options: RefreshOptions) -> StepResult:
    """Run the local data-health validation step."""
    name = "Validate Data"
    try:
        checks = data_health.validate_data_root(options.data_root)
    except Exception as exc:
        return _fail(name, exc)
    return StepResult(
        name=name, ok=all(check.ok for check in checks), message=_health_summary(checks)
    )


def _smoke_data(options: RefreshOptions) -> StepResult:
    """Run the real-data smoke step."""
    name = "Real-Data Smoke"
    if options.skip_smoke:
        return _ok(name, "Skipped.")
    try:
        failures = smoke.smoke_failures(options.data_root, options.smoke_player)
    except Exception as exc:
        return _fail(name, exc)
    if failures:
        return StepResult(name=name, ok=False, message="; ".join(failures))
    return _ok(name, f"Passed for {options.smoke_player}.")


def run_refresh(options: RefreshOptions) -> list[StepResult]:
    """Run archive, backfill, validation, and smoke checks in order.

    Args:
        options: Refresh options controlling the data root and skipped steps.

    Returns:
        The step results in execution order. Execution stops after a failed
        archive, backfill, or validation step to avoid piling on noisy errors.
    """
    results: list[StepResult] = []

    archive_result, current_season = _archive_current_season(options)
    results.append(archive_result)
    if not archive_result.ok:
        return results

    backfill_result = _backfill_historical(options, current_season)
    results.append(backfill_result)
    if not backfill_result.ok:
        return results

    validation_result = _validate_data(options)
    results.append(validation_result)
    if not validation_result.ok:
        return results

    results.append(_smoke_data(options))
    return results


def print_report(results: Sequence[StepResult]) -> None:
    """Print a human-readable refresh report."""
    for result in results:
        status = "OK" if result.ok else "FAIL"
        print(f"[{status}] {result.name}: {result.message}")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the data refresh command."""
    parser = argparse.ArgumentParser(
        description=(
            "Archive the current FPL season, backfill historical seasons, "
            "validate local Parquet snapshots, and run a real-data smoke check."
        ),
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        default=DEFAULT_DATA_ROOT,
        help="Root directory containing per-season Parquet snapshots.",
    )
    parser.add_argument(
        "--request-delay",
        type=float,
        default=archive.REQUEST_DELAY_SECONDS,
        help="Seconds to wait between per-player FPL API requests.",
    )
    parser.add_argument(
        "--skip-archive",
        action="store_true",
        help="Skip live FPL archiving and use existing local snapshots.",
    )
    parser.add_argument(
        "--skip-backfill",
        action="store_true",
        help="Skip historical vaastav backfill and current canonicalisation.",
    )
    parser.add_argument(
        "--skip-smoke",
        action="store_true",
        help="Skip the cross-season real-data smoke check.",
    )
    parser.add_argument(
        "--smoke-player",
        default=DEFAULT_SMOKE_PLAYER,
        help="Current-style FPL web_name to use for the smoke check.",
    )
    args = parser.parse_args(argv)

    options = RefreshOptions(
        data_root=args.data_root,
        request_delay=args.request_delay,
        skip_archive=args.skip_archive,
        skip_backfill=args.skip_backfill,
        skip_smoke=args.skip_smoke,
        smoke_player=args.smoke_player,
    )
    results = run_refresh(options)
    print_report(results)
    return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())

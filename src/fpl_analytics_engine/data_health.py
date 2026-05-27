"""Validate local Parquet snapshots before serving analytics."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import polars as pl

from fpl_analytics_engine import data

EXPECTED_SEASONS = ("2022-23", "2023-24", "2024-25", "2025-26")
CURRENT_SEASON = "2025-26"
PARTIAL_EXPECTED_STAT_SEASON = "2022-23"
PARTIAL_EXPECTED_STAT_START_GW = 16
REQUIRED_COLUMNS = (
    "element",
    "code",
    "round",
    "minutes",
    "total_points",
    "value",
    "web_name",
    "position",
    "team_name",
    "season",
    "defcon_hit",
    "defcon_threshold",
    "defensive_contribution",
    *data.EXPECTED_STAT_COLUMNS,
)
REMEDIATION = (
    "Run `uv run python -m fpl_analytics_engine.archive`, then "
    "`uv run python -m fpl_analytics_engine.backfill`."
)


@dataclass(frozen=True)
class HealthCheck:
    """Represent one data-health check result."""

    subject: str
    ok: bool
    message: str


def _ok(subject: str, message: str) -> HealthCheck:
    """Build a passing health check."""
    return HealthCheck(subject=subject, ok=True, message=message)


def _fail(subject: str, message: str) -> HealthCheck:
    """Build a failing health check with remediation."""
    return HealthCheck(subject=subject, ok=False, message=f"{message} {REMEDIATION}")


def _expected_stat_rows(frame: pl.DataFrame, season: str) -> pl.DataFrame:
    """Return rows where expected stats should exist for the given season."""
    if season != PARTIAL_EXPECTED_STAT_SEASON:
        return frame
    return frame.filter(pl.col("round") >= PARTIAL_EXPECTED_STAT_START_GW)


def _check_frame(frame: pl.DataFrame, season: str) -> list[HealthCheck]:
    """Validate one season's enriched frame."""
    checks: list[HealthCheck] = []
    subject = f"{season}/enriched.parquet"

    if frame.is_empty():
        return [_fail(subject, "Snapshot is empty.")]

    missing = sorted(set(REQUIRED_COLUMNS) - set(frame.columns))
    if missing:
        return [_fail(subject, f"Missing required columns: {', '.join(missing)}.")]

    wrong_season_rows = frame.filter(
        pl.col("season").is_null() | (pl.col("season") != season)
    ).height
    if wrong_season_rows:
        checks.append(
            _fail(subject, f"{wrong_season_rows} rows have a missing or wrong season.")
        )

    null_codes = frame["code"].null_count()
    if null_codes:
        checks.append(_fail(subject, f"{null_codes} rows have missing stable code."))

    expected_rows = _expected_stat_rows(frame, season)
    if expected_rows.is_empty():
        checks.append(
            _fail(subject, "No rows exist where expected stats should exist.")
        )
    else:
        for column in data.EXPECTED_STAT_COLUMNS:
            null_expected_stats = expected_rows[column].null_count()
            if null_expected_stats:
                checks.append(
                    _fail(
                        subject,
                        f"{null_expected_stats} expected rows have null {column}.",
                    )
                )

    if season != CURRENT_SEASON:
        for column in ("defcon_hit", "defcon_threshold", "defensive_contribution"):
            non_null_defcon = frame.height - frame[column].null_count()
            if non_null_defcon:
                checks.append(
                    _fail(
                        subject,
                        f"{non_null_defcon} rows have non-null historical {column}.",
                    )
                )
    elif frame["defensive_contribution"].null_count():
        checks.append(_fail(subject, "Current-season DefCon counts contain nulls."))

    if checks:
        return checks
    return [_ok(subject, f"{frame.height} rows validated.")]


def validate_data_root(
    data_root: Path, seasons: Sequence[str] = EXPECTED_SEASONS
) -> list[HealthCheck]:
    """Validate every expected season under ``data_root``.

    Args:
        data_root: Root directory containing one folder per season.
        seasons: Season labels expected to carry ``enriched.parquet`` snapshots.

    Returns:
        Health-check results for each season.
    """
    checks: list[HealthCheck] = []
    for season in seasons:
        path = data_root / season / "enriched.parquet"
        subject = f"{season}/enriched.parquet"
        if not path.exists():
            checks.append(_fail(subject, "Snapshot is missing."))
            continue
        try:
            frame = pl.read_parquet(path)
        except Exception as exc:
            checks.append(_fail(subject, f"Snapshot could not be read: {exc}."))
            continue
        checks.extend(_check_frame(frame, season))
    return checks


def print_report(checks: Sequence[HealthCheck]) -> None:
    """Print a human-readable health report."""
    for check in checks:
        status = "OK" if check.ok else "FAIL"
        print(f"[{status}] {check.subject}: {check.message}")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the data-health command."""
    parser = argparse.ArgumentParser(
        description="Validate local FPL Parquet snapshots before serving analytics.",
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        default=Path("data"),
        help="Root directory containing per-season Parquet snapshots.",
    )
    args = parser.parse_args(argv)

    checks = validate_data_root(args.data_root)
    print_report(checks)
    return 0 if all(check.ok for check in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())

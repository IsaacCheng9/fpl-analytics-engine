"""Validate local Parquet snapshots before serving analytics."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import polars as pl

from fpl_analytics_engine import data

BASE_EXPECTED_SEASONS = ("2022-23", "2023-24", "2024-25", "2025-26")
DEFCON_START_SEASON = "2025-26"
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
RAW_SNAPSHOT_FILES = (
    "players.parquet",
    "teams.parquet",
    "events.parquet",
    "fixtures.parquet",
    "player_gw_history.parquet",
)
REMEDIATION = (
    "Run `uv run python -m fpl_analytics_engine.refresh` to refresh and "
    "validate the local snapshots."
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


def _has_defcon(season: str) -> bool:
    """Return whether a season should carry DefCon data."""
    return data.season_sort_key(season) >= data.season_sort_key(DEFCON_START_SEASON)


def expected_seasons(data_root: Path) -> tuple[str, ...]:
    """Return baseline seasons plus any newer archived enriched seasons.

    Args:
        data_root: Root directory containing one folder per season.

    Returns:
        Season labels expected to have ``enriched.parquet`` snapshots.
    """
    seasons = set(BASE_EXPECTED_SEASONS)
    if data_root.exists():
        seasons.update(
            path.parent.name for path in data_root.glob("*/enriched.parquet")
        )
    return tuple(sorted(seasons, key=data.season_sort_key))


def _season_from_events(events: pl.DataFrame) -> str | None:
    """Return the season label implied by the earliest event deadline."""
    if events.is_empty() or "deadline_time" not in events.columns:
        return None
    deadlines = events["deadline_time"].drop_nulls()
    if deadlines.is_empty():
        return None
    start = min(int(str(deadline)[:4]) for deadline in deadlines)
    return f"{start}-{(start + 1) % 100:02d}"


def _check_history_completion(
    history: pl.DataFrame, events: pl.DataFrame, subject: str
) -> list[HealthCheck]:
    """Require live history rows to belong to finished, checked gameweeks."""
    missing = sorted({"id", "finished", "data_checked"} - set(events.columns))
    if missing:
        # Preserve legacy preseason snapshots without completion metadata.
        if history.is_empty():
            return []
        return [
            _fail(
                subject,
                "Cannot validate history completion without event columns: "
                f"{', '.join(missing)}.",
            )
        ]

    invalid_types = [
        column
        for column in ("finished", "data_checked")
        if events.schema[column] not in (pl.Boolean, pl.Null)
    ]
    if events.schema["id"] != pl.Null and not events.schema["id"].is_integer():
        invalid_types.append("id")
    if invalid_types:
        return [
            _fail(
                subject,
                f"Invalid event completion types: {', '.join(sorted(invalid_types))}.",
            )
        ]

    completed_rounds = events.filter(
        pl.col("finished").fill_null(False) & pl.col("data_checked").fill_null(False)
    )["id"].drop_nulls()
    if history.is_empty():
        if not completed_rounds.is_empty():
            return [_fail(subject, "History is empty despite completed gameweeks.")]
        return []
    if "round" not in history.columns:
        return [_fail(subject, "History snapshot has no round column.")]
    if history.schema["round"] != pl.Null and not history.schema["round"].is_integer():
        return [_fail(subject, "History round must have an integer type.")]
    invalid_rounds = history.filter(
        ~pl.col("round").is_in(completed_rounds.implode()).fill_null(False)
    )["round"].unique()
    if invalid_rounds.is_empty():
        return []
    rounds = ", ".join(str(value) for value in invalid_rounds.sort())
    return [
        _fail(subject, f"History contains unfinished or unchecked gameweeks: {rounds}.")
    ]


def _check_live_archive(data_root: Path, season: str) -> list[HealthCheck]:
    """Validate the raw and served snapshots for the current live season."""
    data_dir = data_root / season
    subject = f"{season}/live archive"
    missing = [name for name in RAW_SNAPSHOT_FILES if not (data_dir / name).exists()]
    if missing:
        return [_fail(subject, f"Missing raw snapshots: {', '.join(missing)}.")]

    try:
        players = data.load_players(data_dir)
        teams = data.load_teams(data_dir)
        events = data.load_events(data_dir)
        fixtures = data.load_fixtures(data_dir)
        history = data.load_player_history(data_dir)
    except Exception as exc:
        return [_fail(subject, f"Raw snapshots could not be read: {exc}.")]

    checks = []
    if players.is_empty():
        checks.append(_fail(subject, "Player snapshot is empty."))
    if teams.is_empty():
        checks.append(_fail(subject, "Team snapshot is empty."))
    if events.is_empty():
        checks.append(_fail(subject, "Event snapshot is empty."))
    if fixtures.is_empty():
        checks.append(_fail(subject, "Fixture snapshot is empty."))

    event_season = _season_from_events(events)
    if event_season is None:
        checks.append(_fail(subject, "Event deadlines do not identify a season."))
    elif event_season != season:
        checks.append(
            _fail(
                subject,
                f"Event deadlines identify {event_season}, not directory {season}.",
            )
        )

    if checks:
        return checks

    checks.extend(_check_history_completion(history, events, subject))
    enriched_path = data_dir / "enriched.parquet"
    enriched_subject = f"{season}/enriched.parquet"
    if enriched_path.exists():
        try:
            enriched = pl.read_parquet(enriched_path)
        except Exception as exc:
            checks.append(
                _fail(enriched_subject, f"Snapshot could not be read: {exc}.")
            )
        else:
            checks.extend(_check_history_completion(enriched, events, enriched_subject))
    elif not history.is_empty():
        checks.append(_fail(enriched_subject, "Snapshot is missing."))

    if checks:
        return checks
    state = "preseason" if history.is_empty() else f"{history.height} history rows"
    return [
        _ok(
            subject,
            f"{players.height} players, {fixtures.height} fixtures, {state} validated.",
        )
    ]


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

    if not _has_defcon(season):
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
        checks.append(_fail(subject, f"{season} DefCon counts contain nulls."))

    if checks:
        return checks
    return [_ok(subject, f"{frame.height} rows validated.")]


def validate_data_root(
    data_root: Path,
    seasons: Sequence[str] | None = None,
    current_season: str | None = None,
) -> list[HealthCheck]:
    """Validate every expected season under ``data_root``.

    Args:
        data_root: Root directory containing one folder per season.
        seasons: Season labels expected to carry ``enriched.parquet`` snapshots.
        current_season: Live season that must carry valid raw snapshots. Inferred
            from the latest raw archive when omitted.

    Returns:
        Health-check results for each season.
    """
    checks: list[HealthCheck] = []
    seasons_to_check = list(seasons or expected_seasons(data_root))
    live_seasons = {
        path.parent.name
        for name in RAW_SNAPSHOT_FILES
        for path in data_root.glob(f"*/{name}")
    }
    if seasons is None and live_seasons:
        live_season = current_season or max(live_seasons, key=data.season_sort_key)
        checks.extend(_check_live_archive(data_root, live_season))
    elif current_season is not None:
        checks.extend(_check_live_archive(data_root, current_season))

    seasons_to_check.sort(key=data.season_sort_key)
    for season in seasons_to_check:
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

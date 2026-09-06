"""Tests for local data-health validation."""

from pathlib import Path

import polars as pl
import pytest

from fpl_analytics_engine import data_health


def _row(
    season: str,
    *,
    round_: int = 1,
    code: int | None = 1,
    expected_goals: float | None = 0.1,
    defcon_hit: bool | None = None,
    defcon_threshold: int | None = None,
    defensive_contribution: int | None = None,
) -> dict:
    return {
        "element": 10,
        "code": code,
        "round": round_,
        "minutes": 90,
        "total_points": 2,
        "value": 50,
        "web_name": "Player",
        "position": "MID",
        "team_name": "Team",
        "season": season,
        "defcon_hit": defcon_hit,
        "defcon_threshold": defcon_threshold,
        "defensive_contribution": defensive_contribution,
        "expected_goals": expected_goals,
        "expected_assists": 0.1,
        "expected_goal_involvements": 0.2,
        "expected_goals_conceded": 1.0,
    }


def _write_enriched(data_root: Path, season: str, rows: list[dict]) -> None:
    season_dir = data_root / season
    season_dir.mkdir(parents=True, exist_ok=True)
    pl.DataFrame(
        rows,
        schema_overrides={
            "code": pl.Int64,
            "defcon_hit": pl.Boolean,
            "defcon_threshold": pl.Int64,
            "defensive_contribution": pl.Int64,
            "expected_goals": pl.Float64,
        },
    ).write_parquet(season_dir / "enriched.parquet")


def _write_valid_data_root(data_root: Path) -> None:
    _write_enriched(
        data_root,
        "2022-23",
        [
            _row("2022-23", round_=1, expected_goals=None),
            _row("2022-23", round_=16),
        ],
    )
    for season in ("2023-24", "2024-25"):
        _write_enriched(data_root, season, [_row(season)])
    _write_enriched(
        data_root,
        "2025-26",
        [
            _row(
                "2025-26",
                defcon_hit=True,
                defcon_threshold=12,
                defensive_contribution=13,
            )
        ],
    )


def _write_preseason_archive(
    data_root: Path,
    season: str = "2026-27",
    deadline: str = "2026-08-21T17:30:00Z",
) -> None:
    """Write a valid raw archive with no completed gameweek history."""
    season_dir = data_root / season
    season_dir.mkdir(parents=True, exist_ok=True)
    pl.DataFrame({"id": [1], "web_name": ["Player"]}).write_parquet(
        season_dir / "players.parquet"
    )
    pl.DataFrame({"id": [1], "name": ["Team"]}).write_parquet(
        season_dir / "teams.parquet"
    )
    pl.DataFrame({"id": [1], "deadline_time": [deadline]}).write_parquet(
        season_dir / "events.parquet"
    )
    pl.DataFrame({"event": [1], "team_h": [1], "team_a": [2]}).write_parquet(
        season_dir / "fixtures.parquet"
    )
    pl.DataFrame(schema={"element": pl.Int64}).write_parquet(
        season_dir / "player_gw_history.parquet"
    )


def _write_live_archive(data_root: Path) -> Path:
    """Write matching raw and served history, including a double gameweek."""
    _write_valid_data_root(data_root)
    _write_preseason_archive(data_root)
    season_dir = data_root / "2026-27"
    pl.DataFrame(
        {
            "id": [1, 2, 3],
            "deadline_time": [
                "2026-08-21T17:30:00Z",
                "2026-08-28T17:30:00Z",
                "2026-09-04T17:30:00Z",
            ],
            "finished": [True, True, False],
            "data_checked": [True, True, False],
        }
    ).write_parquet(season_dir / "events.parquet")
    rows = [
        {
            **_row("2026-27", round_=round_, defensive_contribution=4),
            "element": element,
            "fixture": fixture,
        }
        for element, fixture, round_ in [(10, 1, 1), (10, 2, 1), (11, 2, 1)]
    ]
    _write_enriched(data_root, "2026-27", rows)
    pl.DataFrame(rows).select("element", "fixture", "round").write_parquet(
        season_dir / "player_gw_history.parquet"
    )
    return season_dir


def test_validate_data_root_accepts_canonical_snapshots(tmp_path: Path) -> None:
    _write_valid_data_root(tmp_path)

    checks = data_health.validate_data_root(tmp_path)

    assert checks
    assert all(check.ok for check in checks)


def test_validate_data_root_reports_missing_snapshot(tmp_path: Path) -> None:
    checks = data_health.validate_data_root(tmp_path, seasons=("2025-26",))

    assert not checks[0].ok
    assert "Snapshot is missing" in checks[0].message
    assert "refresh" in checks[0].message


def test_validate_data_root_requires_stable_code(tmp_path: Path) -> None:
    _write_enriched(tmp_path, "2025-26", [_row("2025-26", code=None)])

    checks = data_health.validate_data_root(tmp_path, seasons=("2025-26",))

    assert any("missing stable code" in check.message for check in checks)


def test_validate_data_root_checks_expected_stats_where_expected(
    tmp_path: Path,
) -> None:
    _write_enriched(
        tmp_path, "2022-23", [_row("2022-23", round_=16, expected_goals=None)]
    )

    checks = data_health.validate_data_root(tmp_path, seasons=("2022-23",))

    assert any("null expected_goals" in check.message for check in checks)


def test_validate_data_root_rejects_historical_defcon(tmp_path: Path) -> None:
    _write_enriched(
        tmp_path,
        "2024-25",
        [
            _row(
                "2024-25",
                defcon_hit=True,
                defcon_threshold=10,
                defensive_contribution=12,
            )
        ],
    )

    checks = data_health.validate_data_root(tmp_path, seasons=("2024-25",))

    assert any("historical defcon_hit" in check.message for check in checks)


def test_validate_data_root_discovers_newer_enriched_seasons(
    tmp_path: Path,
) -> None:
    _write_valid_data_root(tmp_path)
    _write_enriched(
        tmp_path,
        "2026-27",
        [
            _row(
                "2026-27",
                defcon_hit=True,
                defcon_threshold=12,
                defensive_contribution=14,
            )
        ],
    )

    checks = data_health.validate_data_root(tmp_path)

    assert all(check.ok for check in checks)
    assert any(check.subject == "2026-27/enriched.parquet" for check in checks)


def test_validate_data_root_accepts_preseason_live_archive(tmp_path: Path) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(tmp_path)

    checks = data_health.validate_data_root(tmp_path, current_season="2026-27")

    assert all(check.ok for check in checks)
    live = next(check for check in checks if check.subject == "2026-27/live archive")
    assert "preseason validated" in live.message


def test_validate_data_root_rejects_unfinished_history(tmp_path: Path) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(tmp_path)
    season_dir = tmp_path / "2026-27"
    pl.DataFrame(
        {
            "id": [1, 2],
            "deadline_time": [
                "2026-08-21T17:30:00Z",
                "2026-08-28T17:30:00Z",
            ],
            "finished": [True, True],
            "data_checked": [True, False],
        }
    ).write_parquet(season_dir / "events.parquet")
    pl.DataFrame(
        {"element": [10, 10], "round": [1, 2], "total_points": [2, 0]}
    ).write_parquet(season_dir / "player_gw_history.parquet")
    _write_enriched(
        tmp_path,
        "2026-27",
        [
            _row(
                "2026-27",
                round_=1,
                defcon_hit=False,
                defcon_threshold=12,
                defensive_contribution=4,
            )
        ],
    )

    checks = data_health.validate_data_root(tmp_path, current_season="2026-27")

    assert any(
        "unfinished or unchecked gameweeks: 2" in check.message for check in checks
    )


def test_validate_data_root_rejects_wrong_live_season_directory(
    tmp_path: Path,
) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(
        tmp_path,
        season="2025-26",
        deadline="2026-08-21T17:30:00Z",
    )

    checks = data_health.validate_data_root(tmp_path, current_season="2025-26")

    assert any(
        "Event deadlines identify 2026-27, not directory 2025-26" in check.message
        for check in checks
    )


def test_validate_data_root_requires_current_raw_archive(tmp_path: Path) -> None:
    _write_valid_data_root(tmp_path)

    checks = data_health.validate_data_root(tmp_path, current_season="2026-27")

    assert any(
        check.subject == "2026-27/live archive" and not check.ok for check in checks
    )


@pytest.mark.parametrize("current_season", [None, "2026-27"])
def test_validate_data_root_accepts_matching_live_history(
    tmp_path: Path, current_season: str | None
) -> None:
    season_dir = _write_live_archive(tmp_path)
    path = season_dir / "enriched.parquet"
    pl.read_parquet(path).reverse().write_parquet(path)

    checks = data_health.validate_data_root(tmp_path, current_season=current_season)

    assert all(check.ok for check in checks)


@pytest.mark.parametrize("current_season", [None, "2026-27"])
@pytest.mark.parametrize(
    ("finished", "data_checked"),
    [(False, False), (False, True), (True, False), (None, True), (True, None)],
)
def test_validate_data_root_rejects_unfinished_served_history(
    tmp_path: Path,
    current_season: str | None,
    finished: bool | None,
    data_checked: bool | None,
) -> None:
    season_dir = _write_live_archive(tmp_path)
    events_path = season_dir / "events.parquet"
    pl.read_parquet(events_path).with_columns(
        pl.when(pl.col("id") == 3)
        .then(pl.lit(finished))
        .otherwise(pl.col("finished"))
        .alias("finished"),
        pl.when(pl.col("id") == 3)
        .then(pl.lit(data_checked))
        .otherwise(pl.col("data_checked"))
        .alias("data_checked"),
    ).write_parquet(events_path)
    path = season_dir / "enriched.parquet"
    frame = pl.read_parquet(path)
    invalid = frame.head(1).with_columns(
        pl.lit(3).alias("round"), pl.lit(3).alias("fixture")
    )
    pl.concat([frame, invalid], how="vertical_relaxed").write_parquet(path)

    checks = data_health.validate_data_root(tmp_path, current_season=current_season)

    assert any(
        not check.ok
        and check.subject == "2026-27/enriched.parquet"
        and "unfinished or unchecked gameweeks: 3" in check.message
        for check in checks
    )


@pytest.mark.parametrize("snapshot", ["player_gw_history", "enriched"])
@pytest.mark.parametrize("round_", [None, 99])
def test_validate_data_root_rejects_unknown_history_round(
    tmp_path: Path, snapshot: str, round_: int | None
) -> None:
    season_dir = _write_live_archive(tmp_path)
    path = season_dir / f"{snapshot}.parquet"
    pl.read_parquet(path).with_columns(
        pl.lit(round_, dtype=pl.Int64).alias("round")
    ).write_parquet(path)

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok and "unfinished or unchecked gameweeks" in check.message
        for check in checks
    )


@pytest.mark.parametrize("served", [False, True])
def test_validate_data_root_rejects_empty_completed_history(
    tmp_path: Path, served: bool
) -> None:
    season_dir = _write_live_archive(tmp_path)
    path = season_dir / "player_gw_history.parquet"
    pl.read_parquet(path).clear().write_parquet(path)
    if not served:
        (season_dir / "enriched.parquet").unlink()

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok and "History is empty despite completed gameweeks" in check.message
        for check in checks
    )
    assert not any("preseason validated" in check.message for check in checks)


@pytest.mark.parametrize(
    ("finished", "data_checked"), [(False, False), (True, False), (True, None)]
)
def test_validate_data_root_accepts_preseason_without_completed_events(
    tmp_path: Path, finished: bool, data_checked: bool | None
) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(tmp_path)
    path = tmp_path / "2026-27" / "events.parquet"
    pl.read_parquet(path).with_columns(
        pl.lit(finished).alias("finished"),
        pl.lit(data_checked, dtype=pl.Boolean).alias("data_checked"),
    ).write_parquet(path)

    checks = data_health.validate_data_root(tmp_path)

    assert all(check.ok for check in checks)


def test_validate_data_root_ignores_noncurrent_raw_history(tmp_path: Path) -> None:
    _write_live_archive(tmp_path)
    _write_preseason_archive(tmp_path, "2025-26", "2025-08-15T17:30:00Z")
    season_dir = tmp_path / "2025-26"
    path = season_dir / "events.parquet"
    pl.read_parquet(path).with_columns(
        pl.lit(False).alias("finished"), pl.lit(False).alias("data_checked")
    ).write_parquet(path)
    pl.DataFrame({"element": [999], "fixture": [999], "round": [1]}).write_parquet(
        season_dir / "player_gw_history.parquet"
    )

    checks = data_health.validate_data_root(tmp_path)

    assert all(check.ok for check in checks)
    assert not any(check.subject == "2025-26/live archive" for check in checks)


@pytest.mark.parametrize("column", ["id", "finished", "data_checked"])
def test_validate_data_root_requires_served_completion_metadata(
    tmp_path: Path, column: str
) -> None:
    season_dir = _write_live_archive(tmp_path)
    history_path = season_dir / "player_gw_history.parquet"
    pl.read_parquet(history_path).clear().write_parquet(history_path)
    events_path = season_dir / "events.parquet"
    pl.read_parquet(events_path).drop(column).write_parquet(events_path)

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok
        and check.subject == "2026-27/enriched.parquet"
        and "Cannot validate history completion without event columns" in check.message
        for check in checks
    )


@pytest.mark.parametrize("seasons", [None, ("2025-26",)])
def test_validate_data_root_requires_served_live_history(
    tmp_path: Path, seasons: tuple[str, ...] | None
) -> None:
    season_dir = _write_live_archive(tmp_path)
    (season_dir / "enriched.parquet").unlink()

    checks = data_health.validate_data_root(
        tmp_path, seasons=seasons, current_season="2026-27"
    )

    assert any(
        not check.ok
        and check.subject == "2026-27/enriched.parquet"
        and "Snapshot is missing" in check.message
        for check in checks
    )


def test_validate_data_root_rejects_served_preseason_history(tmp_path: Path) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(tmp_path)
    season_dir = tmp_path / "2026-27"
    events_path = season_dir / "events.parquet"
    pl.read_parquet(events_path).with_columns(
        pl.lit(False).alias("finished"), pl.lit(False).alias("data_checked")
    ).write_parquet(events_path)
    _write_enriched(
        tmp_path,
        "2026-27",
        [{**_row("2026-27", defensive_contribution=4), "fixture": 1}],
    )

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok
        and check.subject == "2026-27/enriched.parquet"
        and "unfinished or unchecked gameweeks: 1" in check.message
        for check in checks
    )
    assert not any("preseason validated" in check.message for check in checks)


@pytest.mark.parametrize("column", ["id", "finished", "data_checked"])
def test_validate_data_root_reports_invalid_completion_types(
    tmp_path: Path, column: str
) -> None:
    season_dir = _write_live_archive(tmp_path)
    path = season_dir / "events.parquet"
    dtype = pl.String if column == "id" else pl.Int64
    pl.read_parquet(path).with_columns(pl.col(column).cast(dtype)).write_parquet(path)

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok and "Invalid event completion types" in check.message
        for check in checks
    )


@pytest.mark.parametrize("snapshot", ["player_gw_history", "enriched"])
def test_validate_data_root_reports_invalid_round_type(
    tmp_path: Path, snapshot: str
) -> None:
    season_dir = _write_live_archive(tmp_path)
    path = season_dir / f"{snapshot}.parquet"
    pl.read_parquet(path).with_columns(pl.col("round").cast(pl.String)).write_parquet(
        path
    )

    checks = data_health.validate_data_root(tmp_path)

    assert any(
        not check.ok and "History round must have an integer type" in check.message
        for check in checks
    )


@pytest.mark.parametrize(
    "snapshot", [*data_health.RAW_SNAPSHOT_FILES, "enriched.parquet"]
)
@pytest.mark.parametrize("corrupt", [False, True])
@pytest.mark.parametrize("older_archive", [False, True])
def test_data_health_cli_reports_unavailable_live_snapshots(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    snapshot: str,
    corrupt: bool,
    older_archive: bool,
) -> None:
    season_dir = _write_live_archive(tmp_path)
    if older_archive:
        _write_preseason_archive(tmp_path, "2025-26", "2025-08-15T17:30:00Z")
    path = season_dir / snapshot
    if corrupt:
        path.write_bytes(b"not a parquet snapshot")
    else:
        path.unlink()

    assert data_health.main(["--data-root", str(tmp_path)]) == 1
    report = capsys.readouterr().out
    assert "[FAIL] 2026-27/" in report
    assert "could not be read" in report if corrupt else "missing" in report.lower()
    assert "[OK] 2025-26/enriched.parquet" in report


def test_validate_data_root_accepts_untyped_null_preseason_flags(
    tmp_path: Path,
) -> None:
    _write_valid_data_root(tmp_path)
    _write_preseason_archive(tmp_path)
    path = tmp_path / "2026-27" / "events.parquet"
    pl.read_parquet(path).with_columns(
        pl.lit(None).alias("finished"), pl.lit(None).alias("data_checked")
    ).write_parquet(path)

    assert all(check.ok for check in data_health.validate_data_root(tmp_path))

"""Tests for local data-health validation."""

from pathlib import Path

import polars as pl

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

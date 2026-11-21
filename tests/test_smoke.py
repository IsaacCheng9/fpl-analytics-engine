"""Tests for the real-data smoke check module."""

from pathlib import Path

import polars as pl
import pytest

from fpl_analytics_engine import data_health, player, smoke


def _row(
    season: str,
    *,
    round_: int = 1,
    element: int = 7,
    code: int | None = 500,
    web_name: str = "Saka",
    minutes: int = 90,
    expected_goals: float | None = 0.2,
    expected_assists: float | None = 0.1,
    expected_goal_involvements: float | None = 0.3,
    defcon_hit: bool | None = None,
    defcon_threshold: int | None = None,
    defensive_contribution: int | None = None,
) -> dict:
    return {
        "element": element,
        "code": code,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": minutes,
        "total_points": 5,
        "value": 80,
        "web_name": web_name,
        "position": "MID",
        "team_name": "Arsenal",
        "season": season,
        "defcon_hit": defcon_hit,
        "defcon_threshold": defcon_threshold,
        "defensive_contribution": defensive_contribution,
        "expected_goals": expected_goals,
        "expected_assists": expected_assists,
        "expected_goal_involvements": expected_goal_involvements,
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
            "expected_assists": pl.Float64,
            "expected_goal_involvements": pl.Float64,
        },
    ).write_parquet(season_dir / "enriched.parquet")


def _write_valid_smoke_root(data_root: Path) -> None:
    """Create a minimal multi-season snapshot root that passes smoke checks."""
    _write_enriched(
        data_root,
        "2022-23",
        [
            _row(
                "2022-23",
                round_=1,
                expected_goals=None,
                expected_assists=None,
                expected_goal_involvements=None,
            ),
            _row(
                "2022-23",
                round_=16,
                expected_goals=0.4,
                expected_assists=0.2,
                expected_goal_involvements=0.6,
            ),
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


def test_smoke_failures_passes_on_valid_snapshot_root(tmp_path: Path) -> None:
    _write_valid_smoke_root(tmp_path)

    assert smoke.smoke_failures(tmp_path, "Saka") == []


def test_smoke_failures_short_circuits_on_data_health_errors(
    tmp_path: Path,
) -> None:
    failures = smoke.smoke_failures(tmp_path, "Saka")

    assert failures
    assert any("missing" in message.lower() for message in failures)


def test_smoke_failures_reports_missing_player_in_current_season(
    tmp_path: Path,
) -> None:
    _write_valid_smoke_root(tmp_path)

    assert smoke.smoke_failures(tmp_path, "Unknown") == [
        "Unknown was not found in 2025-26."
    ]


def test_smoke_failures_reports_ambiguous_current_season_code(
    tmp_path: Path,
) -> None:
    _write_valid_smoke_root(tmp_path)
    _write_enriched(
        tmp_path,
        "2025-26",
        [
            _row(
                "2025-26",
                element=7,
                code=500,
                defcon_hit=True,
                defcon_threshold=12,
                defensive_contribution=13,
            ),
            _row(
                "2025-26",
                element=8,
                code=501,
                defcon_hit=False,
                defcon_threshold=12,
                defensive_contribution=8,
            ),
        ],
    )

    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "Saka does not map to one stable current-season code."
    ]


def test_smoke_failures_reports_missing_player_seasons(tmp_path: Path) -> None:
    _write_valid_smoke_root(tmp_path)
    _write_enriched(tmp_path, "2023-24", [_row("2023-24", code=999, web_name="Other")])

    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "Saka is missing seasons: 2023-24."
    ]


def test_smoke_failures_reports_incomplete_season_summaries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_valid_smoke_root(tmp_path)
    original = player.season_summaries

    def drop_one_season(history: pl.DataFrame) -> pl.DataFrame:
        return original(history).filter(pl.col("season") != "2024-25")

    monkeypatch.setattr(player, "season_summaries", drop_one_season)

    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "Saka season summaries do not cover every expected season."
    ]


def test_smoke_failures_reports_zero_expected_stat_minutes_in_2022_23(
    tmp_path: Path,
) -> None:
    _write_valid_smoke_root(tmp_path)
    _write_enriched(
        tmp_path,
        "2022-23",
        [
            _row(
                "2022-23",
                round_=1,
                expected_goals=None,
                expected_assists=None,
                expected_goal_involvements=None,
            ),
            _row(
                "2022-23",
                round_=16,
                minutes=0,
                expected_goals=0.0,
                expected_assists=0.0,
                expected_goal_involvements=0.0,
            ),
        ],
    )

    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "2022-23 has no expected-stat minutes from GW16 onward."
    ]


def test_smoke_failures_reports_misaligned_2022_23_xgi90(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_valid_smoke_root(tmp_path)
    original = player.season_summaries

    def skew_partial_season(history: pl.DataFrame) -> pl.DataFrame:
        return original(history).with_columns(
            pl.when(pl.col("season") == data_health.PARTIAL_EXPECTED_STAT_SEASON)
            .then(9.99)
            .otherwise(pl.col("xgi90"))
            .alias("xgi90")
        )

    monkeypatch.setattr(player, "season_summaries", skew_partial_season)

    failures = smoke.smoke_failures(tmp_path, "Saka")
    assert len(failures) == 1
    assert failures[0].startswith("2022-23 xGI/90 is not scoped to GW16+")


def test_smoke_failures_reports_non_null_pre_gw16_expected_and_rolling_stats(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_valid_smoke_root(tmp_path)
    original = player.player_gameweeks

    def leak_raw_xgi(frame: pl.DataFrame, *, window: int) -> pl.DataFrame:
        return original(frame, window=window).with_columns(
            pl.when(pl.col("round") < data_health.PARTIAL_EXPECTED_STAT_START_GW)
            .then(0.25)
            .otherwise(pl.col("expected_goal_involvements"))
            .alias("expected_goal_involvements")
        )

    monkeypatch.setattr(player, "player_gameweeks", leak_raw_xgi)
    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "2022-23 pre-GW16 expected stats are not null in player detail."
    ]

    def leak_rolling_xgi(frame: pl.DataFrame, *, window: int) -> pl.DataFrame:
        return original(frame, window=window).with_columns(
            pl.when(pl.col("round") < data_health.PARTIAL_EXPECTED_STAT_START_GW)
            .then(0.25)
            .otherwise(pl.col("rolling_xgi90"))
            .alias("rolling_xgi90")
        )

    monkeypatch.setattr(player, "player_gameweeks", leak_rolling_xgi)
    assert smoke.smoke_failures(tmp_path, "Saka") == [
        "2022-23 pre-GW16 rolling xGI/90 is not null in player detail."
    ]


def test_main_prints_ok_and_fail_statuses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _write_valid_smoke_root(tmp_path)

    exit_ok = smoke.main(["--data-root", str(tmp_path), "--player", "Saka"])
    assert exit_ok == 0
    assert capsys.readouterr().out.strip() == "[OK] Real-data smoke passed for Saka."

    exit_fail = smoke.main(["--data-root", str(tmp_path), "--player", "Missing"])
    assert exit_fail == 1
    assert capsys.readouterr().out.strip() == "[FAIL] Missing was not found in 2025-26."

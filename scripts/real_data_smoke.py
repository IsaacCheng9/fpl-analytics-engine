"""Run opt-in smoke checks against gitignored local FPL data."""

from __future__ import annotations

import argparse
import math
from collections.abc import Sequence
from pathlib import Path

import polars as pl

from fpl_analytics_engine import data, data_health, player


def _single_code(current: pl.DataFrame, player_name: str) -> int | None:
    """Return the unique current-season code for ``player_name`` if available."""
    codes = current["code"].drop_nulls().unique().to_list()
    if len(codes) != 1:
        return None
    return int(codes[0])


def _approx_equal(left: float | None, right: float) -> bool:
    """Return whether ``left`` approximately equals ``right``."""
    return left is not None and math.isclose(left, right, rel_tol=1e-9, abs_tol=1e-9)


def smoke_failures(data_root: Path, player_name: str) -> list[str]:
    """Check cross-season player-detail behaviour against local real data.

    Args:
        data_root: Root directory containing gitignored per-season snapshots.
        player_name: Current-style FPL ``web_name`` to use as the smoke player.

    Returns:
        Failure messages. An empty list means the smoke check passed.
    """
    failures = [
        f"{check.subject}: {check.message}"
        for check in data_health.validate_data_root(data_root)
        if not check.ok
    ]
    if failures:
        return failures

    all_seasons = data.load_all_seasons(data_root)
    current = all_seasons.filter(
        (pl.col("season") == data_health.CURRENT_SEASON)
        & (pl.col("web_name") == player_name)
    )
    if current.is_empty():
        return [f"{player_name} was not found in {data_health.CURRENT_SEASON}."]

    code = _single_code(current, player_name)
    if code is None:
        return [f"{player_name} does not map to one stable current-season code."]

    history = all_seasons.filter(pl.col("code") == code)
    seasons = set(history["season"].unique().to_list())
    missing = sorted(set(data_health.EXPECTED_SEASONS) - seasons)
    if missing:
        return [f"{player_name} is missing seasons: {', '.join(missing)}."]

    summaries = player.season_summaries(history)
    by_season = {row["season"]: row for row in summaries.to_dicts()}
    if set(by_season) != set(data_health.EXPECTED_SEASONS):
        return [f"{player_name} season summaries do not cover every expected season."]

    season_2022 = history.filter(
        pl.col("season") == data_health.PARTIAL_EXPECTED_STAT_SEASON
    )
    expected_rows = season_2022.filter(
        pl.col("round") >= data_health.PARTIAL_EXPECTED_STAT_START_GW
    )
    expected_minutes = float(expected_rows["minutes"].sum() or 0)
    if expected_minutes <= 0:
        return ["2022-23 has no expected-stat minutes from GW16 onward."]

    expected_xgi = float(expected_rows["expected_goal_involvements"].sum() or 0)
    expected_xgi90 = expected_xgi / expected_minutes * 90
    actual_xgi90 = by_season[data_health.PARTIAL_EXPECTED_STAT_SEASON]["xgi90"]
    if not _approx_equal(actual_xgi90, expected_xgi90):
        return [
            "2022-23 xGI/90 is not scoped to GW16+ "
            f"(expected {expected_xgi90:.4f}, got {actual_xgi90})."
        ]

    gameweeks_2022 = player.player_gameweeks(season_2022, window=5)
    pre_expected = gameweeks_2022.filter(
        pl.col("round") < data_health.PARTIAL_EXPECTED_STAT_START_GW
    )
    if pre_expected["expected_goal_involvements"].drop_nulls().len():
        return ["2022-23 pre-GW16 expected stats are not null in player detail."]
    if pre_expected["rolling_xgi90"].drop_nulls().len():
        return ["2022-23 pre-GW16 rolling xGI/90 is not null in player detail."]

    return []


def main(argv: Sequence[str] | None = None) -> int:
    """Run the real-data smoke script."""
    parser = argparse.ArgumentParser(
        description="Run opt-in smoke checks against local gitignored FPL data.",
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        default=Path("data"),
        help="Root directory containing per-season Parquet snapshots.",
    )
    parser.add_argument(
        "--player",
        default="Saka",
        help="Current-style FPL web_name to use as the cross-season smoke player.",
    )
    args = parser.parse_args(argv)

    failures = smoke_failures(args.data_root, args.player)
    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}")
        return 1

    print(f"[OK] Real-data smoke passed for {args.player}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

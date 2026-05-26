"""Tests for the player-detail rolling form and season summaries."""

import polars as pl
import pytest

from fpl_analytics_engine import player


def _row(
    round_: int,
    *,
    season: str = "2025-26",
    code: int = 999,
    xg: float | None = None,
    xa: float | None = None,
    xgi: float = 0.0,
    minutes: int = 90,
    points: int = 2,
    value: int = 50,
    defcon_hit: bool | None = None,
) -> dict:
    return {
        "code": code,
        "season": season,
        "round": round_,
        "minutes": minutes,
        "total_points": points,
        "value": value,
        "expected_goals": xgi / 2 if xg is None else xg,
        "expected_assists": xgi / 2 if xa is None else xa,
        "expected_goal_involvements": xgi,
        "defcon_hit": defcon_hit,
    }


def _frame(rows: list[dict]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def test_player_gameweeks_rolls_over_the_window() -> None:
    rows = [
        _row(1, xgi=0.2, defcon_hit=True),
        _row(2, xgi=0.4, defcon_hit=False),
        _row(3, xgi=0.6, defcon_hit=True),
    ]
    out = player.player_gameweeks(_frame(rows), window=2).sort("round")
    gw3 = out.row(-1, named=True)

    # Window = GW2-3: (0.4 + 0.6) over 180 minutes, per 90.
    assert gw3["rolling_xgi90"] == pytest.approx((1.0 / 180) * 90)
    assert gw3["rolling_xg90"] == pytest.approx((0.5 / 180) * 90)
    assert gw3["rolling_xa90"] == pytest.approx((0.5 / 180) * 90)
    # DefCon hit-rate over GW2-3: one hit in two games.
    assert gw3["rolling_defcon_hit_rate"] == pytest.approx(0.5)
    # Price is value in tenths of a million.
    assert gw3["price"] == pytest.approx(5.0)


def test_season_summaries_aggregate_per_season_with_defcon_gap() -> None:
    rows = [
        # Prior season: no DefCon data (null), partial output.
        _row(1, season="2024-25", xgi=0.5, points=6, defcon_hit=None),
        _row(2, season="2024-25", xgi=0.5, points=4, defcon_hit=None),
        # Current season: DefCon present.
        _row(1, season="2025-26", xgi=0.3, points=8, value=60, defcon_hit=True),
        _row(2, season="2025-26", xgi=0.3, points=2, value=60, defcon_hit=False),
    ]
    summaries = player.season_summaries(_frame(rows))
    by_season = {row["season"]: row for row in summaries.to_dicts()}

    assert by_season["2024-25"]["games"] == 2
    # xGI per 90 over 180 minutes.
    assert by_season["2025-26"]["xgi90"] == pytest.approx((0.6 / 180) * 90)
    assert by_season["2025-26"]["xg90"] == pytest.approx((0.3 / 180) * 90)
    assert by_season["2025-26"]["xa90"] == pytest.approx((0.3 / 180) * 90)
    # 10 points (8 + 2) at 6.0m.
    assert by_season["2025-26"]["points_per_million"] == pytest.approx(10 / 6.0)
    # DefCon hit-rate exists only where the data does.
    assert by_season["2024-25"]["defcon_hit_rate"] is None
    assert by_season["2025-26"]["defcon_hit_rate"] == pytest.approx(0.5)

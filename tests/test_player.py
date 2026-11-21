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
    defcon: int | None = None,
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
        "defensive_contribution": defcon,
    }


def _frame(rows: list[dict]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def test_player_gameweeks_rolls_over_the_window() -> None:
    rows = [
        _row(1, xgi=0.2, defcon=10),
        _row(2, xgi=0.4, defcon=4),
        _row(3, xgi=0.6, defcon=8),
    ]
    out = player.player_gameweeks(_frame(rows), window=2).sort("round")
    gw3 = out.row(-1, named=True)

    # Window = GW2-3: (0.4 + 0.6) over 180 minutes, per 90.
    assert gw3["rolling_xgi90"] == pytest.approx((1.0 / 180) * 90)
    assert gw3["rolling_xg90"] == pytest.approx((0.5 / 180) * 90)
    assert gw3["rolling_xa90"] == pytest.approx((0.5 / 180) * 90)
    # Mean defensive contribution over GW2-3: (4 + 8) / 2.
    assert gw3["rolling_defcon"] == pytest.approx(6.0)
    # Price is value in tenths of a million.
    assert gw3["price"] == pytest.approx(5.0)


@pytest.mark.parametrize("rounds", [(26, 27, 28, 29, 30, 30), (26, 28, 30)])
def test_rolling_window_uses_gameweeks_including_doubles_and_blanks(rounds) -> None:
    rows = [_row(25, xgi=10.0, defcon=30)]
    rows += [_row(gw, xgi=0.2 * i, defcon=2 * i) for i, gw in enumerate(rounds, 1)]
    rows += [_row(31, xgi=100.0, defcon=100)]
    out = player.player_gameweeks(_frame(rows).reverse(), window=5)
    closing = out.filter(pl.col("round") == 30)
    mean_xgi = sum(0.2 * i for i in range(1, len(rounds) + 1)) / len(rounds)

    assert out.height == len(rows)
    for row in closing.to_dicts():
        assert row["rolling_xgi90"] == pytest.approx(mean_xgi)
        assert row["rolling_xg90"] == pytest.approx(mean_xgi / 2)
        assert row["rolling_xa90"] == pytest.approx(mean_xgi / 2)
        assert row["rolling_defcon"] == pytest.approx(mean_xgi * 10)


def test_one_gameweek_rolling_window_includes_both_double_fixtures() -> None:
    out = player.player_gameweeks(
        _frame([_row(1, xgi=5.0), _row(2, xgi=0.3), _row(2, xgi=0.9)]),
        window=1,
    )

    assert out["rolling_xgi90"].to_list() == pytest.approx([5.0, 0.6, 0.6])


@pytest.mark.parametrize("season", ["2022-23", "2024-25"])
def test_gameweek_rolling_preserves_all_null_historical_metrics(season: str) -> None:
    history = _frame([_row(gw, season=season) for gw in (1, 3, 3, 8)]).with_columns(
        pl.lit(None, dtype=pl.Float64).alias(metric)
        for metric in (
            "expected_goals",
            "expected_assists",
            "expected_goal_involvements",
        )
    )
    out = player.player_gameweeks(history, window=5)

    for metric in ("rolling_xg90", "rolling_xa90", "rolling_xgi90", "rolling_defcon"):
        assert out[metric].null_count() == out.height


def test_player_gameweeks_nulls_2022_23_expected_stats_before_gw16() -> None:
    rows = [
        _row(14, season="2022-23", xg=0.0, xa=0.0, xgi=0.0),
        _row(15, season="2022-23", xg=0.0, xa=0.0, xgi=0.0),
        _row(16, season="2022-23", xg=0.6, xa=0.3, xgi=0.9),
    ]
    out = player.player_gameweeks(_frame(rows), window=3).sort("round")
    by_round = {row["round"]: row for row in out.to_dicts()}

    assert by_round[15]["expected_goals"] is None
    assert by_round[15]["expected_assists"] is None
    assert by_round[15]["expected_goal_involvements"] is None
    assert by_round[15]["rolling_xg90"] is None
    assert by_round[15]["rolling_xa90"] is None
    assert by_round[15]["rolling_xgi90"] is None
    assert by_round[16]["expected_goals"] == pytest.approx(0.6)
    assert by_round[16]["expected_assists"] == pytest.approx(0.3)
    assert by_round[16]["expected_goal_involvements"] == pytest.approx(0.9)
    assert by_round[16]["rolling_xg90"] == pytest.approx((0.6 / 90) * 90)
    assert by_round[16]["rolling_xa90"] == pytest.approx((0.3 / 90) * 90)
    assert by_round[16]["rolling_xgi90"] == pytest.approx((0.9 / 90) * 90)


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


def test_season_summaries_scope_2022_23_expected_stats_to_gw16_onward() -> None:
    rows = [
        # The 2022-23 archive has no expected stats before GW16. These minutes
        # still count for season totals, but must not dilute xG/xA/xGI per 90.
        _row(1, season="2022-23", xg=0.0, xa=0.0, xgi=0.0, points=7),
        _row(2, season="2022-23", xg=0.0, xa=0.0, xgi=0.0, points=2),
        _row(16, season="2022-23", xg=0.4, xa=0.2, xgi=0.6, points=5),
        _row(17, season="2022-23", xg=0.6, xa=0.4, xgi=1.0, points=3),
        # Later seasons should still use the full season.
        _row(1, season="2023-24", xg=0.2, xa=0.2, xgi=0.4),
        _row(2, season="2023-24", xg=0.4, xa=0.2, xgi=0.6),
    ]
    summaries = player.season_summaries(_frame(rows))
    by_season = {row["season"]: row for row in summaries.to_dicts()}

    assert by_season["2022-23"]["games"] == 4
    assert by_season["2022-23"]["minutes"] == 360
    assert by_season["2022-23"]["points"] == 17
    assert by_season["2022-23"]["xg90"] == pytest.approx((1.0 / 180) * 90)
    assert by_season["2022-23"]["xa90"] == pytest.approx((0.6 / 180) * 90)
    assert by_season["2022-23"]["xgi90"] == pytest.approx((1.6 / 180) * 90)
    assert by_season["2023-24"]["xgi90"] == pytest.approx((1.0 / 180) * 90)


def test_player_defcon_metrics_exclude_zero_minute_rows() -> None:
    rows = [
        _row(1, minutes=90, defcon=12, defcon_hit=True),
        _row(2, minutes=0, defcon=0, defcon_hit=False),
        _row(3, minutes=90, defcon=8, defcon_hit=False),
        _row(4, minutes=0, defcon=0, defcon_hit=False),
    ]
    frame = _frame(rows)

    gws = player.player_gameweeks(frame, window=4).sort("round")
    by_round = {row["round"]: row for row in gws.to_dicts()}
    # Raw row counts stay untouched, but rolling mean ignores 0-minute rows.
    assert by_round[2]["defensive_contribution"] == 0
    assert by_round[2]["rolling_defcon"] == pytest.approx(12.0)
    assert by_round[4]["rolling_defcon"] == pytest.approx(10.0)

    summary = player.season_summaries(frame).to_dicts()[0]
    assert summary["defcon_hit_rate"] == pytest.approx(0.5)

"""Tests for point-in-time form computation and back-testing."""

import polars as pl
import pytest

from fpl_analytics_engine import form


def _game(
    element: int,
    round_: int,
    *,
    minutes: int = 90,
    xg: float = 0.0,
    xa: float = 0.0,
    xgi: float = 0.0,
    points: int = 0,
    defcon_hit: bool | None = False,
    position: str = "MID",
    value: int = 50,
    starts: int = 1,
) -> dict:
    """Build one enriched per-gameweek history row for tests."""
    return {
        "element": element,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": minutes,
        "total_points": points,
        "value": value,
        "starts": starts,
        "expected_goals": xg,
        "expected_assists": xa,
        "expected_goal_involvements": xgi,
        "expected_goals_conceded": 0.0,
        "web_name": f"P{element}",
        "position": position,
        "team_name": "T",
        "defcon_hit": defcon_hit,
    }


def _frame(rows: list[dict]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def _player_row(history: pl.DataFrame, as_of_gw: int, window: int, element: int):
    table = form.compute_form_table(history, as_of_gw, window)
    return table.filter(pl.col("element") == element).to_dicts()[0]


def test_form_table_is_point_in_time() -> None:
    # Low early form (GW1-3), hot recent form (GW4-6).
    rows = [_game(1, r, xgi=0.1) for r in (1, 2, 3)]
    rows += [_game(1, r, xgi=0.9) for r in (4, 5, 6)]
    history = _frame(rows)

    at_gw4 = _player_row(history, as_of_gw=4, window=3, element=1)
    # Window = GW2-4; season-to-date = GW1-4. GW5-6 must be invisible.
    assert at_gw4["window_xgi90"] == pytest.approx(1.1 / 270 * 90)
    assert at_gw4["season_xgi90"] == pytest.approx(0.30)
    assert at_gw4["delta_xgi90"] == pytest.approx(1.1 / 270 * 90 - 0.30)

    at_gw6 = _player_row(history, as_of_gw=6, window=3, element=1)
    # With the later data visible the baseline and delta both change.
    assert at_gw6["season_xgi90"] == pytest.approx(0.50)
    assert at_gw6["delta_xgi90"] == pytest.approx(0.40)


@pytest.mark.parametrize("season", ["2022-23", "2023-24", "2026-27"])
def test_expected_rates_use_covered_minutes_without_changing_actual_totals(
    season: str,
) -> None:
    history = _frame(
        [
            _game(1, 15, xg=0.0, xa=0.0, xgi=0.0, points=2),
            _game(1, 16, xg=0.4, xa=0.2, xgi=0.6, points=5),
            _game(1, 17, xg=0.6, xa=0.4, xgi=1.0, points=7),
            _game(1, 18, xg=100.0, xa=100.0, xgi=200.0),
        ]
    ).with_columns(
        pl.lit(season).alias("season"),
        pl.col("expected_goals").alias("expected_goals_conceded"),
    )
    row = _player_row(history, 17, 3, 1)
    denominator = 2 if season == "2022-23" else 3
    for period in ("window", "season"):
        for metric, total in (("xg", 1.0), ("xa", 0.6), ("xgi", 1.6), ("xgc", 1.0)):
            assert row[f"{period}_{metric}90"] == pytest.approx(total / denominator)
        assert row[f"{period}_minutes"] == 270
        assert row[f"{period}_points"] == 14
    assert row["window_games"] == 3
    assert row["window_start_rate"] == 1.0
    assert row["season_points_per_million"] == pytest.approx(14 / 5)
    assert row["window_xgi90_per_million"] == pytest.approx(1.6 / denominator / 5)


def test_precoverage_form_has_unknown_rates_and_does_not_flag_players() -> None:
    history = _frame(
        [_game(1, gw, xg=5, xa=5, xgi=10) for gw in (14, 15)]
    ).with_columns(pl.lit("2022-23").alias("season"))
    table = form.compute_form_table(history, 15, 2)
    row = table.row(0, named=True)
    for period in ("window", "season"):
        for metric in ("xg", "xa", "xgi", "xgc"):
            assert row[f"{period}_{metric}90"] is None
    for metric in ("xg", "xa", "xgi"):
        assert row[f"delta_{metric}90"] is None
        assert row[f"window_{metric}90_per_million"] is None
    assert form.flag_players(table).is_empty()


def test_covered_window_delta_uses_only_covered_season_baseline() -> None:
    history = _frame(
        [_game(1, 15, xgi=100), _game(1, 16, xgi=0.2), _game(1, 17, xgi=0.8)]
    ).with_columns(pl.lit("2022-23").alias("season"))
    row = _player_row(history, 17, 1, 1)
    assert row["window_xgi90"] == pytest.approx(0.8)
    assert row["season_xgi90"] == pytest.approx(0.5)
    assert row["delta_xgi90"] == pytest.approx(0.3)


def test_missing_stats_use_separate_observed_minutes() -> None:
    history = _frame(
        [_game(1, 1, xg=0.4, xa=0.2, xgi=0.6), _game(1, 2, xg=0.8, xa=0.3, xgi=1.1)]
    ).with_columns(
        pl.when(pl.col("round") == 1)
        .then(None)
        .otherwise(pl.col("expected_goals"))
        .alias("expected_goals"),
        pl.lit(None, dtype=pl.Float64).alias("expected_goals_conceded"),
    )
    row = _player_row(history, 2, 2, 1)
    for period in ("window", "season"):
        assert row[f"{period}_xg90"] == pytest.approx(0.8)
        assert row[f"{period}_xa90"] == pytest.approx(0.25)
        assert row[f"{period}_xgi90"] == pytest.approx(0.85)
        assert row[f"{period}_xgc90"] is None
    assert row["window_minutes"] == 180


@pytest.mark.parametrize("rounds", [(26, 27, 28, 29, 30, 30), (26, 28, 29)])
def test_form_window_uses_gameweeks_including_doubles_and_blanks(rounds) -> None:
    rows = [_game(1, 25, xgi=10.0)]
    rows += [
        _game(1, gw, xg=0.4, xa=0.2, xgi=0.6, points=5, defcon_hit=True)
        for gw in rounds
    ]
    rows += [_game(1, 31, xgi=100.0)]
    row = _player_row(_frame(rows), as_of_gw=30, window=5, element=1)

    assert row["window_games"] == len(rounds)
    assert row["window_minutes"] == 90 * len(rounds)
    assert row["window_points"] == 5 * len(rounds)
    assert row["window_xg90"] == pytest.approx(0.4)
    assert row["window_xa90"] == pytest.approx(0.2)
    assert row["window_xgi90"] == pytest.approx(0.6)
    assert row["window_defcon_hit_rate"] == 1.0
    assert row["window_start_rate"] == 1.0
    assert row["season_xgi90"] == pytest.approx(
        (10.0 + 0.6 * len(rounds)) / (len(rounds) + 1)
    )
    assert row["delta_xgi90"] == pytest.approx(0.6 - row["season_xgi90"])


def test_form_window_does_not_backfill_an_entirely_blank_window() -> None:
    row = _player_row(_frame([_game(1, 25, xgi=1.0)]), 30, 5, 1)

    assert row["window_games"] == 0
    assert row["window_minutes"] == 0
    assert row["window_xgi90"] is None
    assert row["delta_xgi90"] is None
    assert row["window_defcon_hit_rate"] is None
    assert row["window_start_rate"] is None
    assert row["season_xgi90"] == 1.0


def test_form_table_reports_value_and_start_rate() -> None:
    # Started three of four window games; price closes at 6.0m.
    rows = [_game(1, r, xg=0.4, xa=0.2, xgi=0.6, points=6, value=60) for r in (1, 2, 3)]
    rows += [
        _game(
            1,
            4,
            xg=0.4,
            xa=0.2,
            xgi=0.6,
            points=6,
            value=60,
            minutes=20,
            starts=0,
        )
    ]
    row = _player_row(_frame(rows), as_of_gw=4, window=4, element=1)

    assert row["window_xg90_per_million"] == pytest.approx(row["window_xg90"] / 6.0)
    assert row["window_xa90_per_million"] == pytest.approx(row["window_xa90"] / 6.0)
    assert row["window_xgi90_per_million"] == pytest.approx(row["window_xgi90"] / 6.0)
    assert row["season_points_per_million"] == pytest.approx(24 / 6.0)
    assert row["window_start_rate"] == pytest.approx(0.75)
    # Four appearances (90, 90, 90, 20) average 72.5 minutes each.
    assert row["window_mins_per_appearance"] == pytest.approx(72.5)


def test_window_mins_per_appearance_excludes_blank_games() -> None:
    rows = [
        _game(1, 1, minutes=90),
        _game(1, 2, minutes=0, starts=0),
        _game(1, 3, minutes=30, starts=0),
    ]
    row = _player_row(_frame(rows), as_of_gw=3, window=3, element=1)
    # The 0-minute game is not an appearance, so the mean is (90 + 30) / 2.
    assert row["window_mins_per_appearance"] == pytest.approx(60.0)


def test_form_table_null_start_rate_without_starts_column() -> None:
    # Older canonical snapshots lack per-gameweek starts; rate must be null.
    history = _frame([_game(1, 1, xgi=0.5)]).drop("starts")
    row = _player_row(history, as_of_gw=1, window=3, element=1)
    assert row["window_start_rate"] is None


def test_flag_players_ranks_and_filters() -> None:
    # P1 improves (positive delta); P2 declines (negative delta).
    rows = [_game(1, r, xgi=0.1) for r in (1, 2)]
    rows += [_game(1, r, xgi=0.9) for r in (3, 4)]
    rows += [_game(2, r, xgi=0.9) for r in (1, 2)]
    rows += [_game(2, r, xgi=0.1) for r in (3, 4)]
    table = form.compute_form_table(_frame(rows), as_of_gw=4, window=2)

    flagged = form.flag_players(table, min_delta_xgi90=0.0)

    elements = flagged["element"].to_list()
    assert 1 in elements  # improving player is flagged
    assert 2 not in elements  # declining player has a negative delta


def test_defcon_hit_rate_by_position() -> None:
    rows = [
        _game(1, 1, defcon_hit=True, position="DEF"),
        _game(1, 2, defcon_hit=False, position="DEF"),
        _game(1, 3, defcon_hit=True, position="DEF"),
        _game(2, 1, defcon_hit=None, position="GK"),
        _game(2, 2, defcon_hit=None, position="GK"),
        _game(2, 3, defcon_hit=None, position="GK"),
    ]
    table = form.compute_form_table(_frame(rows), as_of_gw=3, window=3)

    defender = table.filter(pl.col("element") == 1).to_dicts()[0]
    keeper = table.filter(pl.col("element") == 2).to_dicts()[0]
    assert defender["window_defcon_hit_rate"] == pytest.approx(2 / 3)
    assert keeper["window_defcon_hit_rate"] is None


def test_backtest_flags_replays_each_gameweek() -> None:
    # A monotonically improving player is flagged from the window onward.
    history = _frame([_game(1, r, xgi=0.1 * r) for r in (1, 2, 3, 4)])

    flags = form.backtest_flags(history, window=2, min_delta_xgi90=0.0)

    assert set(flags["as_of_gw"].to_list()) == {2, 3, 4}


def test_evaluate_flags_attaches_next_gameweek_points() -> None:
    history = _frame([_game(1, r, xgi=0.1 * r, points=r) for r in (1, 2, 3, 4)])
    flags = form.backtest_flags(history, window=2, min_delta_xgi90=0.0)

    evaluated = form.evaluate_flags(history, flags)

    # The flag after GW2 should see GW3's points (= 3).
    after_gw2 = evaluated.filter(pl.col("as_of_gw") == 2).to_dicts()[0]
    assert after_gw2["next_gw_points"] == 3
    # The flag after the final GW4 has no following gameweek.
    after_gw4 = evaluated.filter(pl.col("as_of_gw") == 4).to_dicts()[0]
    assert after_gw4["next_gw_points"] is None

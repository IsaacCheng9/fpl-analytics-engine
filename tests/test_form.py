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
    code: int | None = None,
) -> dict:
    """Build one enriched per-gameweek history row for tests."""
    return {
        "element": element,
        "code": element * 100 if code is None else code,
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


def test_precoverage_form_has_unknown_rates_and_no_delta_to_filter() -> None:
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
    assert row["projected_xgi"] is None
    assert form.flag_players(table, min_delta_xgi90=0.0).is_empty()


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


def test_flag_players_ranks_by_projection_then_estimate_then_element() -> None:
    table = pl.DataFrame(
        {
            "element": [3, 1, 2, 4],
            "position": ["MID"] * 4,
            "window_minutes": [270] * 4,
            "delta_xgi90": [0.5, 0.0, 0.0, -0.1],
            "projected_xgi": [0.2, 0.2, 0.2, 0.4],
            "est_xgi90": [0.2, 0.5, 0.5, None],
        }
    )

    flagged = form.flag_players(table, min_window_minutes=0, min_delta_xgi90=-1.0)

    # The largest delta does not lead: the delta is descriptive only.
    assert flagged["element"].to_list() == [4, 1, 2, 3]


def test_prior_season_rates_use_covered_minutes_per_metric() -> None:
    history = _frame(
        [
            _game(1, 1, xgi=0.6, xg=0.3),
            _game(1, 2, xgi=0.0, minutes=0),
            # A missing xA leaves the other metrics' minutes intact.
            {**_game(1, 3, xgi=0.3, xg=0.3), "expected_assists": None},
        ]
    ).with_columns(pl.lit("2025-26").alias("season"))

    rates = form.prior_season_rates(history).to_dicts()

    assert rates == [
        {
            "code": 100,
            "prior_xg90": pytest.approx(0.3),
            "prior_xa90": pytest.approx(0.0),
            "prior_xgi90": pytest.approx(0.45),
            "prior_xg_minutes": 180,
            "prior_xa_minutes": 90,
            "prior_xgi_minutes": 180,
        }
    ]


def test_prior_season_rates_skip_minutes_before_2022_23_coverage() -> None:
    history = _frame([_game(1, 10, xgi=0.9), _game(1, 20, xgi=0.3)]).with_columns(
        pl.lit("2022-23").alias("season")
    )

    row = form.prior_season_rates(history).to_dicts()[0]

    # Only GW16 onwards counts, so the gate sees 90 minutes, not 180.
    assert row["prior_xgi90"] == pytest.approx(0.3)
    assert row["prior_xgi_minutes"] == 90


def test_estimated_rate_shrinks_towards_last_season_with_enough_minutes() -> None:
    history = _frame(
        [_game(1, r, xgi=0.9) for r in (1, 2)]
        + [_game(2, r, xgi=0.9) for r in (1, 2)]
        + [_game(3, r, xgi=0.9) for r in (1, 2)]
    )
    prior = pl.DataFrame(
        {
            "code": [100, 200],
            "prior_xg90": [0.0, 0.0],
            "prior_xa90": [0.0, 0.0],
            "prior_xgi90": [0.3, 0.3],
            "prior_xg_minutes": [900, 899],
            "prior_xa_minutes": [900, 899],
            "prior_xgi_minutes": [900, 899],
        }
    )

    table = form.compute_form_table(history, as_of_gw=2, window=1, prior=prior)
    rows = {row["element"]: row for row in table.to_dicts()}

    # 1.8 season xGI plus 900 minutes at 0.3 per 90, over 180 + 900 minutes.
    assert rows[1]["est_xgi90"] == pytest.approx((1.8 + 3.0) / 1080 * 90)
    # One minute short of the gate, or no prior at all, keeps the season rate.
    assert rows[2]["est_xgi90"] == pytest.approx(0.9)
    assert rows[3]["est_xgi90"] == pytest.approx(0.9)
    assert "code" not in table.columns


def test_estimated_rate_weighs_only_minutes_with_the_stat() -> None:
    history = _frame(
        [_game(1, 1, xgi=0.9), {**_game(1, 2), "expected_goal_involvements": None}]
    )
    prior = pl.DataFrame(
        {
            "code": [100],
            **{f"prior_{m}90": [0.3] for m in ("xg", "xa", "xgi")},
            **{f"prior_{m}_minutes": [900] for m in ("xg", "xa", "xgi")},
        }
    )

    row = form.compute_form_table(history, 2, 2, prior).to_dicts()[0]

    # The season rate and its shrinkage weight both use the 90 covered minutes,
    # while projected minutes still count both games.
    assert row["est_xgi90"] == pytest.approx((0.9 + 3.0) / 990 * 90)
    assert row["projected_minutes"] == pytest.approx(90.0)


def test_estimated_rate_equals_season_rate_without_prior() -> None:
    table = form.compute_form_table(_frame([_game(1, 1, xgi=0.45)]), 1, 1)

    assert table["est_xgi90"].to_list() == table["season_xgi90"].to_list()


def test_projection_blends_window_and_season_minutes() -> None:
    rows = [_game(1, r, minutes=0) for r in (1, 2)]
    rows += [_game(1, r, minutes=90, xgi=0.6) for r in (3, 4)]
    table = form.compute_form_table(_frame(rows), as_of_gw=4, window=2)
    row = table.to_dicts()[0]

    # Window 180 / 2 GWs and season 180 / 4 GWs, blended evenly.
    assert row["projected_minutes"] == pytest.approx(0.5 * 90 + 0.5 * 45)
    assert row["projected_xgi"] == pytest.approx(0.6 * 67.5 / 90)


def test_projection_window_never_exceeds_gameweeks_played() -> None:
    table = form.compute_form_table(_frame([_game(1, 1, minutes=60)]), 1, 5)

    assert table["projected_minutes"].to_list() == [pytest.approx(60.0)]


def test_projection_averages_a_mid_season_signing_over_their_own_gameweeks() -> None:
    # P1 joins in GW3 and starts both games; P2 was benched in GW1-2.
    rows = [_game(1, r) for r in (3, 4)]
    rows += [_game(2, r, minutes=0) for r in (1, 2)] + [_game(2, r) for r in (3, 4)]
    table = form.compute_form_table(_frame(rows), as_of_gw=4, window=3)
    rows_by_element = {row["element"]: row for row in table.to_dicts()}

    assert rows_by_element[1]["projected_minutes"] == pytest.approx(90.0)
    # Window 180 / 3 GWs and season 180 / 4 GWs.
    assert rows_by_element[2]["projected_minutes"] == pytest.approx(0.5 * 60 + 0.5 * 45)


def _validation_season() -> pl.DataFrame:
    rows = []
    for round_ in range(1, 11):
        # P1 steady; P2 is dropped after GW8; P3 is a keeper and excluded.
        rows.append(_game(1, round_, xgi=0.5, points=5))
        rows.append(_game(2, round_, xgi=0.2, points=2, minutes=90 * (round_ <= 8)))
        rows.append(_game(3, round_, position="GK"))
    # P4 stops appearing after GW8, so later completed GWs count as zero.
    rows += [_game(4, round_, xgi=0.3, points=3) for round_ in range(1, 9)]
    return _frame(rows)


def test_backtest_form_signals_scores_complete_horizons_only() -> None:
    scored = form.backtest_form_signals(_validation_season(), window=5, horizon=2)

    # GW5 is skipped because its window covers the whole season so far.
    assert sorted(scored["as_of_gw"].unique().to_list()) == [6, 7, 8]
    assert set(scored["element"].to_list()) == {1, 2, 4}
    p4_after_gw8 = scored.filter(pl.col("element") == 4, pl.col("as_of_gw") == 8)
    assert p4_after_gw8["future_mpg"].to_list() == [0.0]
    assert p4_after_gw8["future_points"].to_list() == [0]
    # The comparison projection swaps projected minutes for season minutes.
    assert scored["projected_xgi_season_minutes"].to_list() == pytest.approx(
        (scored["est_xgi90"] * scored["season_mpg"] / 90).to_list()
    )


def test_summarise_form_validation_scores_each_signal() -> None:
    scored = form.backtest_form_signals(_validation_season(), window=5, horizon=2)

    summary = form.summarise_form_validation(scored, top_k=1)

    assert summary["n_predictions"] == scored.height
    assert summary["n_gameweeks"] == 3
    assert [row["signal"] for row in summary["signals"]] == list(
        form.VALIDATION_SIGNALS
    )
    projected = summary["signals"][0]
    # P1 has the highest projection in every slate and scores 10 points each.
    assert projected["top_future_points"] == pytest.approx(10.0)
    assert projected["top_future_xgi"] == pytest.approx(1.0)


def _scored_slate(
    rows: list[tuple[int, float, float | None, float, int]],
) -> pl.DataFrame:
    """Build one backtest slate of (element, signal, window, xGI, points)."""
    return pl.DataFrame(
        [
            {
                "as_of_gw": 6,
                "element": element,
                **{name: value for name in form.VALIDATION_SIGNALS},
                # The window signals are null without window minutes.
                "window_xgi90": window,
                "delta_xgi90": None if window is None else 0.0,
                "window_minutes": 0 if window is None else 450,
                "window_mpg": 90.0,
                "season_mpg": 90.0,
                "future_xgi": future_xgi,
                "future_xgi_minutes": 360.0,
                "future_mpg": 90.0,
                "future_points": points,
            }
            for element, value, window, future_xgi, points in rows
        ]
    )


def test_summarise_form_validation_compares_signals_on_one_population() -> None:
    scored = _scored_slate(
        [
            # Listed out of element order to check that ties break on element.
            (2, 0.5, 0.5, 0.4, 8),
            (1, 0.5, 0.5, 1.0, 4),
            (3, 0.1, 0.1, 0.2, 1),
            # The best projection has no window rate, so no signal scores it.
            (4, 0.9, None, 0.0, 20),
        ]
    )

    summary = form.summarise_form_validation(scored, top_k=1)
    projected = summary["signals"][0]

    # The count describes the players every signal ranked.
    assert summary["n_predictions"] == 3
    assert projected["top_future_points"] == 4
    # Average ranks (2.5, 2.5, 1) against (3, 2, 1) give 1.5 / sqrt(1.5 * 2).
    assert projected["mean_rank_correlation"] == pytest.approx(1.5 / 3**0.5)


def test_summarise_form_validation_scores_each_minutes_forecast() -> None:
    scored = _scored_slate(
        [(1, 0.5, 0.5, 1.0, 4), (2, 0.4, None, 0.0, 0)]
    ).with_columns(
        # P1 has returned to the side; P2 has dropped out of it.
        pl.Series("window_mpg", [90.0, 0.0]),
        pl.Series("season_mpg", [30.0, 60.0]),
        pl.Series("future_mpg", [90.0, 0.0]),
    )

    forecasts = form.summarise_form_validation(scored)["minutes_forecast"]

    # Both players miss by 60 on season minutes and 30 on the even blend,
    # and the player without window minutes still counts.
    assert forecasts == [
        {"forecast": "season_mpg", "mean_absolute_error": pytest.approx(60.0)},
        {"forecast": "projected_minutes", "mean_absolute_error": pytest.approx(30.0)},
        {"forecast": "window_mpg", "mean_absolute_error": pytest.approx(0.0)},
    ]


def test_slate_slope_weights_players_and_resamples_slates() -> None:
    frame = pl.DataFrame(
        {
            "as_of_gw": [1, 1, 2, 3, 3],
            "swing": [1.0, -1.0, 2.0, 0.0, 0.0],
            "change": [0.6, -0.2, 0.4, 1.0, -1.0],
            "weight": [2.0, 1.0, 1.0, 1.0, 1.0],
        }
    )

    slope, low, high = form._slate_slope(
        frame, change=pl.col("change"), swing=pl.col("swing"), weight=pl.col("weight")
    )

    # Slate 1 gives 1.4 / 3 and slate 2 gives 0.8 / 4; slate 3 has no swing.
    assert slope == pytest.approx(2.2 / 7)
    assert (low, high) == (pytest.approx(0.8 / 4), pytest.approx(1.4 / 3))


def test_slate_slope_needs_two_slates_with_a_swing_for_an_interval() -> None:
    frame = pl.DataFrame(
        {"as_of_gw": [1, 2, 2], "swing": [1.0, 0.0, 0.0], "change": [0.5, 1.0, 2.0]}
    )
    args = {"change": pl.col("change"), "weight": pl.lit(1.0)}

    assert form._slate_slope(frame, swing=pl.col("swing"), **args) == (
        pytest.approx(0.5),
        None,
        None,
    )
    assert form._slate_slope(frame, swing=pl.lit(0.0), **args) == (None, None, None)


def test_summarise_form_validation_handles_no_predictions() -> None:
    summary = form.summarise_form_validation(pl.DataFrame())

    assert summary["n_predictions"] == 0
    assert summary["minutes_forecast"] == []
    assert summary["signals"] == []


def test_flag_defcon_breaks_hit_rate_ties_by_window_defcon_then_element() -> None:
    table = pl.DataFrame(
        {
            "element": [3, 1, 2],
            "position": ["DEF"] * 3,
            "window_minutes": [270] * 3,
            "window_defcon_hit_rate": [0.5, 0.5, 0.5],
            "window_defcon": [9.0, 12.0, 12.0],
        }
    )

    flagged = form.flag_defcon(table)

    assert flagged["element"].to_list() == [1, 2, 3]


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


def test_backtest_flags_ranks_on_the_prior_without_a_delta_filter() -> None:
    # P1 leads on season rate, but P2 had a far higher rate last season, and
    # P2's falling form leaves a negative delta that is no longer filtered.
    history = _frame(
        [_game(1, r, xgi=0.5) for r in (1, 2)]
        + [_game(2, 1, xgi=0.6), _game(2, 2, xgi=0.2)]
    )
    prior = pl.DataFrame(
        {
            "code": [100, 200],
            **{f"prior_{m}90": [0.0, 1.5] for m in ("xg", "xa", "xgi")},
            **{f"prior_{m}_minutes": [900, 900] for m in ("xg", "xa", "xgi")},
        }
    )

    flags = form.backtest_flags(history, window=1, gw_range=range(2, 3), prior=prior)

    assert flags["element"].to_list() == [2, 1]


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


def test_evaluate_flags_counts_completed_blanks_without_inventing_future_results() -> (
    None
):
    history = _frame(
        [
            _game(1, 1, points=3),
            _game(2, 1, points=2),
            _game(2, 2, points=4),
            _game(2, 2, points=5),
            _game(3, 2, minutes=0, points=0),
            _game(1, 4, points=8),
        ]
    )
    flags = pl.DataFrame({"element": [1, 2, 3, 1, 1], "as_of_gw": [1, 1, 1, 2, 4]})
    evaluated = form.evaluate_flags(history, flags)
    assert evaluated["next_gw_points"].to_list() == [0, 9, 0, None, None]
    assert evaluated["next_gw_points"].mean() == 3.0
    assert evaluated.columns == ["element", "as_of_gw", "next_gw_points"]


def test_evaluate_flags_does_not_impute_recorded_missing_points() -> None:
    history = pl.DataFrame(
        {
            "element": [1, 1, 2, 2, 3],
            "round": [2, 2, 2, 2, 1],
            "total_points": [None, 4, 3, 2, 1],
        },
        schema_overrides={"total_points": pl.Int64},
    )
    flags = pl.DataFrame({"element": [1, 2, 3], "as_of_gw": [1, 1, 1]})
    assert form.evaluate_flags(history, flags)["next_gw_points"].to_list() == [
        None,
        5,
        0,
    ]


def test_evaluate_flags_preserves_empty_history_as_unknown() -> None:
    history = _frame([_game(1, 1)]).clear()
    flags = pl.DataFrame({"element": [1], "as_of_gw": [1]})
    assert form.evaluate_flags(history, flags)["next_gw_points"].to_list() == [None]

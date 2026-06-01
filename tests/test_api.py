"""Tests for the FastAPI endpoints."""

from collections.abc import Iterator

import polars as pl
import pytest
from fastapi.testclient import TestClient

from fpl_analytics_engine import api


def _game(
    element: int,
    round_: int,
    *,
    xgi: float = 0.0,
    defcon_hit: bool | None = False,
    position: str = "MID",
    minutes: int = 90,
) -> dict:
    """Build one enriched per-gameweek history row for tests."""
    threshold = 10 if position == "DEF" else 12 if position in {"MID", "FWD"} else None
    defensive_contribution = (
        threshold
        if defcon_hit is True
        else threshold - 1
        if defcon_hit is False and threshold is not None
        else None
    )
    return {
        "element": element,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": minutes,
        "total_points": 0,
        "value": 50,
        "expected_goals": 0.0,
        "expected_assists": 0.0,
        "expected_goal_involvements": xgi,
        "expected_goals_conceded": 0.0,
        "web_name": f"P{element}",
        "position": position,
        "team_name": "T",
        "defensive_contribution": defensive_contribution,
        "defcon_threshold": threshold,
        "defcon_hit": defcon_hit,
    }


def _history() -> pl.DataFrame:
    rows = []
    # P1 (MID): improving xGI -> positive delta over a short window.
    rows += [_game(1, r, xgi=0.1 * r) for r in (1, 2, 3, 4)]
    # P2 (MID): declining xGI -> negative delta.
    rows += [_game(2, r, xgi=0.5 - 0.1 * r) for r in (1, 2, 3, 4)]
    # P3 (DEF): hits DefCon in 3 of 4 games.
    hits = [True, True, False, True]
    rows += [_game(3, r, defcon_hit=h, position="DEF") for r, h in enumerate(hits, 1)]
    # P4 (GK): ineligible for DefCon.
    rows += [_game(4, r, defcon_hit=None, position="GK") for r in (1, 2, 3, 4)]
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def _empty_teams() -> pl.DataFrame:
    return pl.DataFrame(schema={"id": pl.Int64, "name": pl.String})


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Default to empty fixture/overlay context so endpoints never touch disk;
    # individual tests override these where the context is under test.
    api.app.dependency_overrides[api.get_history] = _history
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame()
    api.app.dependency_overrides[api.get_teams] = _empty_teams
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame()
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_root_reports_latest_gameweek(client: TestClient) -> None:
    body = client.get("/").json()
    assert body["latest_gw"] == 4


def test_fpl_team_endpoint_imports_public_picks(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {
            "id": [1, 3],
            "web_name": ["P1", "P3"],
            "element_type": [3, 2],
            "team": [10, 20],
        }
    )
    api.app.dependency_overrides[api.get_teams] = lambda: pl.DataFrame(
        {"id": [10, 20], "name": ["Arsenal", "Chelsea"]}
    )

    def fake_fetch(entry_id: int, event: int) -> dict:
        assert entry_id == 123
        assert event == 4
        return {
            "picks": [
                {
                    "element": 3,
                    "position": 2,
                    "multiplier": 1,
                    "is_captain": False,
                    "is_vice_captain": True,
                },
                {
                    "element": 1,
                    "position": 1,
                    "multiplier": 2,
                    "is_captain": True,
                    "is_vice_captain": False,
                },
            ]
        }

    api.app.dependency_overrides[api.get_entry_picks_fetcher] = lambda: fake_fetch

    body = client.get("/fpl-team/123").json()

    assert body["entry_id"] == 123
    assert body["as_of_gw"] == 4
    assert body["owned_elements"] == [1, 3]
    assert body["picks"][0]["web_name"] == "P1"
    assert body["picks"][0]["position"] == "MID"
    assert body["picks"][0]["team_name"] == "Arsenal"
    assert body["picks"][0]["is_starting"] is True
    assert body["picks"][0]["is_captain"] is True
    assert body["picks"][1]["web_name"] == "P3"
    assert body["picks"][1]["position"] == "DEF"
    assert body["picks"][1]["is_vice_captain"] is True


def test_fpl_team_endpoint_uses_requested_event(client: TestClient) -> None:
    seen = {}

    def fake_fetch(entry_id: int, event: int) -> dict:
        seen["entry_id"] = entry_id
        seen["event"] = event
        return {"picks": []}

    api.app.dependency_overrides[api.get_entry_picks_fetcher] = lambda: fake_fetch

    body = client.get("/fpl-team/123", params={"event": 2}).json()

    assert body["as_of_gw"] == 2
    assert body["owned_elements"] == []
    assert seen == {"entry_id": 123, "event": 2}


def test_form_endpoint_flags_improving_player(client: TestClient) -> None:
    body = client.get("/players/form", params={"window": 2}).json()
    names = [row["web_name"] for row in body]
    assert "P1" in names  # improving player is flagged
    assert "P2" not in names  # declining player has a negative delta
    # Ranked by delta descending, so the strongest riser leads.
    assert body[0]["web_name"] == "P1"


def test_form_endpoint_filters_by_position(client: TestClient) -> None:
    body = client.get("/players/form", params={"window": 2, "position": "MID"}).json()
    assert {row["position"] for row in body} == {"MID"}


def test_form_endpoint_validates_window(client: TestClient) -> None:
    assert client.get("/players/form", params={"window": 0}).status_code == 422


def test_form_includes_point_in_time_value_efficiency(client: TestClient) -> None:
    body = client.get("/players/form", params={"window": 2}).json()
    p1 = next(row for row in body if row["web_name"] == "P1")
    # Price is the window's closing value (50 -> 5.0m), so the ratio is exact.
    assert p1["price"] == pytest.approx(5.0)
    assert p1["window_xgi90_per_million"] == pytest.approx(p1["window_xgi90"] / 5.0)
    assert p1["season_points_per_million"] is not None


def test_form_attaches_upcoming_fixture_difficulty(client: TestClient) -> None:
    # Team 1 maps to the players' team name "T"; two upcoming fixtures past GW4.
    api.app.dependency_overrides[api.get_teams] = lambda: pl.DataFrame(
        {"id": [1, 9], "name": ["T", "Opp"]}
    )
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame(
        {
            "event": [5, 6],
            "team_h": [1, 9],
            "team_a": [9, 1],
            "team_h_difficulty": [2, 5],
            "team_a_difficulty": [5, 3],
        }
    )

    body = client.get("/players/form", params={"window": 2}).json()
    p1 = next(row for row in body if row["web_name"] == "P1")
    # Home difficulty 2 (GW5) and away difficulty 3 (GW6) average to 2.5.
    assert p1["upcoming_fixtures"] == 2
    assert p1["avg_fdr"] == pytest.approx(2.5)
    assert p1["next_fixture_gw"] == 5
    assert p1["next_opponent_name"] == "Opp"
    assert p1["next_was_home"] is True
    assert p1["next_fdr"] == 2


def test_ownership_is_always_current_regardless_of_gameweek(
    client: TestClient,
) -> None:
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {"id": [1], "selected_by_percent": ["15.5"]}
    )

    # The latest view and a historical view both show the same current snapshot.
    latest = client.get("/players/form", params={"window": 2}).json()
    p1 = next(row for row in latest if row["web_name"] == "P1")
    assert p1["current_ownership"] == pytest.approx(15.5)

    historical = client.get("/players/form", params={"window": 2, "as_of_gw": 2}).json()
    p1_past = next(row for row in historical if row["web_name"] == "P1")
    assert p1_past["current_ownership"] == pytest.approx(15.5)


def test_defcon_endpoint_ranks_eligible_and_excludes_keepers(
    client: TestClient,
) -> None:
    body = client.get("/players/defcon", params={"min_hit_rate": 0.5}).json()
    assert len(body) == 1
    row = body[0]
    assert row["web_name"] == "P3"
    assert row["window_defcon_hit_rate"] == pytest.approx(0.75)

    # Keepers are ineligible and never appear, even with no hit-rate floor.
    everyone = client.get("/players/defcon").json()
    assert "P4" not in [r["web_name"] for r in everyone]


def test_defcon_probability_endpoint_ranks_and_excludes_keepers(
    client: TestClient,
) -> None:
    body = client.get("/players/defcon-probability").json()
    names = [row["web_name"] for row in body]
    assert "P4" not in names  # keepers are ineligible
    # P3 hits most often, so leads the probability ranking.
    assert body[0]["web_name"] == "P3"
    assert body[0]["raw_rate"] == pytest.approx(0.75)
    assert 0.0 <= body[0]["prob"] <= 1.0

    # Everyone has four games, so a higher floor returns nothing.
    too_few = client.get("/players/defcon-probability", params={"min_games": 5})
    assert too_few.json() == []


def test_defcon_probability_carries_fixture_and_overlay_context(
    client: TestClient,
) -> None:
    api.app.dependency_overrides[api.get_teams] = lambda: pl.DataFrame(
        {"id": [1, 9], "name": ["T", "Opp"]}
    )
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame(
        {
            "event": [5, 6],
            "team_h": [1, 9],
            "team_a": [9, 1],
            "team_h_difficulty": [2, 4],
            "team_a_difficulty": [4, 3],
        }
    )
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {"id": [3], "selected_by_percent": ["12.0"]}
    )

    body = client.get("/players/defcon-probability").json()
    p3 = next(row for row in body if row["web_name"] == "P3")
    # Team T plays GW5 (home, 2) and GW6 (away, 3) -> two fixtures averaging 2.5.
    assert p3["upcoming_fixtures"] == 2
    assert p3["avg_fdr"] == pytest.approx(2.5)
    assert p3["next_fixture_gw"] == 5
    assert p3["next_opponent_name"] == "Opp"
    assert p3["next_was_home"] is True
    assert p3["next_fdr"] == 2
    assert p3["current_ownership"] == pytest.approx(12.0)


def test_defcon_probability_validation_endpoint_returns_backtest_summary(
    client: TestClient,
) -> None:
    body = client.get(
        "/players/defcon-probability-validation",
        params={"bins": 4},
    ).json()

    assert body["n_predictions"] == 9
    assert body["model_brier"] is not None
    assert body["binary_model_brier"] is not None
    assert body["count_model_brier"] is not None
    assert body["raw_rate_brier"] is not None
    assert body["constant_brier"] is not None
    assert body["model_ece"] is not None
    assert body["binary_model_ece"] is not None
    assert body["count_model_ece"] is not None
    assert body["raw_rate_ece"] is not None
    assert body["model_improvement_vs_raw"] is not None
    assert body["model_improvement_vs_binary"] is not None
    assert body["model_improvement_vs_count"] is not None
    assert body["calibration"]
    assert {"bin", "n", "mean_predicted", "observed_rate", "abs_error"} <= set(
        body["calibration"][0]
    )


def test_defcon_probability_validation_defaults_to_display_minutes_threshold(
    client: TestClient,
) -> None:
    low_minute_history = pl.concat(
        [
            _history(),
            pl.DataFrame(
                [
                    _game(
                        5,
                        round_,
                        defcon_hit=True,
                        position="MID",
                        minutes=1,
                    )
                    for round_ in (1, 2, 3, 4)
                ],
                schema_overrides={"defcon_hit": pl.Boolean},
            ),
        ],
        how="vertical",
    )
    api.app.dependency_overrides[api.get_history] = lambda: low_minute_history

    default_body = client.get("/players/defcon-probability-validation").json()
    low_minute_body = client.get(
        "/players/defcon-probability-validation",
        params={"min_minutes": 1},
    ).json()

    assert default_body["n_predictions"] == 9
    assert low_minute_body["n_predictions"] > default_body["n_predictions"]


def _club_history() -> pl.DataFrame:
    rows = []
    for team, name, fixture, round_, xg, xgc, home_score, away_score in [
        (1, "Arsenal", 1, 1, 1.0, 1.2, 2, 1),
        (1, "Arsenal", 2, 2, 2.0, 0.5, 3, 0),
        (2, "Chelsea", 3, 1, 0.8, 1.8, 1, 2),
        (2, "Chelsea", 4, 2, 0.6, 2.2, 0, 2),
    ]:
        rows.extend(
            [
                {
                    "element": fixture * 10 + 1,
                    "fixture": fixture,
                    "team": team,
                    "team_name": name,
                    "round": round_,
                    "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                    "was_home": True,
                    "team_h_score": home_score,
                    "team_a_score": away_score,
                    "minutes": 90,
                    "expected_goals": xg / 2,
                    "expected_goals_conceded": xgc,
                },
                {
                    "element": fixture * 10 + 2,
                    "fixture": fixture,
                    "team": team,
                    "team_name": name,
                    "round": round_,
                    "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                    "was_home": True,
                    "team_h_score": home_score,
                    "team_a_score": away_score,
                    "minutes": 90,
                    "expected_goals": xg / 2,
                    "expected_goals_conceded": xgc,
                },
            ]
        )
    return pl.DataFrame(rows)


def _club_validation_history() -> pl.DataFrame:
    rows = []
    for round_, team_1_xg, team_1_xgc, team_2_xg, team_2_xgc in [
        (1, 1.0, 1.4, 1.8, 0.7),
        (2, 1.5, 1.1, 1.4, 0.9),
        (3, 2.0, 0.9, 1.1, 1.1),
        (4, 2.4, 0.7, 0.9, 1.3),
        (5, 2.8, 0.6, 0.8, 1.6),
        (6, 3.0, 0.5, 0.7, 1.8),
    ]:
        for team, name, xg, xgc in [
            (1, "Arsenal", team_1_xg, team_1_xgc),
            (2, "Chelsea", team_2_xg, team_2_xgc),
        ]:
            fixture = round_ * 10 + team
            rows.extend(
                [
                    {
                        "element": fixture * 10 + 1,
                        "fixture": fixture,
                        "team": team,
                        "team_name": name,
                        "round": round_,
                        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                        "was_home": True,
                        "team_h_score": 2,
                        "team_a_score": 1,
                        "minutes": 90,
                        "expected_goals": xg / 2,
                        "expected_goals_conceded": xgc,
                    },
                    {
                        "element": fixture * 10 + 2,
                        "fixture": fixture,
                        "team": team,
                        "team_name": name,
                        "round": round_,
                        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                        "was_home": True,
                        "team_h_score": 2,
                        "team_a_score": 1,
                        "minutes": 90,
                        "expected_goals": xg / 2,
                        "expected_goals_conceded": xgc,
                    },
                ]
            )
    return pl.DataFrame(rows)


def _club_validation_fixtures() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "event": [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
            "team_h": [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
            "team_a": [91, 92, 91, 92, 91, 92, 91, 92, 91, 92, 91, 92],
            "team_h_difficulty": [2, 4, 2, 4, 2, 4, 3, 3, 3, 3, 4, 2],
            "team_a_difficulty": [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        }
    )


def test_clubs_form_endpoint_returns_club_context(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_history] = _club_history
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame(
        {
            "event": [3, 3],
            "team_h": [1, 2],
            "team_a": [9, 8],
            "team_h_difficulty": [2, 4],
            "team_a_difficulty": [5, 2],
        }
    )

    body = client.get("/clubs/form", params={"window": 1}).json()
    arsenal = next(row for row in body if row["team_name"] == "Arsenal")

    assert arsenal["window_matches"] == 1
    assert arsenal["season_matches"] == 2
    assert arsenal["window_xg_per_match"] == pytest.approx(2.0)
    assert arsenal["season_xg_per_match"] == pytest.approx(1.5)
    assert arsenal["attack_form"] == pytest.approx(0.5)
    assert arsenal["window_xgc_per_match"] == pytest.approx(0.5)
    assert arsenal["defence_form"] == pytest.approx(0.35)
    assert arsenal["upcoming_fixtures"] == 1
    assert arsenal["avg_fdr"] == pytest.approx(2.0)


def test_clubs_form_validation_endpoint_returns_backtest_summary(
    client: TestClient,
) -> None:
    api.app.dependency_overrides[api.get_history] = _club_validation_history
    api.app.dependency_overrides[api.get_fixtures_data] = _club_validation_fixtures

    body = client.get(
        "/clubs/form-validation",
        params={"window": 1, "fdr_horizon": 1, "min_train_rows": 4},
    ).json()

    assert {row["target"] for row in body} == {
        "future_xg_per_match",
        "future_xgc_per_match",
    }
    attack = next(row for row in body if row["target"] == "future_xg_per_match")
    assert attack["n_predictions"] == 6
    assert attack["fdr_mae"] is not None
    assert attack["fdr_plus_form_mae"] is not None


def _detail_rows() -> pl.DataFrame:
    def r(season: str, element: int, code: int, round_: int, xgi: float, hit) -> dict:
        return {
            "season": season,
            "element": element,
            "code": code,
            "round": round_,
            "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
            "minutes": 90,
            "total_points": 5,
            "value": 60,
            "expected_goals": xgi / 2,
            "expected_assists": xgi / 2,
            "expected_goal_involvements": xgi,
            "defensive_contribution": 12 if hit else 8 if hit is False else None,
            "web_name": "Saka",
            "position": "MID",
            "team_name": "Arsenal",
            "defcon_hit": hit,
        }

    rows = [
        r("2025-26", 7, 500, 1, 0.4, True),
        r("2025-26", 7, 500, 2, 0.6, False),
        # Same player, prior season, different element id - tracked by code.
        r("2024-25", 3, 500, 1, 0.5, None),
        # A different player, must be excluded.
        r("2025-26", 9, 501, 1, 0.1, True),
    ]
    return pl.DataFrame(rows, schema_overrides={"defcon_hit": pl.Boolean})


def test_player_detail_returns_gameweeks_and_cross_season(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows

    body = client.get("/players/7", params={"window": 3}).json()
    assert body["web_name"] == "Saka"
    assert body["code"] == 500
    assert body["rolling_window"] == 3
    assert body["selected_season"] == "2025-26"
    # Current-season gameweeks only (element 7), with rolling fields present.
    assert len(body["gameweeks"]) == 2
    assert body["gameweeks"][-1]["rolling_xgi90"] is not None
    assert body["gameweeks"][0]["defensive_contribution"] == 12
    # Cross-season summary tracks the player by code across both seasons.
    assert {s["season"] for s in body["seasons"]} == {"2024-25", "2025-26"}


def test_player_detail_can_return_prior_season_gameweeks(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows

    body = client.get("/players/7", params={"window": 3, "season": "2024-25"}).json()

    assert body["selected_season"] == "2024-25"
    assert len(body["gameweeks"]) == 1
    assert body["gameweeks"][0]["round"] == 1


def test_player_detail_404_for_unknown_season(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows
    assert client.get("/players/7", params={"season": "2023-24"}).status_code == 404


def test_player_detail_404_for_unknown_element(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows
    assert client.get("/players/999").status_code == 404


def test_player_detail_uses_latest_season_as_current(client: TestClient) -> None:
    def rows() -> pl.DataFrame:
        base = _detail_rows()
        newer = pl.DataFrame(
            [
                {
                    **base.row(0, named=True),
                    "season": "2026-27",
                    "element": 11,
                    "round": 1,
                }
            ],
            schema_overrides={"defcon_hit": pl.Boolean},
        )
        return pl.concat([base, newer], how="vertical_relaxed")

    api.app.dependency_overrides[api.get_all_seasons] = rows

    body = client.get("/players/11").json()

    assert body["selected_season"] == "2026-27"
    assert body["element"] == 11
    assert client.get("/players/7").status_code == 404

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


def _empty_events() -> pl.DataFrame:
    return pl.DataFrame(schema={"deadline_time": pl.String, "is_next": pl.Boolean})


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Default to empty fixture/overlay context so endpoints never touch disk;
    # individual tests override these where the context is under test.
    api.app.dependency_overrides[api.get_history] = _history
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame()
    api.app.dependency_overrides[api.get_teams] = _empty_teams
    api.app.dependency_overrides[api.get_events] = _empty_events
    api.app.dependency_overrides[api.get_current_season] = lambda: "2025-26"
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame()
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_root_reports_latest_gameweek(client: TestClient) -> None:
    body = client.get("/").json()
    assert body["season"] == "2025-26"
    assert body["latest_gw"] == 4
    assert body["data_status"] == "ready"


def test_root_reports_preseason_status(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_history] = pl.DataFrame
    api.app.dependency_overrides[api.get_events] = lambda: pl.DataFrame(
        {
            "deadline_time": ["2026-08-21T17:30:00Z"],
            "is_next": [True],
        }
    )
    api.app.dependency_overrides[api.get_current_season] = lambda: "2026-27"

    body = client.get("/").json()

    assert body == {
        "name": "fpl-analytics-engine",
        "season": "2026-27",
        "latest_gw": 0,
        "data_status": "preseason",
        "next_deadline": "2026-08-21T17:30:00Z",
    }


def test_analytics_return_conflict_before_gw1(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_history] = pl.DataFrame

    response = client.get("/players/form")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Current-season analytics are unavailable until GW1 completes."
    )


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


@pytest.fixture
def current_context_client(client: TestClient) -> TestClient:
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {
            "id": [1, 99],
            "web_name": ["Transferred", "New Signing"],
            "element_type": [3, 4],
            "team": [20, 20],
            "now_cost": [75, 60],
            "selected_by_percent": ["12.5", "1.0"],
        }
    )
    api.app.dependency_overrides[api.get_teams] = lambda: pl.DataFrame(
        {"id": [10, 20, 30], "name": ["T", "New Club", "Opponent"]}
    )
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: pl.DataFrame(
        {
            "id": [1, 2, 3],
            "event": [5, 5, 5],
            "kickoff_time": [
                "2026-09-12T12:00:00Z",
                "2026-09-12T14:00:00Z",
                "2026-09-15T19:00:00Z",
            ],
            "finished": [True, False, False],
            "started": [True, True, None],
            "team_h": [10, 20, 30],
            "team_a": [20, 30, 20],
            "team_h_difficulty": [2, 2, 3],
            "team_a_difficulty": [5, 4, 4],
        }
    )
    return client


def test_current_context_uses_snapshot_club_and_includes_new_signings(
    current_context_client: TestClient,
) -> None:
    response = current_context_client.get("/players/current-context")

    assert response.status_code == 200
    rows = response.json()
    assert [row["element"] for row in rows] == [1, 99]
    assert rows[0] == {
        "element": 1,
        "web_name": "Transferred",
        "position": "MID",
        "team_name": "New Club",
        "price": 7.5,
        "current_ownership": 12.5,
        "upcoming_fixtures": 1,
        "avg_fdr": 4.0,
        "next_fixture_gw": 5,
        "next_opponent_name": "Opponent",
        "next_was_home": False,
        "next_fdr": 4,
    }
    assert rows[1]["next_opponent_name"] == "Opponent"


def test_current_context_does_not_depend_on_history_or_entry_fetching(
    current_context_client: TestClient,
) -> None:
    def forbidden_dependency() -> None:
        pytest.fail("Current context must only read archived snapshots")

    api.app.dependency_overrides[api.get_history] = forbidden_dependency
    api.app.dependency_overrides[api.get_entry_picks_fetcher] = forbidden_dependency

    latest = current_context_client.get("/players/current-context")
    historical = current_context_client.get(
        "/players/current-context", params={"as_of_gw": 1}
    )
    assert latest.status_code == historical.status_code == 200
    assert latest.json() == historical.json()


def test_current_context_preserves_historical_form_fdr(
    current_context_client: TestClient,
) -> None:
    response = current_context_client.get("/players/form", params={"as_of_gw": 2})

    assert response.status_code == 200
    row = next(row for row in response.json() if row["element"] == 1)
    assert row["team_name"] == "T"
    assert row["next_opponent_name"] == "New Club"
    assert row["next_fdr"] == 2
    assert row["price"] == 5.0


@pytest.mark.parametrize("preseason", [False, True])
def test_current_context_handles_preseason_and_completed_season(
    current_context_client: TestClient, preseason: bool
) -> None:
    api.app.dependency_overrides[api.get_history] = pl.DataFrame
    feed = api.app.dependency_overrides[api.get_fixtures_data]()
    feed = feed.with_columns(
        pl.lit(1 if preseason else 38).alias("event"),
        pl.lit(not preseason).alias("finished"),
        pl.lit(not preseason).alias("started"),
    )
    api.app.dependency_overrides[api.get_fixtures_data] = lambda: feed

    response = current_context_client.get("/players/current-context")

    assert response.status_code == 200
    row = response.json()[0]
    assert row["team_name"] == "New Club"
    assert row["next_fixture_gw"] == (1 if preseason else None)
    assert row["next_opponent_name"] == ("T" if preseason else None)
    if not preseason:
        assert row["next_fdr"] is None
        assert row["avg_fdr"] is None


def test_current_context_handles_empty_snapshots(client: TestClient) -> None:
    response = client.get("/players/current-context")

    assert response.status_code == 200
    assert response.json() == []


def test_current_context_handles_missing_fixtures(
    current_context_client: TestClient,
) -> None:
    api.app.dependency_overrides[api.get_fixtures_data] = pl.DataFrame

    response = current_context_client.get("/players/current-context")

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.json()[0]["next_opponent_name"] is None


@pytest.mark.parametrize("teams", [pl.DataFrame(), _empty_teams()])
def test_current_context_preserves_players_without_team_metadata(
    current_context_client: TestClient, teams: pl.DataFrame
) -> None:
    api.app.dependency_overrides[api.get_teams] = lambda: teams

    response = current_context_client.get("/players/current-context")

    assert response.status_code == 200
    rows = response.json()
    assert [row["element"] for row in rows] == [1, 99]
    assert rows[0]["web_name"] == "Transferred"
    assert rows[0]["price"] == 7.5
    assert rows[0]["team_name"] is None
    assert rows[0]["next_opponent_name"] is None
    assert rows[0]["next_fixture_gw"] == 5
    assert rows[0]["next_was_home"] is False


@pytest.mark.parametrize("missing_columns", [False, True])
def test_current_context_preserves_players_with_unknown_metadata(
    current_context_client: TestClient, missing_columns: bool
) -> None:
    players = pl.DataFrame(
        {
            "id": [1],
            "web_name": [None],
            "element_type": [None],
            "team": [None],
            "now_cost": [None],
            "selected_by_percent": [None],
        }
    )
    if missing_columns:
        players = players.select("id")
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: players

    response = current_context_client.get("/players/current-context")

    assert response.status_code == 200
    row = response.json()[0]
    assert row["element"] == 1
    assert all(value is None for key, value in row.items() if key != "element")


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


@pytest.mark.parametrize(
    "path",
    [
        "/players/form",
        "/players/defcon",
        "/players/defcon-probability",
        "/clubs/form",
    ],
)
def test_analytical_endpoints_reject_future_gameweeks(
    client: TestClient, path: str
) -> None:
    response = client.get(path, params={"as_of_gw": 5})

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "as_of_gw 5 is beyond the latest available gameweek (4)."
    )


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
    for round_, arsenal_xg, chelsea_xg, home_score, away_score in [
        (1, 1.0, 1.2, 2, 1),
        (2, 2.0, 0.5, 3, 0),
    ]:
        for team, name, xg, was_home in [
            (1, "Arsenal", arsenal_xg, True),
            (2, "Chelsea", chelsea_xg, False),
        ]:
            for player in [1, 2]:
                rows.append(
                    {
                        "element": round_ * 100 + team * 10 + player,
                        "fixture": round_,
                        "team": team,
                        "team_name": name,
                        "round": round_,
                        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                        "was_home": was_home,
                        "team_h_score": home_score,
                        "team_a_score": away_score,
                        "minutes": 90,
                        "expected_goals": xg / 2,
                    }
                )
    return pl.DataFrame(rows)


def _club_validation_history() -> pl.DataFrame:
    rows = []
    for round_, arsenal_xg, chelsea_xg in [
        (1, 1.0, 1.8),
        (2, 1.5, 1.4),
        (3, 2.0, 1.1),
        (4, 2.4, 0.9),
        (5, 2.8, 0.8),
        (6, 3.0, 0.7),
    ]:
        for team, name, xg, was_home in [
            (1, "Arsenal", arsenal_xg, True),
            (2, "Chelsea", chelsea_xg, False),
        ]:
            for player in [1, 2]:
                rows.append(
                    {
                        "element": round_ * 100 + team * 10 + player,
                        "fixture": round_,
                        "team": team,
                        "team_name": name,
                        "round": round_,
                        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
                        "was_home": was_home,
                        "team_h_score": 2,
                        "team_a_score": 1,
                        "minutes": 90,
                        "expected_goals": xg / 2,
                    }
                )
    return pl.DataFrame(rows)


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

    body = client.get(
        "/clubs/form-validation",
        params={"window": 1, "horizon": 1, "min_train_rows": 4},
    ).json()

    assert {row["target"] for row in body} == {
        "future_xg_per_match",
        "future_xgc_per_match",
    }
    attack = next(row for row in body if row["target"] == "future_xg_per_match")
    assert attack["n_predictions"] == 6
    assert attack["baseline_mae"] is not None
    assert attack["baseline_plus_form_mae"] is not None


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


@pytest.mark.parametrize("rounds", [(26, 27, 28, 29, 30, 30), (26, 28, 30)])
def test_form_and_detail_share_the_comparison_gameweek_window(
    client: TestClient, rounds: tuple[int, ...]
) -> None:
    records = [_game(1, 25, xgi=10.0)]
    records += [_game(1, gw, xgi=0.6) for gw in rounds]
    records += [_game(1, 31, xgi=100.0)]
    history = pl.DataFrame(records).with_columns(
        pl.lit("2025-26").alias("season"),
        pl.lit(500).alias("code"),
    )
    api.app.dependency_overrides[api.get_history] = lambda: history
    api.app.dependency_overrides[api.get_all_seasons] = lambda: history
    params = {"as_of_gw": 30, "window": 5}

    form_response = client.get("/players/form", params={**params, "min_delta": -1000})
    detail_response = client.get("/players/1", params=params)

    assert form_response.status_code == detail_response.status_code == 200
    form_row = form_response.json()[0]
    gameweeks = detail_response.json()["gameweeks"]
    assert all(row["round"] <= 30 for row in gameweeks)
    selected = [row for row in gameweeks if 26 <= row["round"] <= 30]
    comparison_xgi90 = (
        sum(row["expected_goal_involvements"] for row in selected)
        / sum(row["minutes"] for row in selected)
        * 90
    )
    assert len(selected) == form_row["window_games"] == len(rounds)
    assert comparison_xgi90 == pytest.approx(0.6)
    assert form_row["window_xgi90"] == pytest.approx(comparison_xgi90)
    assert form_row["delta_xgi90"] == pytest.approx(
        comparison_xgi90 - form_row["season_xgi90"]
    )
    for row in selected:
        if row["round"] == 30:
            assert row["rolling_xgi90"] == pytest.approx(comparison_xgi90)


def test_player_detail_returns_gameweeks_and_cross_season(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows

    body = client.get("/players/7", params={"window": 3}).json()
    assert body["web_name"] == "Saka"
    assert body["code"] == 500
    assert body["as_of_gw"] == 4
    assert body["rolling_window"] == 3
    assert body["selected_season"] == "2025-26"
    assert body["available_seasons"] == ["2024-25", "2025-26"]
    # Current-season gameweeks only (element 7), with rolling fields present.
    assert len(body["gameweeks"]) == 2
    assert body["gameweeks"][-1]["rolling_xgi90"] is not None
    assert body["gameweeks"][0]["defensive_contribution"] == 12
    # Cross-season summary tracks the player by code across both seasons.
    assert {s["season"] for s in body["seasons"]} == {"2024-25", "2025-26"}


def test_player_detail_scopes_rows_metadata_and_summary_to_gameweek(
    client: TestClient,
) -> None:
    def rows() -> pl.DataFrame:
        records = _detail_rows().to_dicts()
        records[0]["web_name"] = "Early Saka"
        records[0]["team_name"] = "Arsenal"
        records[1]["web_name"] = "Late Saka"
        records[1]["team_name"] = "Chelsea"
        return pl.DataFrame(records, schema_overrides={"defcon_hit": pl.Boolean})

    api.app.dependency_overrides[api.get_all_seasons] = rows

    body = client.get("/players/7", params={"as_of_gw": 1}).json()

    assert body["as_of_gw"] == 1
    assert body["web_name"] == "Early Saka"
    assert body["team_name"] == "Arsenal"
    assert [row["round"] for row in body["gameweeks"]] == [1]
    current_summary = next(
        summary for summary in body["seasons"] if summary["season"] == "2025-26"
    )
    assert current_summary["games"] == 1
    assert current_summary["points"] == 5


def test_player_detail_rejects_future_gameweek(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows

    response = client.get("/players/7", params={"as_of_gw": 5})

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "as_of_gw 5 is beyond the latest available gameweek (4)."
    )


def test_player_detail_can_return_prior_season_gameweeks(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows

    body = client.get("/players/7", params={"window": 3, "season": "2024-25"}).json()

    assert body["selected_season"] == "2024-25"
    assert len(body["gameweeks"]) == 1
    assert body["gameweeks"][0]["round"] == 1
    assert body["available_seasons"] == ["2024-25", "2025-26"]
    assert [summary["season"] for summary in body["seasons"]] == ["2024-25"]


@pytest.fixture
def historical_client(client: TestClient) -> TestClient:
    current = (
        _detail_rows()
        .filter(pl.col("season") == "2025-26")
        .with_columns(pl.lit("2026-27").alias("season"))
    )
    template = _detail_rows().row(0, named=True)
    previous = pl.DataFrame(
        [
            {
                **template,
                "element": 3,
                "round": gw,
                "kickoff_time": "2026-05-24T15:00:00Z" if gw == 38 else None,
                "web_name": "Late Saka" if gw == 38 else "Early Saka",
                "team_name": "Chelsea" if gw == 38 else "Arsenal",
                "expected_goal_involvements": 10.0 if gw == 38 else 0.4,
            }
            for gw in range(1, 39)
        ]
    )
    older = _detail_rows().filter(pl.col("season") == "2024-25")
    archived = pl.concat([older, previous, current], how="vertical_relaxed")
    api.app.dependency_overrides[api.get_current_season] = lambda: "2026-27"
    api.app.dependency_overrides[api.get_history] = lambda: current
    api.app.dependency_overrides[api.get_all_seasons] = lambda: archived
    return client


@pytest.mark.parametrize("cutoff", [None, 38])
def test_historical_player_detail_reaches_gw38(
    historical_client: TestClient, cutoff: int | None
) -> None:
    params: dict[str, str | int] = {"season": "2025-26"}
    if cutoff is not None:
        params["as_of_gw"] = cutoff

    response = historical_client.get("/players/7", params=params)

    assert response.status_code == 200
    body = response.json()
    assert body["as_of_gw"] == 38
    assert body["selected_season"] == "2025-26"
    assert [row["round"] for row in body["gameweeks"]] == list(range(1, 39))
    assert body["web_name"] == "Late Saka"
    assert body["team_name"] == "Chelsea"
    assert [summary["season"] for summary in body["seasons"]] == ["2024-25", "2025-26"]
    assert body["seasons"][-1]["games"] == 38
    assert body["seasons"][-1]["points"] == 190


def test_historical_player_detail_honours_explicit_selected_cutoff(
    historical_client: TestClient,
) -> None:
    response = historical_client.get(
        "/players/7", params={"season": "2025-26", "as_of_gw": 20}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["as_of_gw"] == 20
    assert [row["round"] for row in body["gameweeks"]] == list(range(1, 21))
    assert body["gameweeks"][-1]["rolling_xgi90"] == pytest.approx(0.4)
    assert body["web_name"] == "Early Saka"
    assert body["team_name"] == "Arsenal"
    assert [summary["season"] for summary in body["seasons"]] == ["2024-25", "2025-26"]
    assert body["seasons"][-1]["games"] == 20
    assert body["seasons"][-1]["points"] == 100
    assert body["seasons"][-1]["xgi90"] == pytest.approx(0.4)
    assert body["seasons"][0]["games"] == 1


@pytest.mark.parametrize("season", [None, "2026-27"])
def test_current_player_detail_keeps_live_cutoff(
    historical_client: TestClient, season: str | None
) -> None:
    params = {"season": season} if season else {}

    response = historical_client.get("/players/7", params=params)

    assert response.status_code == 200
    body = response.json()
    assert body["as_of_gw"] == 2
    assert [row["round"] for row in body["gameweeks"]] == [1, 2]
    response = historical_client.get("/players/7", params={**params, "as_of_gw": 3})
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "as_of_gw 3 is beyond the latest available gameweek (2)."
    )


def test_historical_player_detail_rejects_cutoff_beyond_selected_season(
    historical_client: TestClient,
) -> None:
    response = historical_client.get(
        "/players/7", params={"season": "2025-26", "as_of_gw": 39}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "as_of_gw 39 is beyond the latest available gameweek (38)."
    )


def test_historical_cutoff_uses_season_latest_not_players_last_appearance(
    historical_client: TestClient,
) -> None:
    archived = api.app.dependency_overrides[api.get_all_seasons]()
    archived = archived.with_columns(
        pl.when((pl.col("season") == "2025-26") & (pl.col("round") == 38))
        .then(501)
        .otherwise(pl.col("code"))
        .alias("code")
    )
    api.app.dependency_overrides[api.get_all_seasons] = lambda: archived

    response = historical_client.get(
        "/players/7", params={"season": "2025-26", "as_of_gw": 38}
    )

    assert response.status_code == 200
    assert response.json()["as_of_gw"] == 38
    assert response.json()["gameweeks"][-1]["round"] == 37


@pytest.mark.parametrize("code", [500, None])
def test_historical_detail_uses_preseason_identity_snapshot(
    historical_client: TestClient, code: int | None
) -> None:
    archived = api.app.dependency_overrides[api.get_all_seasons]().filter(
        pl.col("season") != "2026-27"
    )
    api.app.dependency_overrides[api.get_all_seasons] = lambda: archived
    api.app.dependency_overrides[api.get_history] = pl.DataFrame
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {"id": [70], "code": [code]}
    )

    response = historical_client.get("/players/70", params={"season": "2025-26"})

    if code is None:
        assert response.status_code == 404
    else:
        assert response.status_code == 200
        assert response.json()["code"] == code
        assert response.json()["element"] == 70
        assert response.json()["as_of_gw"] == 38
    assert historical_client.get("/players/70").status_code == 409
    assert (
        historical_client.get("/players/7", params={"season": "2025-26"}).status_code
        == 404
    )


def test_player_detail_404_for_unknown_season(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows
    assert client.get("/players/7", params={"season": "2023-24"}).status_code == 404


@pytest.mark.parametrize("snapshot_code", [500, None])
def test_player_detail_falls_back_to_snapshot_for_missing_history_code(
    historical_client: TestClient, snapshot_code: int | None
) -> None:
    archived = api.app.dependency_overrides[api.get_all_seasons]().with_columns(
        pl.when(pl.col("season") == "2026-27")
        .then(None)
        .otherwise(pl.col("code"))
        .alias("code")
    )
    api.app.dependency_overrides[api.get_all_seasons] = lambda: archived
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {"id": [7], "code": [snapshot_code]}
    )

    current = historical_client.get("/players/7")
    assert current.status_code == 200
    assert current.json()["code"] == snapshot_code
    assert [row["round"] for row in current.json()["gameweeks"]] == [1, 2]
    assert current.json()["seasons"][-1]["games"] == 2

    previous = historical_client.get("/players/7", params={"season": "2025-26"})
    assert previous.status_code == (200 if snapshot_code is not None else 404)
    if snapshot_code is not None:
        assert previous.json()["seasons"][-1]["games"] == 38
    else:
        assert current.json()["available_seasons"] == ["2026-27"]


def test_historical_detail_resolves_new_player_before_first_live_history_row(
    historical_client: TestClient,
) -> None:
    archived = api.app.dependency_overrides[api.get_all_seasons]().filter(
        ~((pl.col("season") == "2026-27") & (pl.col("element") == 7))
    )
    api.app.dependency_overrides[api.get_all_seasons] = lambda: archived
    api.app.dependency_overrides[api.get_players_snapshot] = lambda: pl.DataFrame(
        {"id": [70], "code": [500]}
    )

    response = historical_client.get("/players/70", params={"season": "2025-26"})

    assert response.status_code == 200
    assert response.json()["element"] == 70
    assert response.json()["as_of_gw"] == 38
    assert historical_client.get("/players/70").status_code == 404


def test_player_detail_404_for_unknown_element(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows
    assert client.get("/players/999").status_code == 404


def test_player_detail_uses_live_season_as_current(client: TestClient) -> None:
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
    api.app.dependency_overrides[api.get_current_season] = lambda: "2026-27"

    body = client.get("/players/11").json()

    assert body["selected_season"] == "2026-27"
    assert body["element"] == 11
    assert client.get("/players/7").status_code == 404

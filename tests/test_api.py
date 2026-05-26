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
) -> dict:
    """Build one enriched per-gameweek history row for tests."""
    return {
        "element": element,
        "round": round_,
        "kickoff_time": f"2025-08-{round_:02d}T15:00:00Z",
        "minutes": 90,
        "total_points": 0,
        "value": 50,
        "expected_goals": 0.0,
        "expected_assists": 0.0,
        "expected_goal_involvements": xgi,
        "expected_goals_conceded": 0.0,
        "web_name": f"P{element}",
        "position": position,
        "team_name": "T",
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
        {"id": [1], "name": ["T"]}
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
        {"id": [1], "name": ["T"]}
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
    assert p3["current_ownership"] == pytest.approx(12.0)


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
    # Current-season gameweeks only (element 7), with rolling fields present.
    assert len(body["gameweeks"]) == 2
    assert body["gameweeks"][-1]["rolling_xgi90"] is not None
    # Cross-season summary tracks the player by code across both seasons.
    assert {s["season"] for s in body["seasons"]} == {"2024-25", "2025-26"}


def test_player_detail_404_for_unknown_element(client: TestClient) -> None:
    api.app.dependency_overrides[api.get_all_seasons] = _detail_rows
    assert client.get("/players/999").status_code == 404

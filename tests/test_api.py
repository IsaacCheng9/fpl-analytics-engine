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


@pytest.fixture
def client() -> Iterator[TestClient]:
    api.app.dependency_overrides[api.get_history] = _history
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

"""Tests for the upcoming-fixture difficulty (FDR) transform."""

import polars as pl

from fpl_analytics_engine import fixtures


def _fixture(event: int | None, home: int, away: int, h_diff: int, a_diff: int) -> dict:
    """Build one fixture record mirroring the FPL fixtures feed."""
    return {
        "event": event,
        "team_h": home,
        "team_a": away,
        "team_h_difficulty": h_diff,
        "team_a_difficulty": a_diff,
    }


def test_team_fixture_difficulty_is_forward_looking() -> None:
    feed = [
        # Already played - must be excluded as of GW2.
        _fixture(1, home=10, away=20, h_diff=2, a_diff=4),
        # Upcoming within the horizon.
        _fixture(3, home=10, away=30, h_diff=3, a_diff=2),
        _fixture(4, home=40, away=10, h_diff=5, a_diff=4),
        # Beyond the horizon - excluded.
        _fixture(9, home=10, away=20, h_diff=1, a_diff=1),
    ]

    table = fixtures.team_fixture_difficulty(feed, as_of_gw=2, horizon=5)
    by_team = {row["team"]: row for row in table.to_dicts()}

    # Team 10 has two upcoming fixtures: home difficulty 3, away difficulty 4.
    assert by_team[10]["n_fixtures"] == 2
    assert by_team[10]["avg_difficulty"] == 3.5
    assert by_team[10]["total_difficulty"] == 7
    # The already-played GW1 fixture does not contribute.
    assert by_team[30]["n_fixtures"] == 1
    assert by_team[30]["avg_difficulty"] == 2.0
    # The GW9 fixture is past the horizon, so team 20 never appears.
    assert 20 not in by_team


def test_team_fixture_difficulty_ranks_easiest_first() -> None:
    feed = [
        _fixture(2, home=10, away=20, h_diff=5, a_diff=2),
        _fixture(2, home=30, away=40, h_diff=4, a_diff=3),
    ]

    table = fixtures.team_fixture_difficulty(feed, as_of_gw=1, horizon=3)

    # Lowest average difficulty first: team 20 (2) before team 40 (3) etc.
    assert table["team"].to_list()[0] == 20
    difficulties = table["avg_difficulty"].to_list()
    assert difficulties == sorted(difficulties)


def test_team_fixture_difficulty_handles_empty_feed() -> None:
    table = fixtures.team_fixture_difficulty([], as_of_gw=1, horizon=5)

    assert table.height == 0
    assert {"team", "n_fixtures", "avg_difficulty", "total_difficulty"} <= set(
        table.columns
    )


def test_team_fixture_difficulty_skips_unscheduled_fixtures() -> None:
    # Fixtures with no assigned gameweek (event is null) must be ignored.
    feed = [
        _fixture(None, home=10, away=20, h_diff=3, a_diff=3),
        _fixture(2, home=10, away=30, h_diff=2, a_diff=4),
    ]

    table = fixtures.team_fixture_difficulty(feed, as_of_gw=1, horizon=5)
    by_team = {row["team"]: row for row in table.to_dicts()}

    assert by_team[10]["n_fixtures"] == 1
    assert isinstance(table, pl.DataFrame)


def _form_row(element: int, team_name: str) -> dict:
    return {"element": element, "web_name": f"P{element}", "team_name": team_name}


def test_attach_team_fdr_joins_by_team_name() -> None:
    form_table = pl.DataFrame([_form_row(1, "Arsenal"), _form_row(2, "Spurs")])
    teams = pl.DataFrame({"id": [10, 20], "name": ["Arsenal", "Spurs"]})
    feed = pl.DataFrame(
        [
            _fixture(2, home=10, away=20, h_diff=2, a_diff=5),
            _fixture(3, home=20, away=10, h_diff=4, a_diff=3),
        ]
    )

    out = fixtures.attach_team_fdr(form_table, feed, teams, as_of_gw=1, horizon=5)
    by_element = {row["element"]: row for row in out.to_dicts()}

    # Arsenal (id 10): home difficulty 2 then away difficulty 3 -> mean 2.5.
    assert by_element[1]["upcoming_fixtures"] == 2
    assert by_element[1]["avg_fdr"] == 2.5
    # Spurs (id 20): away difficulty 5 then home difficulty 4 -> mean 4.5.
    assert by_element[2]["avg_fdr"] == 4.5


def test_attach_team_fdr_nulls_when_no_fixtures() -> None:
    form_table = pl.DataFrame([_form_row(1, "Arsenal")])
    teams = pl.DataFrame({"id": [10], "name": ["Arsenal"]})
    empty = pl.DataFrame(
        schema={
            "event": pl.Int64,
            "team_h": pl.Int64,
            "team_a": pl.Int64,
            "team_h_difficulty": pl.Int64,
            "team_a_difficulty": pl.Int64,
        }
    )

    out = fixtures.attach_team_fdr(form_table, empty, teams, as_of_gw=1, horizon=5)

    assert out["upcoming_fixtures"].to_list() == [None]
    assert out["avg_fdr"].to_list() == [None]

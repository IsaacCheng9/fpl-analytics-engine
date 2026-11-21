"""Tests for the upcoming-fixture difficulty (FDR) transform."""

import polars as pl
import pytest

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
    assert by_team[10]["next_fixture_gw"] == 3
    assert by_team[10]["next_opponent"] == 30
    assert by_team[10]["next_was_home"] is True
    assert by_team[10]["next_fdr"] == 3
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


def test_next_fixture_uses_earliest_kickoff_without_losing_dgw_aggregate() -> None:
    later_easy = {
        **_fixture(2, home=10, away=20, h_diff=2, a_diff=4),
        "id": 102,
        "kickoff_time": "2025-08-20T19:00:00Z",
    }
    earlier_hard = {
        **_fixture(2, home=30, away=10, h_diff=3, a_diff=5),
        "id": 101,
        "kickoff_time": "2025-08-20T12:00:00Z",
    }

    table = fixtures.team_fixture_difficulty(
        [later_easy, earlier_hard], as_of_gw=1, horizon=1
    )
    team = table.filter(pl.col("team") == 10).row(0, named=True)

    assert team["n_fixtures"] == 2
    assert team["avg_difficulty"] == pytest.approx(3.5)
    assert team["total_difficulty"] == 7
    assert team["next_opponent"] == 30
    assert team["next_was_home"] is False
    assert team["next_fdr"] == 5


def test_team_fixture_difficulty_handles_empty_feed() -> None:
    table = fixtures.team_fixture_difficulty([], as_of_gw=1, horizon=5)

    assert table.height == 0
    assert {
        "team",
        "n_fixtures",
        "avg_difficulty",
        "total_difficulty",
        "next_fixture_gw",
        "next_opponent",
        "next_was_home",
        "next_fdr",
    } <= set(table.columns)


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
    assert by_element[1]["next_fixture_gw"] == 2
    assert by_element[1]["next_opponent_name"] == "Spurs"
    assert by_element[1]["next_was_home"] is True
    assert by_element[1]["next_fdr"] == 2
    # Spurs (id 20): away difficulty 5 then home difficulty 4 -> mean 4.5.
    assert by_element[2]["avg_fdr"] == 4.5
    assert by_element[2]["next_opponent_name"] == "Arsenal"
    assert by_element[2]["next_was_home"] is False
    assert by_element[2]["next_fdr"] == 5


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
    assert out["next_opponent_name"].to_list() == [None]
    assert out["next_fdr"].to_list() == [None]


def _scheduled_fixture(event: int | None, **overrides: object) -> dict:
    return {
        **_fixture(event, home=10, away=20, h_diff=2, a_diff=4),
        "id": 1,
        "kickoff_time": "2026-09-12T14:00:00Z",
        "finished": False,
        "started": None,
        **overrides,
    }


@pytest.mark.parametrize(
    "status",
    [
        {"finished": True, "started": True},
        {"finished": True, "started": False},
        {"finished": False, "started": True},
        {"finished": None, "started": None},
    ],
)
def test_current_fixtures_exclude_played_started_or_unknown_status(
    status: dict,
) -> None:
    feed = pl.DataFrame(
        [
            _scheduled_fixture(3, **status),
            _scheduled_fixture(4, id=2, team_a=30, kickoff_time="2026-09-19T14:00:00Z"),
        ]
    )

    table = fixtures.current_team_fixture_difficulty(feed)
    team = table.filter(pl.col("team") == 10).row(0, named=True)

    assert team["next_fixture_gw"] == 4
    assert team["next_opponent"] == 30
    assert team["n_fixtures"] == 1
    assert 20 not in table["team"].to_list()


def test_current_fixtures_select_second_match_in_live_double_gameweek() -> None:
    feed = pl.DataFrame(
        [
            _scheduled_fixture(3, finished=True, started=True),
            _scheduled_fixture(
                3,
                id=2,
                team_h=30,
                team_a=10,
                kickoff_time="2026-09-15T19:00:00Z",
            ),
        ]
    )

    team = (
        fixtures.current_team_fixture_difficulty(feed)
        .filter(pl.col("team") == 10)
        .row(0, named=True)
    )

    assert team["next_fixture_gw"] == 3
    assert team["next_opponent"] == 30
    assert team["next_was_home"] is False
    assert team["next_fdr"] == 4
    assert team["avg_difficulty"] == 4
    assert team["n_fixtures"] == 1


def test_current_next_fixture_is_not_limited_by_aggregate_horizon() -> None:
    feed = pl.DataFrame(
        [
            _scheduled_fixture(3, team_h=30, team_a=40),
            _scheduled_fixture(9, id=2, kickoff_time="2026-10-24T14:00:00Z"),
        ]
    )

    team = (
        fixtures.current_team_fixture_difficulty(feed, horizon=5)
        .filter(pl.col("team") == 10)
        .row(0, named=True)
    )

    assert team["next_fixture_gw"] == 9
    assert team["next_opponent"] == 20
    assert team["n_fixtures"] == 0
    assert team["avg_difficulty"] is None


def test_current_fixtures_use_kickoff_order_for_rearranged_gameweeks() -> None:
    feed = pl.DataFrame(
        [
            _scheduled_fixture(2, kickoff_time="2026-10-20T19:00:00Z"),
            _scheduled_fixture(3, id=3, team_a=30),
            _scheduled_fixture(3, id=2, team_a=40),
            _scheduled_fixture(None, team_a=50),
            _scheduled_fixture(1, team_a=60, kickoff_time=None),
        ]
    )

    team = (
        fixtures.current_team_fixture_difficulty(feed)
        .filter(pl.col("team") == 10)
        .row(0, named=True)
    )

    assert team["next_fixture_gw"] == 3
    assert team["next_opponent"] == 40
    assert team["n_fixtures"] == 2


def test_current_fdr_anchors_to_chronological_gameweek_across_wide_gap() -> None:
    feed = pl.DataFrame(
        [
            _scheduled_fixture(
                2, team_h=30, team_a=40, kickoff_time="2026-12-01T19:00:00Z"
            ),
            *[
                _scheduled_fixture(
                    gw,
                    id=gw,
                    team_h_difficulty=2 if gw == 8 else 5,
                    kickoff_time=f"2026-10-{1 + (gw - 8) * 7:02d}T14:00:00Z",
                )
                for gw in range(8, 13)
            ],
            _scheduled_fixture(13, id=13, kickoff_time="2026-11-05T14:00:00Z"),
        ]
    )

    table = fixtures.current_team_fixture_difficulty(feed, horizon=5)
    team = table.filter(pl.col("team") == 10).row(0, named=True)
    rearranged = table.filter(pl.col("team") == 30).row(0, named=True)

    assert team["next_fixture_gw"] == 8
    assert team["next_fdr"] == 2
    assert team["n_fixtures"] == 5
    assert team["total_difficulty"] == 22
    assert team["avg_difficulty"] == pytest.approx(4.4)
    assert rearranged["next_fixture_gw"] == 2
    assert rearranged["n_fixtures"] == 0
    assert rearranged["avg_difficulty"] is None


@pytest.mark.parametrize(
    "feed",
    [
        pl.DataFrame(),
        pl.DataFrame([_scheduled_fixture(38, finished=True, started=True)]),
        pl.DataFrame([_scheduled_fixture(1, finished=None)]),
        pl.DataFrame([_scheduled_fixture(None, kickoff_time=None)]),
        pl.DataFrame([_fixture(1, home=10, away=20, h_diff=2, a_diff=4)]),
    ],
)
def test_current_fixtures_degrade_safely_without_known_upcoming_matches(
    feed: pl.DataFrame,
) -> None:
    table = fixtures.current_team_fixture_difficulty(feed)

    assert table.is_empty()
    assert "next_opponent" in table.columns


def test_current_fixtures_include_preseason_schedule_without_history() -> None:
    feed = pl.DataFrame([_scheduled_fixture(1)])

    table = fixtures.current_team_fixture_difficulty(feed)

    assert table["next_fixture_gw"].to_list() == [1, 1]


def test_historical_fdr_keeps_finished_matches_after_analytical_cutoff() -> None:
    feed = [_scheduled_fixture(3, finished=True, started=True)]

    table = fixtures.team_fixture_difficulty(feed, as_of_gw=2)

    assert table["next_fixture_gw"].to_list() == [3, 3]


def test_team_upcoming_fixtures_handles_blanks_doubles_and_short_name_fallback() -> (
    None
):
    teams = pl.DataFrame(
        {
            "id": [10, 20, 30, 40],
            "name": ["Arsenal", "Bournemouth", "Man City", "Chelsea"],
            "short_name": ["ARS", None, "MCI", ""],
        }
    )
    feed = pl.DataFrame(
        [
            # Past fixture excluded.
            {
                **_fixture(10, home=10, away=20, h_diff=2, a_diff=4),
                "id": 1,
                "kickoff_time": "2026-10-01T14:00:00Z",
            },
            # GW11 single fixture.
            {
                **_fixture(11, home=10, away=20, h_diff=2, a_diff=5),
                "id": 2,
                "kickoff_time": "2026-10-10T14:00:00Z",
            },
            # GW12 blank for team 10 (only 30 vs 40).
            {
                **_fixture(12, home=30, away=40, h_diff=3, a_diff=4),
                "id": 3,
                "kickoff_time": "2026-10-17T14:00:00Z",
            },
            # GW13 double for team 10 (later kickoff first to verify sorting).
            {
                **_fixture(13, home=10, away=40, h_diff=3, a_diff=4),
                "id": 5,
                "kickoff_time": "2026-10-28T19:45:00Z",
            },
            {
                **_fixture(13, home=30, away=10, h_diff=4, a_diff=5),
                "id": 4,
                "kickoff_time": "2026-10-24T12:30:00Z",
            },
            # GW16 outside horizon (10, 15] excluded.
            {
                **_fixture(16, home=10, away=20, h_diff=1, a_diff=5),
                "id": 6,
                "kickoff_time": "2026-11-14T15:00:00Z",
            },
        ]
    )

    by_team = fixtures.team_upcoming_fixtures(feed, teams, as_of_gw=10, horizon=5)

    assert by_team[10] == [
        {
            "gw": 11,
            "opponent_name": "Bournemouth",
            "opponent_short_name": "BOU",
            "was_home": True,
            "fdr": 2,
        },
        {
            "gw": 13,
            "opponent_name": "Man City",
            "opponent_short_name": "MCI",
            "was_home": False,
            "fdr": 5,
        },
        {
            "gw": 13,
            "opponent_name": "Chelsea",
            "opponent_short_name": "CHE",
            "was_home": True,
            "fdr": 3,
        },
    ]


def test_current_team_upcoming_fixtures_uses_unstarted_window() -> None:
    teams = pl.DataFrame(
        {"id": [10, 20, 30, 40], "name": ["Arsenal", "Spurs", "Chelsea", "Fulham"]}
    )
    feed = pl.DataFrame(
        [
            _scheduled_fixture(11, id=1, finished=True, started=True),
            _scheduled_fixture(
                11,
                id=2,
                team_h=10,
                team_a=30,
                team_h_difficulty=3,
                team_a_difficulty=4,
                kickoff_time="2026-11-21T15:00:00Z",
            ),
            _scheduled_fixture(
                15,
                id=3,
                team_h=40,
                team_a=10,
                team_h_difficulty=4,
                team_a_difficulty=2,
                kickoff_time="2026-12-19T15:00:00Z",
            ),
            # GW16 falls outside [11, 16) and must be excluded.
            _scheduled_fixture(
                16,
                id=4,
                team_h=10,
                team_a=20,
                team_h_difficulty=3,
                team_a_difficulty=4,
                kickoff_time="2026-12-26T15:00:00Z",
            ),
        ]
    )

    by_team = fixtures.current_team_upcoming_fixtures(feed, teams, horizon=5)

    assert by_team[10] == [
        {
            "gw": 11,
            "opponent_name": "Chelsea",
            "opponent_short_name": "CHE",
            "was_home": True,
            "fdr": 3,
        },
        {
            "gw": 15,
            "opponent_name": "Fulham",
            "opponent_short_name": "FUL",
            "was_home": False,
            "fdr": 2,
        },
    ]


def test_attach_team_fdr_includes_next_fixtures_and_empty_default() -> None:
    form_table = pl.DataFrame([_form_row(1, "Arsenal"), _form_row(2, "Everton")])
    teams = pl.DataFrame(
        {
            "id": [10, 20, 30],
            "name": ["Arsenal", "Spurs", "Everton"],
            "short_name": ["ARS", "TOT", "EVE"],
        }
    )
    feed = pl.DataFrame([_fixture(2, home=10, away=20, h_diff=2, a_diff=5)])

    out = fixtures.attach_team_fdr(form_table, feed, teams, as_of_gw=1, horizon=5)
    by_element = {row["element"]: row for row in out.to_dicts()}

    assert by_element[1]["next_fixtures"] == [
        {
            "gw": 2,
            "opponent_name": "Spurs",
            "opponent_short_name": "TOT",
            "was_home": True,
            "fdr": 2,
        }
    ]
    assert by_element[2]["next_fixtures"] == []


def test_current_fixtures_ignore_frames_missing_team_or_fdr_columns() -> None:
    partial = pl.DataFrame(
        {
            "event": [11],
            "kickoff_time": ["2026-11-21T15:00:00Z"],
            "finished": [False],
            "started": [None],
        }
    )
    teams = pl.DataFrame({"id": [10], "name": ["Arsenal"], "short_name": ["ARS"]})

    assert fixtures.current_team_fixture_difficulty(partial).is_empty()
    assert fixtures.current_team_upcoming_fixtures(partial, teams) == {}

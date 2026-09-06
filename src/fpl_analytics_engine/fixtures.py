"""Compute upcoming-fixture difficulty (FDR) from the FPL fixtures feed.

The FPL API rates every fixture's difficulty from each side's perspective:
``team_h_difficulty`` is how hard the fixture is for the home team and
``team_a_difficulty`` for the away team (1 easiest, 5 hardest). This module
reshapes the feed to one row per team per fixture, then summarises the next few
gameweeks so the form views can be read alongside an upcoming-difficulty signal.
"""

import polars as pl

DEFAULT_HORIZON = 5

# Per-team-per-fixture schema, used to build an empty frame when no fixtures
# fall in the window (e.g. asking past the final gameweek).
_FIXTURE_SCHEMA = {
    "team": pl.Int64,
    "opponent": pl.Int64,
    "event": pl.Int64,
    "kickoff_time": pl.String,
    "fixture_order": pl.Int64,
    "was_home": pl.Boolean,
    "difficulty": pl.Int64,
}
_SUMMARY_SCHEMA = {
    "team": pl.Int64,
    "n_fixtures": pl.UInt32,
    "avg_difficulty": pl.Float64,
    "total_difficulty": pl.Int64,
    "next_fixture_gw": pl.Int64,
    "next_opponent": pl.Int64,
    "next_was_home": pl.Boolean,
    "next_fdr": pl.Int64,
}


def _explode_to_team_rows(fixtures: pl.DataFrame) -> pl.DataFrame:
    """Reshape fixtures into one row per team per fixture.

    Args:
        fixtures: Fixture records with home/away team ids and difficulties.

    Returns:
        A long frame keyed by team, carrying the opponent, gameweek, home
        flag, and that team's difficulty rating for the fixture.
    """
    fixture_order = (
        pl.col("id").cast(pl.Int64)
        if "id" in fixtures.columns
        else pl.col("_row_order").cast(pl.Int64)
    )
    kickoff_time = (
        pl.col("kickoff_time").cast(pl.String)
        if "kickoff_time" in fixtures.columns
        else pl.lit(None, dtype=pl.String)
    )
    ordered = fixtures.with_row_index("_row_order")
    home = ordered.select(
        pl.col("team_h").alias("team"),
        pl.col("team_a").alias("opponent"),
        pl.col("event"),
        kickoff_time.alias("kickoff_time"),
        fixture_order.alias("fixture_order"),
        pl.lit(True).alias("was_home"),
        pl.col("team_h_difficulty").alias("difficulty"),
    )
    away = ordered.select(
        pl.col("team_a").alias("team"),
        pl.col("team_h").alias("opponent"),
        pl.col("event"),
        kickoff_time.alias("kickoff_time"),
        fixture_order.alias("fixture_order"),
        pl.lit(False).alias("was_home"),
        pl.col("team_a_difficulty").alias("difficulty"),
    )
    return pl.concat([home, away])


def team_fixture_difficulty(
    fixtures: list[dict], as_of_gw: int, horizon: int = DEFAULT_HORIZON
) -> pl.DataFrame:
    """Summarise each team's fixture difficulty over the next ``horizon`` GWs.

    Strictly forward-looking from ``as_of_gw``: only fixtures in gameweeks
    ``(as_of_gw, as_of_gw + horizon]`` count, so the result is the upcoming-run
    view as it would have looked at that point in the season.

    Args:
        fixtures: Raw fixture records from the FPL fixtures endpoint.
        as_of_gw: The gameweek the view is anchored at; fixtures up to and
            including it are excluded as already played.
        horizon: Number of upcoming gameweeks to include.

    Returns:
        One row per team with the count of upcoming fixtures, their mean and
        total difficulty, and the first upcoming fixture in the window. Empty
        when no fixtures fall in the window.
    """
    if not fixtures:
        return pl.DataFrame(schema=_SUMMARY_SCHEMA)

    scheduled = pl.DataFrame(fixtures).filter(
        pl.col("event").is_not_null(),
        pl.col("event") > as_of_gw,
        pl.col("event") <= as_of_gw + horizon,
    )
    upcoming = _explode_to_team_rows(scheduled)
    summary = upcoming.group_by("team").agg(
        pl.len().alias("n_fixtures"),
        pl.col("difficulty").mean().alias("avg_difficulty"),
        pl.col("difficulty").sum().alias("total_difficulty"),
    )
    next_fixture = (
        upcoming.sort(
            "team",
            "event",
            "kickoff_time",
            "fixture_order",
            "opponent",
            nulls_last=True,
        )
        .group_by("team", maintain_order=True)
        .agg(
            pl.col("event").first().alias("next_fixture_gw"),
            pl.col("opponent").first().alias("next_opponent"),
            pl.col("was_home").first().alias("next_was_home"),
            pl.col("difficulty").first().alias("next_fdr"),
        )
    )
    return summary.join(next_fixture, on="team", how="left").sort(
        "avg_difficulty", "team"
    )


def current_team_fixture_difficulty(
    fixtures: pl.DataFrame, horizon: int = DEFAULT_HORIZON
) -> pl.DataFrame:
    """Summarise scheduled, unstarted fixtures from the current snapshot.

    Use kickoff order for the next fixture, independently of the FDR horizon
    and analytical history. Start the aggregate gameweek range at the gameweek
    of the earliest scheduled, unstarted kickoff anywhere in the snapshot.
    Exclude gameweeks outside that range, including rearranged earlier rounds.
    Require an assigned gameweek and kickoff so postponements without a
    schedule cannot be next.
    Null ``started`` is normal for future FPL fixtures; unknown ``finished``
    or missing status columns cannot establish that a fixture is unplayed.

    Args:
        fixtures: Current archived fixture records, including status flags.
        horizon: Number of gameweeks to include in the difficulty aggregate.

    Returns:
        One row per team with a scheduled, unstarted fixture. The next fixture
        can lie outside the aggregate window. Empty if none are known.
    """
    required = {"event", "kickoff_time", "finished", "started"}
    if fixtures.is_empty() or not required.issubset(fixtures.columns):
        return pl.DataFrame(schema=_SUMMARY_SCHEMA)

    scheduled = fixtures.filter(
        pl.col("event").is_not_null(),
        pl.col("kickoff_time").is_not_null(),
        ~pl.col("finished").fill_null(True),
        ~pl.col("started").fill_null(False),
    )
    if scheduled.is_empty():
        return pl.DataFrame(schema=_SUMMARY_SCHEMA)

    upcoming = _explode_to_team_rows(scheduled)
    first_gw = upcoming.sort("kickoff_time", "fixture_order", "team")["event"][0]
    summary = (
        upcoming.filter(
            pl.col("event").is_between(first_gw, first_gw + horizon, closed="left")
        )
        .group_by("team")
        .agg(
            pl.len().alias("n_fixtures"),
            pl.col("difficulty").mean().alias("avg_difficulty"),
            pl.col("difficulty").sum().alias("total_difficulty"),
        )
    )
    next_fixture = (
        upcoming.sort("team", "kickoff_time", "fixture_order", "opponent")
        .group_by("team", maintain_order=True)
        .agg(
            pl.col("event").first().alias("next_fixture_gw"),
            pl.col("opponent").first().alias("next_opponent"),
            pl.col("was_home").first().alias("next_was_home"),
            pl.col("difficulty").first().alias("next_fdr"),
        )
    )
    return next_fixture.join(summary, on="team", how="left").with_columns(
        pl.col("n_fixtures").fill_null(0),
        pl.col("total_difficulty").fill_null(0),
    )


def attach_team_fdr(
    form_table: pl.DataFrame,
    fixtures: pl.DataFrame,
    teams: pl.DataFrame,
    as_of_gw: int,
    horizon: int = DEFAULT_HORIZON,
) -> pl.DataFrame:
    """Attach each player's upcoming-fixture difficulty to a form table.

    Join the per-team summary onto the form table by team name (the bridge from
    fixture team ids to names comes from ``teams``), so each player row gains the
    count and mean difficulty of their team's next ``horizon`` gameweeks. Players
    whose team has no upcoming fixtures in the window get null context.

    Args:
        form_table: Output of
            :func:`fpl_analytics_engine.form.compute_form_table`.
        fixtures: Archived fixtures (the FPL fixtures feed).
        teams: Team metadata with ``id`` and ``name`` columns.
        as_of_gw: The gameweek the view is anchored at.
        horizon: Number of upcoming gameweeks to summarise.

    Returns:
        The form table with ``upcoming_fixtures`` and ``avg_fdr`` columns.
    """
    fdr = team_fixture_difficulty(fixtures.to_dicts(), as_of_gw, horizon)
    team_names = teams.select(
        pl.col("id").alias("team"), pl.col("name").alias("team_name")
    )
    opponent_names = teams.select(
        pl.col("id").alias("next_opponent"),
        pl.col("name").alias("next_opponent_name"),
    )
    named = (
        fdr.join(team_names, on="team", how="left")
        .join(opponent_names, on="next_opponent", how="left")
        .select(
            "team_name",
            pl.col("n_fixtures").alias("upcoming_fixtures"),
            pl.col("avg_difficulty").alias("avg_fdr"),
            "next_fixture_gw",
            "next_opponent_name",
            "next_was_home",
            "next_fdr",
        )
    )
    return form_table.join(named, on="team_name", how="left")

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
_TEAM_LABEL_SCHEMA = {
    "id": pl.Int64,
    "name": pl.String,
    "short_name": pl.String,
}
UPCOMING_FIXTURE_DTYPE = pl.List(
    pl.Struct(
        {
            "gw": pl.Int64,
            "opponent_name": pl.String,
            "opponent_short_name": pl.String,
            "was_home": pl.Boolean,
            "fdr": pl.Int64,
        }
    )
)
_UPCOMING_FRAME_SCHEMA = {
    "team": pl.Int64,
    "next_fixtures": UPCOMING_FIXTURE_DTYPE,
}


def team_labels(teams: pl.DataFrame) -> pl.DataFrame:
    """Normalise team ids, names, and three-letter short names.

    Fall back to the first three uppercased letters of ``name`` when
    ``short_name`` is absent, null, or blank (e.g. in synthetic test frames).

    Args:
        teams: Team metadata containing at least ``id`` and ``name`` columns.

    Returns:
        A frame with ``id``, ``name``, and ``short_name`` columns for every
        team with a valid id and non-empty name.
    """
    if teams.is_empty() or not {"id", "name"}.issubset(teams.columns):
        return pl.DataFrame(schema=_TEAM_LABEL_SCHEMA)

    short_col = (
        pl.col("short_name").cast(pl.String).str.strip_chars()
        if "short_name" in teams.columns
        else pl.lit(None, dtype=pl.String)
    )
    name_clean = pl.col("name").cast(pl.String).str.strip_chars()
    fallback_short = name_clean.str.slice(0, 3).str.to_uppercase()
    return (
        teams.select(
            pl.col("id").cast(pl.Int64).alias("id"),
            name_clean.alias("name"),
            pl.when(short_col.is_not_null() & (short_col != ""))
            .then(short_col)
            .otherwise(fallback_short)
            .alias("short_name"),
        )
        .filter(
            pl.col("id").is_not_null(),
            pl.col("name").is_not_null(),
            pl.col("name") != "",
        )
        .unique(subset=["id"], keep="first")
    )


def _upcoming_fixtures_map(
    upcoming: pl.DataFrame, teams: pl.DataFrame
) -> dict[int, list[dict]]:
    """Group exploded upcoming rows into ordered per-team fixture lists."""
    labels = team_labels(teams)
    if upcoming.is_empty() or labels.is_empty():
        return {}

    opponents = labels.select(
        pl.col("id").alias("opponent"),
        pl.col("name").alias("opponent_name"),
        pl.col("short_name").alias("opponent_short_name"),
    )
    resolved = (
        upcoming.with_columns(
            pl.col("team").cast(pl.Int64),
            pl.col("opponent").cast(pl.Int64),
            pl.col("event").cast(pl.Int64),
            pl.col("difficulty").cast(pl.Int64),
        )
        .join(opponents, on="opponent", how="inner")
        .filter(
            pl.col("team").is_not_null(),
            pl.col("event").is_not_null(),
            pl.col("was_home").is_not_null(),
            pl.col("difficulty").is_not_null(),
        )
        .sort(
            "team",
            "event",
            "kickoff_time",
            "fixture_order",
            "opponent",
            nulls_last=True,
        )
    )
    by_team: dict[int, list[dict]] = {}
    for row in resolved.select(
        "team",
        "event",
        "opponent_name",
        "opponent_short_name",
        "was_home",
        "difficulty",
    ).to_dicts():
        by_team.setdefault(row["team"], []).append(
            {
                "gw": row["event"],
                "opponent_name": row["opponent_name"],
                "opponent_short_name": row["opponent_short_name"],
                "was_home": row["was_home"],
                "fdr": row["difficulty"],
            }
        )
    return by_team


def upcoming_fixtures_frame(fixtures_by_team: dict[int, list[dict]]) -> pl.DataFrame:
    """Convert a per-team upcoming-fixtures mapping into a Polars frame."""
    if not fixtures_by_team:
        return pl.DataFrame(schema=_UPCOMING_FRAME_SCHEMA)
    rows = [
        {"team": team_id, "next_fixtures": items}
        for team_id, items in fixtures_by_team.items()
    ]
    return pl.DataFrame(rows, schema=_UPCOMING_FRAME_SCHEMA)


def _filter_current_unstarted(fixtures: pl.DataFrame) -> pl.DataFrame:
    """Return scheduled, unstarted fixture rows from the current snapshot."""
    required = {
        "event",
        "kickoff_time",
        "finished",
        "started",
        "team_h",
        "team_a",
        "team_h_difficulty",
        "team_a_difficulty",
    }
    if fixtures.is_empty() or not required.issubset(fixtures.columns):
        return pl.DataFrame()
    return fixtures.filter(
        pl.col("event").is_not_null(),
        pl.col("kickoff_time").is_not_null(),
        ~pl.col("finished").fill_null(True),
        ~pl.col("started").fill_null(False),
    )


def team_upcoming_fixtures(
    fixtures: pl.DataFrame,
    teams: pl.DataFrame,
    as_of_gw: int,
    horizon: int = DEFAULT_HORIZON,
) -> dict[int, list[dict]]:
    """Build point-in-time upcoming fixtures for the next ``horizon`` GWs.

    Only fixtures in ``(as_of_gw, as_of_gw + horizon]`` are included.

    Args:
        fixtures: Archived fixture records.
        teams: Team metadata with ``id``, ``name``, and optional
            ``short_name``.
        as_of_gw: Point-in-time cutoff gameweek.
        horizon: Number of upcoming gameweeks to include.

    Returns:
        Mapping from team id to ordered upcoming fixture dictionaries.
    """
    required = {"event", "team_h", "team_a", "team_h_difficulty", "team_a_difficulty"}
    if fixtures.is_empty() or not required.issubset(fixtures.columns):
        return {}

    scheduled = fixtures.filter(
        pl.col("event").is_not_null(),
        pl.col("event") > as_of_gw,
        pl.col("event") <= as_of_gw + horizon,
    )
    if scheduled.is_empty():
        return {}
    return _upcoming_fixtures_map(_explode_to_team_rows(scheduled), teams)


def current_team_upcoming_fixtures(
    fixtures: pl.DataFrame,
    teams: pl.DataFrame,
    horizon: int = DEFAULT_HORIZON,
) -> dict[int, list[dict]]:
    """Build current unstarted fixtures for the next ``horizon`` GWs.

    Only fixtures in ``[first_gw, first_gw + horizon)`` are included.

    Args:
        fixtures: Current archived fixture records, including status flags.
        teams: Team metadata with ``id``, ``name``, and optional
            ``short_name``.
        horizon: Number of upcoming gameweeks to include.

    Returns:
        Mapping from team id to ordered upcoming fixture dictionaries.
    """
    scheduled = _filter_current_unstarted(fixtures)
    if scheduled.is_empty():
        return {}
    upcoming = _explode_to_team_rows(scheduled)
    first_gw = upcoming.sort("kickoff_time", "fixture_order", "team")["event"][0]
    in_window = upcoming.filter(
        pl.col("event").is_between(first_gw, first_gw + horizon, closed="left")
    )
    return _upcoming_fixtures_map(in_window, teams)


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
    scheduled = _filter_current_unstarted(fixtures)
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
    upcoming = upcoming_fixtures_frame(
        team_upcoming_fixtures(fixtures, teams, as_of_gw, horizon)
    )
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
        .join(upcoming, on="team", how="left")
        .select(
            "team_name",
            pl.col("n_fixtures").alias("upcoming_fixtures"),
            pl.col("avg_difficulty").alias("avg_fdr"),
            "next_fixture_gw",
            "next_opponent_name",
            "next_was_home",
            "next_fdr",
            "next_fixtures",
        )
    )
    return form_table.join(named, on="team_name", how="left").with_columns(
        pl.col("next_fixtures").fill_null(pl.lit([], dtype=UPCOMING_FIXTURE_DTYPE))
    )

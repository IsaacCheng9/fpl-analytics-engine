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
    "was_home": pl.Boolean,
    "difficulty": pl.Int64,
}


def _explode_to_team_rows(fixtures: pl.DataFrame) -> pl.DataFrame:
    """Reshape fixtures into one row per team per fixture.

    Args:
        fixtures: Fixture records with home/away team ids and difficulties.

    Returns:
        A long frame keyed by team, carrying the opponent, gameweek, home
        flag, and that team's difficulty rating for the fixture.
    """
    home = fixtures.select(
        pl.col("team_h").alias("team"),
        pl.col("team_a").alias("opponent"),
        pl.col("event"),
        pl.lit(True).alias("was_home"),
        pl.col("team_h_difficulty").alias("difficulty"),
    )
    away = fixtures.select(
        pl.col("team_a").alias("team"),
        pl.col("team_h").alias("opponent"),
        pl.col("event"),
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
        One row per team with the count of upcoming fixtures and their mean and
        total difficulty, sorted easiest run first. Empty when no fixtures fall
        in the window.
    """
    if not fixtures:
        return pl.DataFrame(schema=_FIXTURE_SCHEMA).select(
            pl.col("team"),
            pl.lit(0, dtype=pl.UInt32).alias("n_fixtures"),
            pl.lit(None, dtype=pl.Float64).alias("avg_difficulty"),
            pl.lit(None, dtype=pl.Int64).alias("total_difficulty"),
        )

    scheduled = pl.DataFrame(fixtures).filter(
        pl.col("event").is_not_null(),
        pl.col("event") > as_of_gw,
        pl.col("event") <= as_of_gw + horizon,
    )
    return (
        _explode_to_team_rows(scheduled)
        .group_by("team")
        .agg(
            pl.len().alias("n_fixtures"),
            pl.col("difficulty").mean().alias("avg_difficulty"),
            pl.col("difficulty").sum().alias("total_difficulty"),
        )
        .sort("avg_difficulty", "team")
    )

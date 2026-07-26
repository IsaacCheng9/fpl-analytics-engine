"""Load and enrich archived FPL season data for analysis."""

from pathlib import Path

import polars as pl

from fpl_analytics_engine.domain import DEFCON_THRESHOLDS, ELEMENT_TYPE_TO_POSITION

# Expected-stat columns arrive from the FPL API as strings and need casting.
EXPECTED_STAT_COLUMNS = [
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "expected_goals_conceded",
]


def season_sort_key(season: str) -> tuple[int, int]:
    """Return a sortable key for a season label such as ``2025-26``.

    Args:
        season: Season label in ``YYYY-YY`` form.

    Returns:
        A tuple ordered by the season start and end years.

    Raises:
        ValueError: If the season label is not in the expected form.
    """
    start, end = season.split("-", maxsplit=1)
    if len(start) != 4 or len(end) != 2:
        raise ValueError(f"Invalid season label: {season}")
    start_year = int(start)
    end_year = int(f"{start[:2]}{end}")
    if end_year < start_year:
        end_year += 100
    return start_year, end_year


def latest_enriched_season(data_root: Path) -> str:
    """Return the latest season with an ``enriched.parquet`` snapshot.

    Args:
        data_root: Root directory holding per-season folders.

    Returns:
        The latest season label by chronological order.

    Raises:
        FileNotFoundError: If no enriched season snapshots exist.
    """
    seasons = [path.parent.name for path in data_root.glob("*/enriched.parquet")]
    if not seasons:
        raise FileNotFoundError(f"No enriched season snapshots found under {data_root}")
    return max(seasons, key=season_sort_key)


def latest_archived_season(data_root: Path) -> str:
    """Return the latest season with a raw live archive.

    Args:
        data_root: Root directory holding per-season folders.

    Returns:
        The latest season label by chronological order. Empty preseason history
        still counts as a live archive because its player, team, event and
        fixture snapshots define the current season. Falls back to the latest
        enriched snapshot when no raw live archive exists.
    """
    seasons = [
        path.parent.name for path in data_root.glob("*/player_gw_history.parquet")
    ]
    if seasons:
        return max(seasons, key=season_sort_key)
    return latest_enriched_season(data_root)


def load_player_history(data_dir: Path) -> pl.DataFrame:
    """Read the per-gameweek player history snapshot.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The raw per-gameweek history (expected stats still string-typed).
    """
    return pl.read_parquet(data_dir / "player_gw_history.parquet")


def load_players(data_dir: Path) -> pl.DataFrame:
    """Read the player metadata snapshot.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The bootstrap player records.
    """
    return pl.read_parquet(data_dir / "players.parquet")


def load_teams(data_dir: Path) -> pl.DataFrame:
    """Read the team metadata snapshot.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The bootstrap team records.
    """
    return pl.read_parquet(data_dir / "teams.parquet")


def load_events(data_dir: Path) -> pl.DataFrame:
    """Read the gameweek metadata snapshot.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The bootstrap event records.
    """
    return pl.read_parquet(data_dir / "events.parquet")


# Minimal fixtures schema, used when no fixtures have been archived yet.
_FIXTURES_SCHEMA = {
    "event": pl.Int64,
    "team_h": pl.Int64,
    "team_a": pl.Int64,
    "team_h_difficulty": pl.Int64,
    "team_a_difficulty": pl.Int64,
}


def load_fixtures(data_dir: Path) -> pl.DataFrame:
    """Read the archived fixtures, or an empty frame if none are archived yet.

    Snapshots taken before fixtures were captured (or an early-season cold
    start) have no ``fixtures.parquet``; returning an empty, correctly-typed
    frame lets the FDR path degrade gracefully rather than error.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The fixture records, or an empty frame with the fixtures schema.
    """
    path = data_dir / "fixtures.parquet"
    if not path.exists():
        return pl.DataFrame(schema=_FIXTURES_SCHEMA)
    return pl.read_parquet(path)


def enrich_history(
    history: pl.DataFrame,
    players: pl.DataFrame,
    teams: pl.DataFrame,
    fixtures: pl.DataFrame,
) -> pl.DataFrame:
    """Cast expected stats and attach player, position and DefCon metadata.

    Args:
        history: Raw per-gameweek history from the snapshot.
        players: Bootstrap player records (id, code, web_name, element_type).
        teams: Bootstrap team records (id, name).
        fixtures: Fixture records (id, team_h, team_a).

    Returns:
        The history with float expected stats, web_name, position, team_name
        and a per-gameweek ``defcon_hit`` flag (null for ineligible positions).
    """
    player_meta = players.select("id", "code", "web_name", "element_type")
    team_meta = teams.select(
        pl.col("id").alias("team"), pl.col("name").alias("team_name")
    )
    fixture_meta = fixtures.select(
        pl.col("id").alias("fixture"),
        "team_h",
        "team_a",
    )
    enriched = (
        history.with_columns(
            [pl.col(c).cast(pl.Float64) for c in EXPECTED_STAT_COLUMNS]
        )
        .join(fixture_meta, on="fixture", how="left", validate="m:1")
        .with_columns(
            pl.when(pl.col("was_home"))
            .then(pl.col("team_h"))
            .otherwise(pl.col("team_a"))
            .alias("team")
        )
        .join(player_meta, left_on="element", right_on="id", how="left")
        .join(team_meta, on="team", how="left")
        .with_columns(
            pl.col("element_type")
            .replace_strict(ELEMENT_TYPE_TO_POSITION, default=None)
            .alias("position")
        )
        .with_columns(
            pl.col("position")
            .replace_strict(DEFCON_THRESHOLDS, default=None, return_dtype=pl.Int64)
            .alias("defcon_threshold")
        )
        .with_columns(
            (pl.col("defensive_contribution") >= pl.col("defcon_threshold")).alias(
                "defcon_hit"
            )
        )
    )
    missing_teams = enriched.filter(
        pl.col("team").is_null() | pl.col("team_name").is_null()
    ).height
    if missing_teams:
        raise ValueError(
            f"Could not derive fixture-time team for {missing_teams} history rows"
        )
    return enriched


def prepare_history(data_dir: Path) -> pl.DataFrame:
    """Load and enrich the archived season in one step.

    Args:
        data_dir: Directory holding the archived Parquet files.

    Returns:
        The enriched per-gameweek history ready for form analysis.
    """
    return enrich_history(
        load_player_history(data_dir),
        load_players(data_dir),
        load_teams(data_dir),
        load_fixtures(data_dir),
    )


def load_enriched(data_dir: Path) -> pl.DataFrame:
    """Read a pre-archived enriched season snapshot.

    Args:
        data_dir: Season directory holding an ``enriched.parquet`` (e.g. a
            backfilled historical season).

    Returns:
        The enriched per-gameweek history for that season.
    """
    return pl.read_parquet(data_dir / "enriched.parquet")


def load_all_seasons(data_root: Path) -> pl.DataFrame:
    """Load every archived season's enriched snapshot into one frame.

    Each season folder under ``data_root`` is expected to hold an
    ``enriched.parquet`` carrying a ``season`` label and stable player ``code``.
    Current-season snapshots may retain additional fixture context used by
    live analytics, so frames are concatenated by their shared column names.

    Args:
        data_root: Root directory holding per-season folders.

    Returns:
        The per-gameweek history concatenated across seasons, or an empty frame
        if no seasons are archived.
    """
    frames = []
    for path in sorted(data_root.glob("*/enriched.parquet")):
        frame = pl.read_parquet(path)
        if "season" not in frame.columns:
            frame = frame.with_columns(pl.lit(path.parent.name).alias("season"))
        frames.append(frame)
    if not frames:
        return pl.DataFrame()
    return pl.concat(frames, how="diagonal_relaxed")

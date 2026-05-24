"""Load and enrich archived FPL season data for analysis."""

from pathlib import Path

import polars as pl

# Expected-stat columns arrive from the FPL API as strings and need casting.
EXPECTED_STAT_COLUMNS = [
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "expected_goals_conceded",
]
POSITIONS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD", 5: "MNG"}
# Defensive-contribution points threshold per position (GK and managers are
# ineligible). Defenders need 10+ CBIT; midfielders and forwards need 12+ CBIRT.
# The API's defensive_contribution field already holds the positional count.
DEFCON_THRESHOLDS = {"DEF": 10, "MID": 12, "FWD": 12}


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


def enrich_history(
    history: pl.DataFrame, players: pl.DataFrame, teams: pl.DataFrame
) -> pl.DataFrame:
    """Cast expected stats and attach player, position and DefCon metadata.

    Args:
        history: Raw per-gameweek history from the snapshot.
        players: Bootstrap player records (id, web_name, element_type, team).
        teams: Bootstrap team records (id, name).

    Returns:
        The history with float expected stats, web_name, position, team_name
        and a per-gameweek ``defcon_hit`` flag (null for ineligible positions).
    """
    player_meta = players.select("id", "web_name", "element_type", "team")
    team_meta = teams.select(
        pl.col("id").alias("team"), pl.col("name").alias("team_name")
    )
    return (
        history.with_columns(
            [pl.col(c).cast(pl.Float64) for c in EXPECTED_STAT_COLUMNS]
        )
        .join(player_meta, left_on="element", right_on="id", how="left")
        .join(team_meta, on="team", how="left")
        .with_columns(
            pl.col("element_type")
            .replace_strict(POSITIONS, default=None)
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
    )

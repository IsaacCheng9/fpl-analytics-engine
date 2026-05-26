"""Backfill historical season data from the vaastav archive for comparison.

Only seasons from 2022-23 carry expected stats (xG/xA/xGI/xGC), and
defensive-contribution data does not exist before 2025-26, so the DefCon
columns are written null. The adapter maps vaastav's merged per-gameweek CSV
into the same enriched schema the analytics layer consumes, so the same
form functions work across seasons.
"""

import io
from pathlib import Path

import polars as pl
import requests

from fpl_analytics_engine import data

VAASTAV_URL = (
    "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/"
    "master/data/{season}/gws/merged_gw.csv"
)
# Maps the season's element id to the stable player code and FPL web_name, so
# historical seasons can be matched to the current one by code (element ids are
# reassigned each season and merged_gw only carries a full name, not web_name).
VAASTAV_PLAYERS_URL = (
    "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/"
    "master/data/{season}/players_raw.csv"
)
# Seasons with expected stats; earlier seasons lack them and are not useful here.
SEASONS = ["2022-23", "2023-24", "2024-25"]
CURRENT_SEASON = "2025-26"
REQUEST_TIMEOUT_SECONDS = 30
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; fpl-analytics-engine/0.1)"}

# vaastav labels keepers GKP; align with the project's position vocabulary.
VAASTAV_POSITION_MAP = {
    "GKP": "GK",
    "GK": "GK",
    "DEF": "DEF",
    "MID": "MID",
    "FWD": "FWD",
    "MNG": "MNG",
}
POSITION_DTYPE = pl.Enum(["GK", "DEF", "MID", "FWD", "MNG"])
CANONICAL_COLUMNS = [
    "element",
    "code",
    "round",
    "kickoff_time",
    "minutes",
    "total_points",
    "value",
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "expected_goals_conceded",
    "web_name",
    "position",
    "team_name",
    "defcon_hit",
    "defcon_threshold",
    "defensive_contribution",
    "season",
]


def adapt_vaastav_season(
    raw: pl.DataFrame, players_raw: pl.DataFrame, season: str
) -> pl.DataFrame:
    """Map a vaastav merged-gameweek frame to the enriched schema.

    Args:
        raw: The raw ``merged_gw.csv`` contents for one season.
        players_raw: The season's ``players_raw.csv``, providing the stable
            ``code`` and FPL ``web_name`` for each element id.
        season: Season label (e.g. '2024-25') to stamp on every row.

    Returns:
        An enriched per-gameweek frame with null DefCon columns, keyed by the
        stable player code and the FPL web_name.
    """
    player_meta = players_raw.select(
        pl.col("id").cast(pl.Int64).alias("element"),
        pl.col("code").cast(pl.Int64),
        pl.col("web_name").cast(pl.String),
    )
    return (
        raw.select(
            pl.col("element").cast(pl.Int64),
            pl.col("round").cast(pl.Int64),
            pl.col("kickoff_time").cast(pl.String),
            pl.col("minutes").cast(pl.Int64),
            pl.col("total_points").cast(pl.Int64),
            pl.col("value").cast(pl.Int64),
            pl.col("expected_goals").cast(pl.Float64),
            pl.col("expected_assists").cast(pl.Float64),
            pl.col("expected_goal_involvements").cast(pl.Float64),
            pl.col("expected_goals_conceded").cast(pl.Float64),
            pl.col("position")
            .replace_strict(VAASTAV_POSITION_MAP, default=None)
            .cast(POSITION_DTYPE)
            .alias("position"),
            pl.col("team").cast(pl.String).alias("team_name"),
        )
        # Stable code and FPL web_name come from players_raw, not merged_gw
        # (whose `name` is the full name and does not match the current season).
        .join(player_meta, on="element", how="left")
        .with_columns(
            pl.lit(None, dtype=pl.Boolean).alias("defcon_hit"),
            pl.lit(None, dtype=pl.Int64).alias("defcon_threshold"),
            pl.lit(None, dtype=pl.Int64).alias("defensive_contribution"),
            pl.lit(season).alias("season"),
        )
        .select(CANONICAL_COLUMNS)
    )


def _fetch_csv(url: str) -> pl.DataFrame:
    """Download and parse a CSV from the vaastav archive."""
    response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return pl.read_csv(
        io.BytesIO(response.content), encoding="utf8-lossy", infer_schema_length=None
    )


def fetch_vaastav_season(season: str) -> pl.DataFrame:
    """Download one season's merged-gameweek CSV from the vaastav archive."""
    return _fetch_csv(VAASTAV_URL.format(season=season))


def fetch_vaastav_players(season: str) -> pl.DataFrame:
    """Download one season's ``players_raw.csv`` from the vaastav archive."""
    return _fetch_csv(VAASTAV_PLAYERS_URL.format(season=season))


def _to_canonical(enriched: pl.DataFrame, season: str) -> pl.DataFrame:
    """Reduce a current-season enriched frame to the cross-season schema."""
    return enriched.with_columns(
        pl.col("position").cast(POSITION_DTYPE),
        pl.lit(season).alias("season"),
    ).select(CANONICAL_COLUMNS)


def backfill(data_dir: Path = Path("data")) -> dict[str, Path]:
    """Archive each historical season plus a canonical view of the current one.

    Args:
        data_dir: Root directory holding per-season folders.

    Returns:
        A mapping of season to the ``enriched.parquet`` path written.
    """
    paths: dict[str, Path] = {}
    for season in SEASONS:
        enriched = adapt_vaastav_season(
            fetch_vaastav_season(season), fetch_vaastav_players(season), season
        )
        path = data_dir / season / "enriched.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        enriched.write_parquet(path)
        paths[season] = path
        print(f"Wrote {season}: {enriched.height} rows -> {path}")

    # Re-express the live-archived current season in the same schema.
    current = _to_canonical(
        data.prepare_history(data_dir / CURRENT_SEASON), CURRENT_SEASON
    )
    current_path = data_dir / CURRENT_SEASON / "enriched.parquet"
    current.write_parquet(current_path)
    paths[CURRENT_SEASON] = current_path
    print(f"Wrote {CURRENT_SEASON}: {current.height} rows -> {current_path}")
    return paths


if __name__ == "__main__":
    backfill()

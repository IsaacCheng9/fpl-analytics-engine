"""Archive a full FPL season of per-gameweek data before the API rollover.

The FPL API only retains the current season's per-gameweek detail. When the
next season launches (around mid-July) the element-summary history is wiped, so
this module snapshots the season to local Parquet files for later analysis.
"""

import json
import time
from pathlib import Path

import polars as pl

from fpl_analytics_engine import app

# Politeness delay between element-summary requests (community norm ~1 req/s).
REQUEST_DELAY_SECONDS = 1.0
DEFAULT_OUTPUT_DIR = Path("data/2025-26")


def _flatten_nested(records: list[dict]) -> list[dict]:
    """JSON-encode nested values so the table writes cleanly to Parquet.

    Some bootstrap fields (e.g. a gameweek's ``overrides`` or ``chip_plays``)
    arrive as dicts or lists, which Polars cannot always represent as a
    writable Parquet column. Encoding them as JSON strings preserves the data
    while keeping a flat, portable schema.

    Args:
        records: The raw records decoded from the FPL API.

    Returns:
        The records with any dict or list value replaced by its JSON string.
    """
    return [
        {
            key: json.dumps(value) if isinstance(value, dict | list) else value
            for key, value in record.items()
        }
        for record in records
    ]


def archive_season(
    output_dir: Path,
    request_delay: float = REQUEST_DELAY_SECONDS,
    limit: int | None = None,
) -> dict[str, Path]:
    """Archive the current FPL season to Parquet files.

    Fetch the bootstrap-static snapshot (players, teams, gameweeks) and every
    player's per-gameweek history, then write them to ``output_dir``.

    Args:
        output_dir: Directory to write the Parquet files into; created if it
            does not exist.
        request_delay: Seconds to sleep between per-player requests to stay
            within polite rate limits.
        limit: Optional cap on the number of players to fetch, useful for a
            quick smoke test before a full run.

    Returns:
        A mapping of dataset name to the Parquet file path written.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    bootstrap = app.get_fpl_data()
    players = pl.DataFrame(
        _flatten_nested(bootstrap["elements"]), infer_schema_length=None
    )
    teams = pl.DataFrame(_flatten_nested(bootstrap["teams"]), infer_schema_length=None)
    events = pl.DataFrame(
        _flatten_nested(bootstrap["events"]), infer_schema_length=None
    )

    element_ids = [element["id"] for element in bootstrap["elements"]]
    if limit is not None:
        element_ids = element_ids[:limit]

    histories: list[dict] = []
    total = len(element_ids)
    for index, element_id in enumerate(element_ids, start=1):
        for row in app.get_player_history(element_id):
            # Guarantee the player id is present on every row for joins.
            row["element"] = element_id
            histories.append(row)
        if index % 100 == 0 or index == total:
            print(f"Fetched per-gameweek history for {index}/{total} players")
        time.sleep(request_delay)
    history = pl.DataFrame(_flatten_nested(histories), infer_schema_length=None)

    paths = {
        "players": output_dir / "players.parquet",
        "teams": output_dir / "teams.parquet",
        "events": output_dir / "events.parquet",
        "player_gw_history": output_dir / "player_gw_history.parquet",
    }
    players.write_parquet(paths["players"])
    teams.write_parquet(paths["teams"])
    events.write_parquet(paths["events"])
    history.write_parquet(paths["player_gw_history"])
    return paths


def main() -> None:
    """Archive the current season to the default output directory."""
    paths = archive_season(DEFAULT_OUTPUT_DIR)
    for name, path in paths.items():
        print(f"Wrote {name} -> {path}")


if __name__ == "__main__":
    main()

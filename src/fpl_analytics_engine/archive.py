"""Archive and refresh FPL per-gameweek data via the live API.

The FPL API only retains the current season's per-gameweek detail. When the
next season launches (around mid-July) the element-summary history is wiped, so
this module snapshots the season to local Parquet files for later analysis. The
same ingestion is re-runnable through the season: it auto-detects the current
season label, refreshes the served ``enriched.parquet`` snapshot, and is
resilient to the early-season cold start when no gameweeks have been played.
"""

import json
import time
from pathlib import Path

import polars as pl

from fpl_analytics_engine import app, data, snapshots

# Politeness delay between element-summary requests (community norm ~1 req/s).
REQUEST_DELAY_SECONDS = 1.0
DEFAULT_DATA_ROOT = Path("data")
EMPTY_HISTORY_SCHEMA = {"element": pl.Int64}


def detect_season(events: list[dict]) -> str:
    """Derive the season label (e.g. '2025-26') from the bootstrap events.

    Use the earliest gameweek deadline year as the season start, so the label
    follows the live API across the July rollover without manual edits.

    Args:
        events: The bootstrap ``events`` records, each with a deadline time.

    Returns:
        The season label in ``YYYY-YY`` form.

    Raises:
        ValueError: If no event carries a parseable deadline time.
    """
    years = [
        int(event["deadline_time"][:4])
        for event in events
        if event.get("deadline_time")
    ]
    if not years:
        raise ValueError("No event deadline times to infer the season from")
    start = min(years)
    return f"{start}-{(start + 1) % 100:02d}"


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


def _completed_gameweek_ids(events: list[dict]) -> set[int]:
    """Return gameweeks whose results have been finalised by FPL."""
    return {
        int(event["id"])
        for event in events
        if event.get("finished") is True and event.get("data_checked") is True
    }


def _build_enriched(output_dir: Path) -> Path | None:
    """Build the served ``enriched.parquet`` snapshot from the raw Parquet.

    The enriched view joins player and team metadata onto the per-gameweek
    history and derives the DefCon hit flag, so the API and UI read it directly.

    Args:
        output_dir: Season directory holding the raw Parquet files.

    Returns:
        The path written, or ``None`` if there is no per-gameweek history yet
        (the early-season cold start before any matches are played).
    """
    history = data.load_player_history(output_dir)
    if history.height == 0:
        print("No per-gameweek history yet (early season); skipped enriched build")
        return None
    enriched = data.prepare_history(output_dir)
    path = output_dir / "enriched.parquet"
    enriched.write_parquet(path)
    return path


def archive_season(
    output_dir: Path,
    request_delay: float = REQUEST_DELAY_SECONDS,
    limit: int | None = None,
    *,
    bootstrap: dict | None = None,
    enrich: bool = True,
) -> dict[str, Path]:
    """Archive the current FPL season to Parquet files.

    Fetch the bootstrap-static snapshot (players, teams, gameweeks), the
    fixtures, and every player's per-gameweek history, then write them to
    ``output_dir``. Re-runnable: each call overwrites the season's snapshot.

    Args:
        output_dir: Directory to write the Parquet files into; created if it
            does not exist.
        request_delay: Seconds to sleep between per-player requests to stay
            within polite rate limits.
        limit: Optional cap on the number of players to fetch, useful for a
            quick smoke test before a full run.
        bootstrap: A pre-fetched bootstrap payload to reuse, avoiding a second
            request when the caller has already fetched it (e.g. to detect the
            season). Fetched if not supplied.
        enrich: Whether to also build the served ``enriched.parquet`` snapshot.

    Returns:
        A mapping of dataset name to the Parquet file path written. Includes
        ``enriched`` only when the snapshot was built.
    """
    if bootstrap is None:
        bootstrap = app.get_fpl_data()
    players = pl.DataFrame(
        _flatten_nested(bootstrap["elements"]), infer_schema_length=None
    )
    teams = pl.DataFrame(_flatten_nested(bootstrap["teams"]), infer_schema_length=None)
    events = pl.DataFrame(
        _flatten_nested(bootstrap["events"]), infer_schema_length=None
    )
    fixtures = pl.DataFrame(
        _flatten_nested(app.get_fixtures()), infer_schema_length=None
    )

    histories: list[dict] = []
    completed_gameweeks = _completed_gameweek_ids(bootstrap["events"])
    if completed_gameweeks:
        element_ids = [element["id"] for element in bootstrap["elements"]]
        if limit is not None:
            element_ids = element_ids[:limit]

        total = len(element_ids)
        for index, element_id in enumerate(element_ids, start=1):
            for row in app.get_player_history(element_id):
                if row.get("round") not in completed_gameweeks:
                    continue
                # Guarantee the player id is present on every row for joins.
                row["element"] = element_id
                histories.append(row)
            if index % 100 == 0 or index == total:
                print(f"Fetched per-gameweek history for {index}/{total} players")
            time.sleep(request_delay)
    else:
        print("No completed and checked gameweeks; skipped per-player history fetches")

    history = (
        pl.DataFrame(_flatten_nested(histories), infer_schema_length=None)
        if histories
        else pl.DataFrame(schema=EMPTY_HISTORY_SCHEMA)
    )

    if completed_gameweeks and history.is_empty():
        raise ValueError("Completed gameweeks exist but no player history was returned")
    previous_path = output_dir / "player_gw_history.parquet"
    if previous_path.exists():
        previous = pl.read_parquet(previous_path)
        if not previous.is_empty():
            keys = ["element", "fixture", "round"]
            if (
                history.is_empty()
                or previous.join(history.select(keys), on=keys, how="anti").height
            ):
                raise ValueError("Refresh would discard previously archived history")

    with snapshots.stage_snapshot(output_dir) as staged:
        paths = _write_snapshot(
            staged, players, teams, events, fixtures, history, enrich
        )
        snapshots.publish_snapshot(staged, output_dir)
    return {name: output_dir / path.name for name, path in paths.items()}


def _write_snapshot(
    output_dir: Path,
    players: pl.DataFrame,
    teams: pl.DataFrame,
    events: pl.DataFrame,
    fixtures: pl.DataFrame,
    history: pl.DataFrame,
    enrich: bool,
) -> dict[str, Path]:
    """Write raw and served data into the unpublished snapshot directory."""
    paths = {
        "players": output_dir / "players.parquet",
        "teams": output_dir / "teams.parquet",
        "events": output_dir / "events.parquet",
        "fixtures": output_dir / "fixtures.parquet",
        "player_gw_history": output_dir / "player_gw_history.parquet",
    }
    players.write_parquet(paths["players"])
    teams.write_parquet(paths["teams"])
    events.write_parquet(paths["events"])
    fixtures.write_parquet(paths["fixtures"])
    history.write_parquet(paths["player_gw_history"])

    enriched_path = _build_enriched(output_dir) if enrich else None
    if enriched_path is not None:
        paths["enriched"] = enriched_path
    else:
        # Do not keep an outdated served view beside refreshed raw inputs.
        (output_dir / "enriched.parquet").unlink(missing_ok=True)
    return paths


def ingest_current_season(
    data_root: Path = DEFAULT_DATA_ROOT,
    request_delay: float = REQUEST_DELAY_SECONDS,
    limit: int | None = None,
    enrich: bool = True,
) -> tuple[str, dict[str, Path]]:
    """Refresh the current season into its auto-detected ``data/<season>/`` dir.

    Fetch the bootstrap once, derive the season label from it, then archive into
    the matching season directory. This is the live data path: the same command
    targets the right season across the July rollover with no manual edits.

    Args:
        data_root: Root directory holding per-season folders.
        request_delay: Seconds to sleep between per-player requests.
        limit: Optional cap on the number of players to fetch.
        enrich: Whether to also build the served ``enriched.parquet`` snapshot.

    Returns:
        The detected season label and the mapping of dataset name to path.
    """
    bootstrap = app.get_fpl_data()
    season = detect_season(bootstrap["events"])
    paths = archive_season(
        data_root / season,
        request_delay,
        limit,
        bootstrap=bootstrap,
        enrich=enrich,
    )
    return season, paths


def main() -> None:
    """Refresh the current season into its auto-detected season directory."""
    season, paths = ingest_current_season()
    print(f"Ingested season {season}")
    for name, path in paths.items():
        print(f"Wrote {name} -> {path}")


if __name__ == "__main__":
    main()

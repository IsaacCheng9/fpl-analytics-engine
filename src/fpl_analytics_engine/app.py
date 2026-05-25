"""Fetch raw data from the Fantasy Premier League API."""

import time
from typing import cast

import requests

FPL_BASE_URL = "https://fantasy.premierleague.com/api"
BOOTSTRAP_ENDPOINT = f"{FPL_BASE_URL}/bootstrap-static/"
ELEMENT_SUMMARY_ENDPOINT = f"{FPL_BASE_URL}/element-summary/{{element_id}}/"
FIXTURES_ENDPOINT = f"{FPL_BASE_URL}/fixtures/"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
# Identify as a browser; the FPL API rejects some default client user agents.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; fpl-analytics-engine/0.1)"}


def _get_json(url: str) -> dict:
    """Fetch and decode a JSON payload from the FPL API.

    Retry transient failures with a linear backoff so a single network blip
    does not abort a long archival run.

    Args:
        url: The fully-qualified endpoint URL to request.

    Returns:
        The decoded JSON response.

    Raises:
        requests.RequestException: If every attempt fails.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(
                url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    # Unreachable: the loop always returns or raises, but satisfies the checker.
    raise RuntimeError(f"Failed to fetch {url} after {MAX_RETRIES} attempts")


def get_fpl_data() -> dict:
    """Fetch the bootstrap-static payload from the FPL API.

    Returns:
        The decoded JSON response containing teams, players, and game
        metadata.
    """
    return _get_json(BOOTSTRAP_ENDPOINT)


def get_player_history(element_id: int) -> list[dict]:
    """Fetch a player's per-gameweek history for the current season.

    Args:
        element_id: The FPL element (player) identifier.

    Returns:
        A list of per-gameweek records, each containing minutes, points, and
        expected-stat fields (xG, xA, xGC).
    """
    data = _get_json(ELEMENT_SUMMARY_ENDPOINT.format(element_id=element_id))
    return data["history"]


def get_fixtures() -> list[dict]:
    """Fetch the season's fixtures from the FPL API.

    Returns:
        A list of fixture records, each carrying the gameweek (``event``),
        the home and away team ids, and their fixture-difficulty ratings.
    """
    return cast(list[dict], _get_json(FIXTURES_ENDPOINT))


if __name__ == "__main__":
    fpl_data = get_fpl_data()
    teams_data = fpl_data["teams"]
    players_data = fpl_data["elements"]

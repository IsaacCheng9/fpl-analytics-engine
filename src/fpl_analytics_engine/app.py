"""Fetch raw data from the Fantasy Premier League API."""

import time
from typing import cast

import requests

FPL_BASE_URL = "https://fantasy.premierleague.com/api"
BOOTSTRAP_ENDPOINT = f"{FPL_BASE_URL}/bootstrap-static/"
ELEMENT_SUMMARY_ENDPOINT = f"{FPL_BASE_URL}/element-summary/{{element_id}}/"
ENTRY_EVENT_PICKS_ENDPOINT = f"{FPL_BASE_URL}/entry/{{entry_id}}/event/{{event}}/picks/"
FIXTURES_ENDPOINT = f"{FPL_BASE_URL}/fixtures/"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
# Identify as a browser; the FPL API rejects some default client user agents.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; fpl-analytics-engine/0.1)"}
# Reuse one HTTP session so archival runs share pooled keep-alive connections.
SESSION = requests.Session()


def _is_retryable(exc: requests.RequestException) -> bool:
    """Return whether an FPL API error is transient and worth retrying."""
    if not isinstance(exc, requests.HTTPError):
        return True
    response = exc.response
    if response is None:
        return True
    return response.status_code == 429 or response.status_code >= 500


def _get_json(url: str) -> dict:
    """Fetch and decode a JSON payload from the FPL API.

    Retry transient failures (network errors, HTTP 429 and 5xx) with a linear
    backoff so a single blip does not abort a long archival run, while failing
    fast on client errors such as 404.

    Args:
        url: The fully-qualified endpoint URL to request.

    Returns:
        The decoded JSON response.

    Raises:
        requests.RequestException: If a non-retryable error occurs or every
            attempt fails.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = SESSION.get(
                url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES or not _is_retryable(exc):
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


def get_entry_event_picks(entry_id: int, event: int) -> dict:
    """Fetch the public picks for an FPL entry and completed gameweek.

    Args:
        entry_id: Public FPL entry/team identifier.
        event: Gameweek number to fetch picks for.

    Returns:
        The decoded picks payload for the requested entry and gameweek.
    """
    return _get_json(ENTRY_EVENT_PICKS_ENDPOINT.format(entry_id=entry_id, event=event))


if __name__ == "__main__":
    fpl_data = get_fpl_data()
    teams_data = fpl_data["teams"]
    players_data = fpl_data["elements"]

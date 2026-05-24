"""Fetch raw data from the Fantasy Premier League API."""

import requests

FPL_BASE_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
REQUEST_TIMEOUT_SECONDS = 10


def get_fpl_data() -> dict:
    """Fetch the bootstrap-static payload from the FPL API.

    Returns:
        The decoded JSON response containing teams, players, and game
        metadata.

    Raises:
        requests.HTTPError: If the API returns a non-success status code.
    """
    response = requests.get(FPL_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    fpl_data = get_fpl_data()
    teams_data = fpl_data["teams"]
    players_data = fpl_data["elements"]

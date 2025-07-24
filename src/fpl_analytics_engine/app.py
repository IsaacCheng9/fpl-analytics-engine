import requests

FPL_BASE_URL = "https://fantasy.premierleague.com/api/bootstrap-static"


def get_fpl_data():
    response = requests.get(FPL_BASE_URL)
    data = response.json()
    return data


if __name__ == "__main__":
    fpl_data = get_fpl_data()
    teams_data = fpl_data["teams"]
    players_data = fpl_data["elements"]

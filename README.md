# FPL Analytics Engine

[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![Test](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/test.yml/badge.svg)](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/test.yml)
[![Frontend](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/frontend.yml/badge.svg)](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/frontend.yml)

A Fantasy Premier League analytics engine that surfaces players whose recent
underlying output has pulled away from their season baseline, and estimates how
likely each player is to earn a defensive-contribution point. Every metric is
strictly point-in-time – as of any gameweek, only data from that gameweek and
earlier is used – so the engine is fully back-testable with no look-ahead.

The differentiator over public form tables is the combination of a configurable
recent-form window, expected-stats (xG/xA/xGI) rather than raw points, and a
point-in-time design that lets every recommendation be replayed and scored
against what actually happened next.

## Key Features

- **Point-in-time form engine** – ranks players by the swing between their
  recent N-gameweek per-90 expected output (xG/xA/xGI) and their season-to-date
  baseline, so a player heating up shows a positive `delta_xgi90` before the raw
  points catch up
- **DefCon hit-probability model** – an empirical-Bayes beta-binomial estimate
  of each player's probability of hitting the defensive-contribution threshold
  next match, shrinking small samples toward a fitted per-position prior so a
  2-from-2 record does not outrank an 18-from-20 one
- **Backtesting harness** – replays each gameweek on the point-in-time view,
  flags players, then scores the flags against the following gameweeks, with
  Brier score and a calibration table for the probability model
- **Season archival** – snapshots the current season's per-gameweek detail to
  local Parquet before the mid-July API rollover wipes it
- **Historical backfill** – adapts the vaastav community archive (2022-23
  onward) into the same enriched schema, so the form engine runs across seasons
  for cross-season comparison
- **REST API** – a FastAPI gateway exposing the form, DefCon, and
  DefCon-probability views, plus a player-detail endpoint for selected-season
  gameweek detail and cross-season summaries
- **Interactive web dashboard** – a React single-page app with sortable,
  filterable tables and a form-versus-baseline scatter plot across three views
  (Attacking Form, DefCon Form, DefCon Probability)
- **Player detail view** – click any table row to inspect a player's
  selected-season gameweeks, rolling xG/xA/xGI per 90, rolling DefCon counts,
  and cross-season history keyed by stable FPL `code`

### Planned Features

- Live data path that refreshes straight from the FPL API once the 2026-27
  season opens, removing the manual archival step
- A recalibrated count-based DefCon model (negative-binomial) that keeps the
  sharper margin signal of contribution counts while matching the calibration of
  the binary model

## Screenshots

### Attacking Form

<img width="1464" height="1440" alt="image" src="https://github.com/user-attachments/assets/45b83daa-669c-4147-8661-a82d79b58dea" />

### DefCon Form

<img width="1464" height="1440" alt="image" src="https://github.com/user-attachments/assets/3a145e4c-7e8d-4bf0-9f8f-030c4aac9057" />

### DefCon Probability

<img width="1464" height="1440" alt="image" src="https://github.com/user-attachments/assets/d421dc0a-4b96-4ea8-ad31-fe4e01c21e7c" />

### Detailed Player View

<img width="1464" height="1440" alt="image" src="https://github.com/user-attachments/assets/50fa244b-6d90-4f21-953d-dac1e1c7c9fa" />


## Methodology

### Form

For a chosen as-of gameweek, each player gets two per-90 expected-output figures
– one over the last `window` gameweeks, one over the season to date – computed
from minutes-weighted xG, xA, and xGI. The headline signal is
`delta_xgi90 = window_xgi90 - season_xgi90`: how far a player's recent
underlying involvement has risen above their own baseline. Both figures use only
games up to and including the as-of gameweek, so the table is exactly what was
knowable at that point in the season. The dashboard exposes xGI, xG, and xA as
separate metric groups, with window, season, delta, and per-price views for each
enabled metric.

### Defensive Contribution (DefCon)

DefCon awards 2 FPL points when a player clears a positional threshold of
defensive actions in a match – defenders need 10+ CBIT (clearances, blocks,
interceptions, tackles); midfielders and forwards need 12+ CBIRT (CBIT plus
recoveries). Rather than report a raw hit-rate, the engine models each player's
probability of hitting next match as a beta-binomial: a per-position prior
fitted from the whole population shrinks thin samples toward the position mean,
and the shrinkage eases as a player's sample grows. The model is evaluated by
backtest – Brier score for sharpness and a calibration table to check that
predicted probabilities match observed frequencies. The UI also surfaces average
defensive-contribution counts, which show whether a player is trending near the
threshold even when their binary hit-rate is flat.

### Data Availability Caveats

- Expected stats (xG/xA/xGI/xGC) exist from 2022-23 onward, so the form engine
  only runs from that season
- DefCon was introduced by FPL in 2025-26 – the underlying defensive components
  do not exist in any comparable form before then, so DefCon analysis is
  2025-26-only and historical seasons carry null DefCon columns
- In the vaastav archive, 2022-23 expected stats only cover GW16-38; scope
  2022-23 form comparisons to GW16 onward
- Cross-season player matching uses stable FPL `code`; historical `element` ids
  are season-local and are not safe for matching the same player across seasons

## Architecture

```mermaid
flowchart TD
    fpl[FPL API<br/>bootstrap + element-summary] -->|archive.py| snap[data/2025-26<br/>per-GW Parquet]
    vaastav[vaastav archive<br/>2022-25] -->|backfill.py| hist[data/&lt;season&gt;<br/>enriched.parquet]
    snap -->|data.py enrich| enriched[Enriched per-GW history<br/>xG/xA/xGI + DefCon hit]
    hist --> enriched
    enriched --> formmod[form.py<br/>point-in-time form + backtest]
    enriched --> defconmod[defcon.py<br/>beta-binomial probability + backtest]
    enriched --> playermod[player.py<br/>player detail + season history]
    formmod --> api[api.py<br/>FastAPI gateway]
    defconmod --> api
    playermod --> api
    api -->|JSON| ui[React dashboard<br/>tables + detail panel]
```

## Technology Stack

### Backend

- **Python 3.14**: managed with uv
- **Polars**: all data loading, enrichment, and analytics
- **FastAPI**: REST gateway exposing the analytics views
- **Pydantic**: response modelling and validation
- **Ruff** and **Ty**: linting, formatting, and type checking

### Frontend

- **React 19** with **TypeScript** on **Vite**: single-page dashboard
- **TanStack Table** and **TanStack Query**: sortable tables and data fetching
- **Recharts**: the form-versus-baseline scatter plot and player-detail rolling
  charts
- **Tailwind CSS**: styling
- **Biome**: linting and formatting
- **Vitest** with **Testing Library**: component tests

## Data

The engine reads from local Parquet snapshots under `data/` (gitignored):

- **Live archive** – `archive.py` snapshots the current season from the FPL API
  (`bootstrap-static` and per-player `element-summary`) before the API rolls
  over each July and the per-gameweek history is wiped
- **Historical backfill** – `backfill.py` pulls the
  [vaastav archive](https://github.com/vaastav/Fantasy-Premier-League) for
  2022-23 to 2024-25 and maps it into the same enriched schema, so the same form
  functions work across every archived season. It also reads each season's
  `players_raw.csv` so historical `element` ids can be mapped to stable FPL
  `code` and current-style `web_name`

## Usage

### Installing Dependencies

Run from the project root:

```bash
uv sync --all-extras --dev
```

### Archiving the Current Season

Snapshot the live FPL season to `data/2025-26/`:

```bash
uv run python -m fpl_analytics_engine.archive
```

### Backfilling Historical Seasons

Download and adapt the vaastav archive into `data/<season>/enriched.parquet`:

```bash
uv run python -m fpl_analytics_engine.backfill
```

Run this after a fresh checkout before using the player detail view; `data/` is
gitignored, and the detail endpoint needs every archived season's
`enriched.parquet` to include the stable `code` column.

### Running the API

```bash
uv run uvicorn fpl_analytics_engine.api:app --reload
```

- **API**: [http://localhost:8000](http://localhost:8000)
- **Interactive docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Running the Dashboard

The frontend lives in [frontend/](./frontend) and expects the API running on
port 8000:

```bash
cd frontend
bun install
bun run dev
```

The dashboard is then served at [http://localhost:5173](http://localhost:5173).

## API Endpoints

| Endpoint                          | Description                                          | Key Parameters                                                           |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /`                           | Service metadata and the latest gameweek in the data | –                                                                        |
| `GET /players/form`               | Players ranked by recent-versus-season xGI90 swing   | `window`, `position`, `min_minutes`, `min_delta`, `top_k`, `as_of_gw`    |
| `GET /players/defcon`             | Players ranked by point-in-time DefCon hit-rate      | `window`, `position`, `min_minutes`, `min_hit_rate`, `top_k`, `as_of_gw` |
| `GET /players/defcon-probability` | Players ranked by modelled DefCon hit probability    | `position`, `min_games`, `min_minutes`, `top_k`, `as_of_gw`              |
| `GET /players/{element}`          | Player gameweeks and cross-season season summaries   | `window`, `season`                                                       |

Every endpoint accepts `as_of_gw` to evaluate the point-in-time view as it would
have looked after an earlier gameweek; it defaults to the latest gameweek in the
data.

## Testing

Run the backend test suite with coverage:

```bash
uv run pytest -v --cov=src/fpl_analytics_engine --cov-report=term-missing
```

Run the frontend tests:

```bash
cd frontend
bun run test
```

Both suites run on every push via GitHub Actions.

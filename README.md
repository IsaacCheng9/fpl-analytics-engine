# FPL Analytics Engine

[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![Test](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/test.yml/badge.svg)](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/test.yml)
[![Frontend](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/frontend.yml/badge.svg)](https://github.com/IsaacCheng9/fpl-analytics-engine/actions/workflows/frontend.yml)

**Live dashboard:** [fpl-analytics-engine.vercel.app](https://fpl-analytics-engine.vercel.app)

A Fantasy Premier League analytics engine that surfaces players whose recent
underlying output has pulled away from their season baseline, and estimates how
likely each player is to earn a defensive-contribution point. Every metric is
strictly point-in-time – as of any gameweek, only data from that gameweek and
earlier is used – so the engine is fully back-testable with no look-ahead.

The differentiator over public form tables is the combination of a configurable
recent-form window, expected-stats (xG/xA/xGI) rather than raw points, transfer
candidate context, and a point-in-time design that lets every recommendation be
replayed and scored against what actually happened next. The dashboard can also
import a public FPL squad, so the same evidence can be read through a transfer
planning lens: which players you own, which candidates are shortlisted, and
where the current squad looks weak for the next gameweek.

## Key Features

- **Point-in-time form engine** – ranks players by the swing between their
  recent N-gameweek per-90 expected output (xG/xA/xGI) and their season-to-date
  baseline, so a player heating up shows a positive `delta_xgi90` before the raw
  points catch up
- **DefCon hit-probability model** – a calibrated contribution-count model that
  estimates `P(Hit | 60+ Mins)`, uses the size of each
  defensive-contribution performance, then recalibrates those probabilities
  against prior point-in-time prediction buckets
- **Backtesting harness** – replays each gameweek on the point-in-time view,
  flags players, then scores the flags against the following gameweeks, with
  Brier score and a calibration table for the probability model
- **Model evidence view** – surfaces the DefCon probability backtest and the
  corrected club-form validation inside the dashboard, including negative
  results where recent form did not beat a season-to-date baseline
- **Season archival** – snapshots preseason players and fixtures as soon as the
  FPL game rolls over, then adds current-season per-gameweek detail after GW1
- **Historical backfill** – adapts the vaastav community archive (2022-23
  onward) into the same enriched schema, so the form engine runs across seasons
  for cross-season comparison
- **One-command data refresh** – archives the latest live season, refreshes the
  cross-season enriched snapshots, validates the Parquet data, and runs the
  real-data smoke check before refreshed snapshots are pushed
- **REST API** – a FastAPI gateway exposing the form, DefCon,
  DefCon-probability, FPL team import, model-evidence, club-form, and
  player-detail views
- **Interactive web dashboard** – a React single-page app with sortable,
  filterable tables across Attacking Form, DefCon Form, DefCon Probability, Club
  Form, and Model Evidence views, URL-backed controls, active filter chips,
  presets, colour-coded signal columns, sticky player context columns, and a
  collapsible form-versus-baseline scatter plot in Attacking Form
- **Table pagination** – shows 25 rows per page in the player and club tables,
  with 10, 25, 50, 100, or all rows available. Sorting and filtering apply to the
  full result set, and the scatter plot retains all matching players
- **Transfer decision workflow** – combines attacking-threat thresholds, price,
  FDR, minutes, starts, ownership, shortlist filtering, and side-by-side player
  comparison so transfer candidates can be narrowed and inspected without
  leaving the table context
- **Team-aware squad inspection** – imports a public FPL team ID, highlights
  currently owned players, filters owned/not-owned players, and shows a
  next-gameweek squad inspection view with next fixture, FDR, minutes, threat,
  `P(Hit | 60+ Mins)`, ownership, and transparent risk/hold flags
- **Player detail view** – click any table row to inspect a player's
  selected-season gameweeks, rolling xG/xA/xGI per 90 and DefCon counts against
  their season averages, and cross-season history keyed by stable FPL `code`
- **Club form context** – compares each club's recent attacking and defensive
  output with its season baseline, then shows that form next to upcoming FDR

## Screenshots

### Attacking Form

<img width="3840" height="3600" alt="Attacking Form table" src="https://github.com/user-attachments/assets/56bfb67d-3614-4179-a99e-9726f3e5070e" />

### DefCon Form

<img width="3840" height="3000" alt="DefCon Form table" src="https://github.com/user-attachments/assets/252c638d-6f2e-4162-ac13-a6f6a865b0ba" />

### DefCon Probability

<img width="3840" height="3000" alt="DefCon Probability table" src="https://github.com/user-attachments/assets/78f202ed-d0c7-4872-9cf5-14930d2681a3" />

### Club Form

<img width="3840" height="2680" alt="Club Form table" src="https://github.com/user-attachments/assets/1dfcc71a-b68f-4bc2-8e1f-e65af1baadd2" />

### Model Evidence

<img width="3840" height="2180" alt="Model Evidence view" src="https://github.com/user-attachments/assets/6bb832e2-1cfc-4743-8e49-2785cd83bfc2" />

### Detailed Player View

<img width="3840" height="2440" alt="Detailed Player View panel" src="https://github.com/user-attachments/assets/12652499-5d2c-4841-a7a4-fe2b3cd8b51f" />

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

Flag evaluation uses complete, finalised single-season history. A player with no
fixture in an observed completed gameweek receives zero next-gameweek points;
unavailable gameweeks and incomplete recorded points remain unknown. Double
gameweek points are summed across both fixtures.

A five-gameweek window at GW30 covers GW26–30 across player form, comparison,
rolling player detail, and club form. Double gameweeks include every fixture;
blanks never pull older fixtures into the window. Game and match counts remain
fixture counts, and per-match rates use the number of fixtures actually present.

The dashboard's default window is one gameweek shorter than the gameweeks
played, capped at five, so recent form still differs from the season baseline
early in the season. A window covering every gameweek played makes the two
figures identical and every delta zero, and the dashboard flags this when such a
window is chosen. DefCon Probability's minimum-games default follows the same
rule.

Expected-stat rates use only minutes with an available observation for that
statistic. For 2022-23, this excludes GW1–15 from expected-stat totals and
denominators without removing those games from minutes or points totals. Rates
with no observed minutes remain unavailable rather than appearing as zero.

### Transfer Workflow

The dashboard is designed around narrowing transfer candidates without hiding
the underlying evidence. Transfer filters apply across the player tables: price
ceiling, FDR ceiling, minutes floor, minutes per appearance, start percentage,
ownership range, and minimum attacking-threat thresholds for the enabled
expected-stat metrics. Presets provide quick starting points for common
candidate types, while active filter chips make the current constraints visible
and removable.

Shortlisting is URL-backed, so a focused candidate list can be shared or
reopened, and the compare panel shows two selected players side by side using
the same point-in-time window and as-of gameweek assumptions. A public FPL team
ID can also be imported from the official entry-picks endpoint. Imported
ownership is labelled as `Currently Owned` because the app does not have
historical squad state; the analytics around those players still use the chosen
point-in-time `as_of_gw`.

The player table can switch between all players, the imported squad inspection,
and shortlisted players. The squad inspection view is diagnostic rather than a
solver: it shows the current squad as one list, with the current next fixture
and FDR, recent and season threat, minutes, start rate, `P(Hit | 60+ Mins)`,
ownership, and simple flags such as `Minutes Risk`, `Fixture Risk`,
`Low Threat`, `Rising Threat`, `DefCon Upside`, and `Good Hold`.

### Table Colours

Shading marks signal columns only. Changes, form scores, and over- or
underperformance use a red–white–green scale centred on zero: green is
favourable, red is unfavourable, and values near zero stay white. For goals
conceded and xGC, lower values count as favourable. Columns where more is
better, such as xGI per 90 or `P(Hit | 60+ Mins)`, use a single green that
strengthens with the value. These scales use the league-wide results, so a
player's colour does not change as filters narrow the table. FDR uses its fixed
1–5 rating with 3 as neutral, while context columns – price, ownership, playing
time, games, and hit counts – stay unshaded.

### Defensive Contribution (DefCon)

DefCon awards 2 FPL points when a player clears a positional threshold of
defensive actions in a match – defenders need 10+ CBIT (clearances, blocks,
interceptions, tackles); midfielders and forwards need 12+ CBIRT (CBIT plus
recoveries). Rather than report a raw hit-rate, the engine models each player's
probability of hitting from their defensive-contribution counts, conditional on
playing at least 60 minutes: a
Gamma-Poisson count model estimates the chance of clearing the positional
threshold, then a point-in-time calibration layer shrinks that probability
toward the observed hit-rate of similar prior predictions. The model is
evaluated by backtest. Brier score measures average probability error, so lower
is better: confident wrong predictions are punished more than cautious ones.
Expected calibration error (ECE) checks whether probabilities mean what they say
– for example, whether players predicted around 40% actually hit around 40% of
the time. The UI also surfaces average defensive-contribution counts, which show
whether a player is trending near the threshold even when their binary hit-rate
is flat.

#### DefCon Probability Backtest Results (2025-26 Season)

Player models were replayed point-in-time at GW1–37, predicting each eligible
appearance in GW2–38 using only data through the as-of gameweek. The committed
2025-26 archive yields 6,635 scored appearances (1,350 hits), requiring at least
60 minutes and a non-null DefCon outcome. Each of the 69 player double gameweeks
contributes two observations with the same pre-gameweek prediction, including
20 mixed hit/miss pairs. Calibration also counts those appearances separately
and uses only outcomes realised by the as-of gameweek. Settings are unchanged:
empirical-Bayes priors, fallback strength 5, at least 3 appearances to inform
prior variance, 10 calibration bins and calibration prior strength 50. The
constant baseline uses the full scored sample's hit rate, so it is a hindsight
reference rather than a point-in-time forecast.

| Method | Brier | ECE | Verdict |
| --- | ---: | ---: | --- |
| Calibrated count model | 0.1382 | 0.0075 | Best displayed probability – keeps the count signal while making the probabilities trustworthy |
| Raw count model | 0.1380 | 0.0320 | Sharpest Brier, but overconfident; useful signal, misleading as a displayed probability |
| Binary empirical-Bayes model | 0.1400 | 0.0120 | Well-calibrated and safe, but throws away margin information from the contribution count |
| Raw player hit-rate | 0.1505 | 0.0630 | Too noisy and overconfident for small samples |
| Constant base rate | 0.1621 | 0.0000 | Perfectly calibrated by construction, but not useful for ranking players |

The calibrated count model is preferred because it keeps almost all of the raw
count model's Brier improvement while sharply reducing ECE, making the displayed
probability more trustworthy.

Reproduce the metrics through the existing validation endpoint without fetching
or modifying data:

```bash
uv run --frozen python - <<'PY'
import json
from pathlib import Path
from fastapi.testclient import TestClient
from fpl_analytics_engine import api, data

history = data.load_enriched(Path("data/2025-26"))
api.app.dependency_overrides[api.get_history] = lambda: history
with TestClient(api.app) as client:
    response = client.get(
        "/players/defcon-probability-validation?min_minutes=60&bins=10"
    )
    response.raise_for_status()
    print(json.dumps(response.json(), indent=2))
PY
```

### Club Form

The club form view aggregates player histories into team-level attacking and
defensive form. Team xG is summed from player xG, while each club's xGC is the
opposing club's summed xG in the same fixture. Historical club identity comes
from the fixture rather than the player's final bootstrap metadata, so players
who transfer mid-season remain attributed to the club they represented in each
match. The view compares recent per-match xG and xGC against each club's
season-to-date baseline, then joins exact next-fixture context and the
next-five-gameweek FDR. Actual goals and goals conceded are available as
optional context, but expected data stays the default signal because finishing
and concession outcomes are noisier.

Window and season overperformance columns show both total and per-match
differences. Attacking overperformance is goals scored minus xG; defensive
overperformance is xGC minus goals conceded. Positive values indicate more
goals scored or fewer conceded than expected, while negative values indicate
underperformance. These describe realised outcomes, not a predicted uplift.

The collapsible Columns panel controls expected metrics, match counts, FDR,
actual goals, form summaries and separate total/per-match overperformance
groups. By default, the table shows Club, Matches, window/season/delta xG and
xGC, and FDR. Column selections persist in shareable URLs; Reset Columns
restores this compact view.

#### Validation Backtest Results (2025-26 Season)

The corrected validation compares a point-in-time season-to-date baseline with
that baseline plus recent club form. Every expanding training fold is purged so
that a row is eligible only when its complete future target horizon has ended by
the test as-of gameweek. Historical FDR is excluded: the archive contains only
the end-of-season fixture snapshot, so earlier FDR revisions cannot be
reproduced honestly.

For both club validation and calibrated DefCon backtests, `gw_range` selects
which gameweeks are scored, not which earlier observations can be used for
training or calibration. A restricted run therefore matches the same gameweeks
from a full run while retaining the point-in-time outcome-availability guards.

With a five-gameweek form window, five-gameweek target horizon, and 40 minimum
training rows, the rerun scored 460 predictions per target on the 2025-26 archive.
Adding recent attacking form made future xG prediction worse by 2.8% MAE and
5.5% RMSE. Adding recent defensive form improved future xGC MAE by just 0.1%
but worsened RMSE by 1.0%. Club form remains useful descriptive context, but
this backtest does not support treating it as a predictive uplift. FDR remains
available in the live scouting view only as current fixture context.

### Data Availability Caveats

- Expected stats (xG/xA/xGI/xGC) exist from 2022-23 onward, so the form engine
  only runs from that season
- DefCon was introduced by FPL in 2025-26 – the underlying defensive components
  do not exist in any comparable form before then, so DefCon analysis is
  2025-26-only and historical seasons carry null DefCon columns
- In the vaastav archive, 2022-23 expected stats only cover GW16-38; expected
  rates use that coverage and remain unavailable before GW16
- Cross-season player matching uses stable FPL `code`; historical `element` ids
  are season-local and are not safe for matching the same player across seasons
- Current ownership and imported squad membership are live/current-state
  overlays from the official FPL API; they are not point-in-time historical
  fields and do not change with `as_of_gw`
- Curated Parquet snapshots under `data/` are committed for reproducible
  deployment and personal/non-commercial use; they are sourced from the public
  FPL API and public community archives

## Architecture

```mermaid
flowchart TD
    fpl[FPL API<br/>bootstrap + fixtures + element-summary] -->|archive.py| snap[data/&lt;live season&gt;<br/>Parquet snapshots]
    picks[FPL API<br/>public entry picks] -->|team import| api
    vaastav[vaastav archive<br/>2022-25] -->|backfill.py| hist[data/&lt;season&gt;<br/>enriched.parquet]
    snap -->|data.py enrich| enriched[Enriched per-GW history<br/>xG/xA/xGI + DefCon hit]
    hist --> enriched
    enriched --> formmod[form.py<br/>point-in-time form + backtest]
    enriched --> defconmod[defcon.py<br/>calibrated count probability + backtest]
    enriched --> playermod[player.py<br/>player detail + season history]
    enriched --> clubmod[club.py<br/>club form + validation]
    snap --> fixmod[fixtures.py<br/>FDR + next fixtures]
    formmod --> api[api.py<br/>FastAPI gateway]
    defconmod --> api
    playermod --> api
    clubmod --> api
    fixmod --> api
    api -->|JSON| ui[React dashboard<br/>tables + detail panel]
```

## Technology Stack

### Backend

- **Python 3.14**: managed with uv
- **Polars**: all data loading, enrichment, and analytics
- **FastAPI**: REST gateway exposing the analytics views
- **Pydantic**: response modelling and validation
- **Ruff** and **Pyrefly**: linting, formatting, and type checking

### Frontend

- **React 19** with **TypeScript** on **Vite**: single-page dashboard
- **TanStack Table** and **TanStack Query**: sortable tables and data fetching
- **Recharts**: the form-versus-baseline scatter plot and player-detail rolling
  charts
- **Tailwind CSS**: styling
- **Biome**: linting and formatting
- **Vitest** with **Testing Library**: component tests

## Data

The engine reads from committed Parquet snapshots under `data/`:

- **Live archive** – `archive.py` snapshots the current season from the FPL API
  (`bootstrap-static` and per-player `element-summary`) before the API rolls
  over each July and the per-gameweek history is wiped. Before GW1, it archives
  players, teams, events and fixtures without making hundreds of empty
  `element-summary` requests
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
uv sync
```

### Refreshing Data

Refresh the committed Parquet snapshots with one command:

```bash
uv run python -m fpl_analytics_engine.refresh
```

The refresh command archives the current live FPL season into the detected
`data/<season>/` folder, backfills historical seasons from the vaastav archive,
canonicalises the current season's `enriched.parquet`, runs data-health
validation, and finishes with the real-data smoke check. Use it before pushing
updated `data/` snapshots during the season. The deployed dashboard serves the
committed snapshots, so a refresh goes live on the next deployment.

Refreshes run against a temporary copy and publish only after every selected
step passes. Failed downloads, enrichment, validation or smoke checks leave the
published snapshots unchanged. Direct archiving also stages raw and enriched
files before publication, and rejects empty completed history or the loss of
previously archived player-fixture records. Limited archive runs should target a
separate directory rather than overwrite a full snapshot.

Run only one refresh writer at a time. Publication uses directory replacement
with rollback, not a concurrent-reader transaction. If backup cleanup fails
after a successful publication, the command logs the retained backup path for
manual removal. Validation-only runs do not stage or republish data.

Only gameweeks marked both finished and data-checked by FPL are added to player
history. This makes a refresh safe during an active gameweek: zero-minute
placeholder rows and provisional results from that gameweek are excluded.

During preseason, the refresh deliberately writes no `enriched.parquet` because
there are no current-season performances to analyse. The API reports
`data_status: "preseason"` and the dashboard shows the next deadline instead of
serving the previous season as current data. Run the command again after GW1 is
complete to enable the current-season analytical views.

For a validation-only check of existing local snapshots:

```bash
uv run python -m fpl_analytics_engine.refresh --skip-archive --skip-backfill
```

The `Data Refresh` GitHub Actions workflow automates this during the season. It
runs daily and on demand, checks the live FPL API for newly finalised gameweeks,
and only then runs the refresh with `--skip-backfill` followed by the test
suite. A passing run opens or updates a single review PR from the
`data/scheduled-refresh` branch – nothing reaches `main` or the deployed
dashboard until that PR is merged, and a failed or blocked FPL request fails the
run without committing data. Trigger it manually with `force` to refresh the
snapshot context without a new gameweek. PRs opened with the default workflow
token do not trigger CI, so close and reopen the PR to run it, or add a
fine-grained `DATA_REFRESH_TOKEN` secret with contents and pull-request write
access.

### Archiving the Current Season

Snapshot the live FPL season to its detected `data/<season>/` folder:

```bash
uv run python -m fpl_analytics_engine.archive
```

### Backfilling Historical Seasons

Download and adapt the vaastav archive into `data/<season>/enriched.parquet`:

```bash
uv run python -m fpl_analytics_engine.backfill
```

The committed snapshots make the dashboard usable immediately after checkout;
the refresh command above is the preferred way to update them.

### Validating Local Data

Check that the committed Parquet snapshots are present and internally usable:

```bash
uv run python -m fpl_analytics_engine.data_health
```

Run the opt-in real-data smoke check after archiving and backfilling:

```bash
uv run python scripts/real_data_smoke.py
```

The smoke script uses Saka by default as a known cross-season player, verifies
stable-code matching, and checks that 2022-23 expected-stat rates are scoped to
GW16 onward.

Run the opt-in club-form validation, which reads the 2025-26 archive by default
(pass `--data-dir` to choose another season):

```bash
uv run python scripts/club_form_validation.py
```

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

| Endpoint | Description | Parameters |
| --- | --- | --- |
| `GET /` | Live season, analytical readiness, next deadline, and latest completed gameweek | – |
| `GET /fpl-team/{entry_id}` | Import a public FPL entry's currently visible squad | Path: `entry_id`; query: `event` |
| `GET /players/current-context` | Current snapshot player metadata and scheduled, unstarted fixture context | – |
| `GET /players/form` | Players ranked by recent-versus-season xGI90 swing | `window`, `position`, `min_minutes`, `min_delta`, `top_k`, `as_of_gw`, `fdr_horizon` |
| `GET /players/defcon` | Players ranked by point-in-time DefCon hit-rate | `window`, `position`, `min_minutes`, `min_hit_rate`, `top_k`, `as_of_gw`, `fdr_horizon` |
| `GET /players/defcon-probability` | Players ranked by calibrated `P(Hit \| 60+ Mins)` | `position`, `min_games`, `min_minutes`, `top_k`, `as_of_gw`, `fdr_horizon` |
| `GET /players/defcon-probability-validation` | Backtest the DefCon probability model | `bins`, `min_minutes` |
| `GET /clubs/form` | Clubs ranked by recent-versus-season xG and xGC form | `window`, `top_k`, `as_of_gw`, `fdr_horizon` |
| `GET /clubs/form-validation` | Backtest a season baseline versus baseline plus recent club form | `window`, `horizon`, `min_train_rows` |
| `GET /players/{element}` | Point-in-time player gameweeks and cross-season summaries | Path: `element`; query: `window`, `season`, `as_of_gw` |

The analytical table endpoints accept `as_of_gw` to evaluate the point-in-time
view as it would have looked after an earlier gameweek; it defaults to the
latest gameweek in the data. Current ownership and `/fpl-team/{entry_id}` squad
membership are deliberately not point-in-time, because the FPL API exposes only
live ownership and visible entry-pick snapshots. The player-detail endpoint is
keyed by the current-season `element` id, tracks the player across seasons by
stable `code`, and resolves `as_of_gw` within the selected `season`. Historical
seasons default to their own latest gameweek; an explicit cutoff limits that
season's rows and summary. Earlier season summaries remain complete, and later
seasons are excluded. A missing history `code` falls back to the live player
snapshot; without a stable code, only that player's current-season rows are
available. In the player panel, switching to an older season
shows its full history, while returning to the live season restores the main
table's as-of cutoff.

Before GW1, current-season analytical and team-import endpoints return HTTP 409
rather than silently serving the previous season. Explicit historical player
detail requests remain available when the live player snapshot supplies a
matching stable `code`. In the deployed app, prefix these routes
with `/api` (for example, `/api/players/form`).

### Current Squad Context
`/players/current-context` supplies squad inspection with current snapshot club,
price, ownership, and fixture context, including players without appearances.
Unlike historical analytical FDR anchored to `as_of_gw`, it selects the earliest
scheduled, unstarted fixture by kickoff time for the player's snapshot club,
excluding finished or started matches. The next fixture is not horizon-limited;
aggregate FDR covers five gameweeks starting at the gameweek of the earliest
scheduled, unstarted kickoff in the snapshot. Rounds outside that range are
excluded, including rearranged earlier rounds. Historical analytical endpoints
retain their existing semantics.

This route reads archived snapshots only and makes no live FPL requests. Club,
schedule, and match-status changes since the last snapshot refresh are not
reflected, so 'current' does not mean real-time. It also works before GW1 and
returns null next-fixture context when no eligible fixture is known.
Missing metadata leaves known player IDs in the response with null fields;
squad inspection does not replace unknown fixtures with historical context or
infer a home venue when it is unknown.

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

GitHub Actions runs the backend suite on pushes to `main` and on pull requests,
and the frontend suite whenever files under `frontend/` change.

# NeuroRoute
AI-powered sensory-aware navigation for more accessible walking routes.

**Find your calmer way.** A working USC walking-navigation prototype for the USC AI Product Showdown. Compare real walking paths using your preferences for road exposure, noise-related geographic proxies and proximity to green spaces.

The shortest route is not always the most comfortable route. NeuroRoute gives people with sensory sensitivities, neurodivergent students and anyone who prefers a calmer walk more control over that tradeoff. Preferences are individual; no diagnosis or account is requested.

## What works

- Real, cached OpenStreetMap walking graph around USC University Park and nearby Exposition Park.
- Eight verified destination presets, searchable start/destination inputs, swap/clear, and map-click selection.
- Noise, traffic and green-space preference sliders; presets, reset, walking priority and optional 10/20/30% detour limits.
- Fastest, calmer and balanced route roles generated from positive weighted graph costs. Similar paths combine instead of displaying fake alternatives.
- Computed distance, estimated walking time, modeled exposure, breakdown, detour and comparison metrics.
- Interactive React Leaflet map with distinct line patterns, route selection/visibility, fit, zoom, mapped greenery and optional potential rest stops.
- Natural-language preference interpretation with confirmation, grounded explanations and complete rule-based fallback.
- Keyboard controls, visible focus, reduced motion, high contrast, text summaries and responsive desktop/mobile layouts.
- Methodology, source freshness, missing-data notes and privacy information in the app.

Crowd data is **unavailable**: its slider is saved but does not affect routing. Noise/traffic scores are static geographic estimates, not measured conditions. This is a hackathon prototype, not production navigation or a medical device.

## Stack and structure

React 19, TypeScript, Vite, Tailwind CSS, Lucide and React Leaflet on the frontend; Python, FastAPI, OSMnx, NetworkX, GeoPandas, Shapely, Pandas and NumPy on the backend. HTTPX supports optional OpenAI Responses API calls. No database, authentication or Docker is required.

```text
backend/
  app/main.py                 FastAPI endpoints and one-time cache loading
  app/models.py               Validated request/response models
  app/services/               Geographic loader, routing, scoring, AI fallback
  scripts/prepare_map.py      Reproducible OSM download and validation
  scripts/verify_demo.py      Verify three real alternative-route scenarios
  data/snapshot/             Compact verified geographic snapshot (~456 KB)
  tests/                     Routing, API, data and AI failure tests
frontend/
  src/App.tsx                Application state and request handling
  src/components/            Map, controls, route cards, assistant and information
  src/services/api.ts        API client with errors/timeouts
  e2e/                       Desktop/mobile Playwright smoke tests
scripts/dev.ps1              Windows launcher for either service
docs/                        Architecture, methodology, limitations, demo and pitch
```

The preparation script downloads and scores geographic data once. FastAPI loads it at startup, NetworkX calculates a bounded set of weighted paths, and React renders computed GeoJSON geometry. AI interprets preferences and chooses explanation emphasis; it never generates the routes or their facts. See [architecture](docs/architecture.md).

## Install on Windows PowerShell

Requirements: Python 3.12 (tested), Node.js 22+ and npm. Run commands from the repository root. Nothing needs to be installed globally for this project.

```powershell
Set-Location C:\Users\ryany\neuroroute
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --cache-dir tmp/pip-cache -r backend/requirements-lock.txt
Copy-Item .env.example .env
Set-Location frontend
npm.cmd ci --cache ../tmp/npm-cache
Set-Location ..
```

Skip `Copy-Item` if you already have `.env`; keep existing settings. Activation is optional because commands use the virtual environment's Python explicitly. `requirements-lock.txt` and `package-lock.json` pin the verified dependencies; `requirements.txt` describes supported direct dependency ranges.

This workspace already has a virtual environment, dependencies, portable Node and a verified map snapshot installed. For a new checkout without Node on the path, this optional project-local setup avoids changing the system installation:

```powershell
New-Item -ItemType Directory -Force tmp | Out-Null
Invoke-WebRequest https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip -OutFile tmp/node.zip
Expand-Archive -LiteralPath tmp/node.zip -DestinationPath tmp -Force
$env:PATH = "$PWD\tmp\node-v22.23.3-win-x64;$env:PATH"
```

## Run the app

In PowerShell terminal 1, from the root:

```powershell
.\scripts\dev.ps1 backend
# Equivalent:
# .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In terminal 2, from the root:

```powershell
.\scripts\dev.ps1 frontend
# With Node already on PATH:
# Set-Location frontend
# npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Backend API documentation: **http://127.0.0.1:8000/docs**. Both services bind to the loopback interface. The Vite proxy connects `/api` to port 8000. Keep both terminals open. Press Ctrl+C in each to stop. If local PowerShell policy blocks a `.ps1` file, use the equivalent commands shown above rather than changing machine policy.

## Demo

Click **Try a campus demo**. It loads a verified real pair and high noise/traffic/green preferences, calculates actual routes and selects the calmer result.

Recommended pair: **Exposition Park Rose Garden → USC Fisher Museum**, noise 95, traffic 95, green 85, “More calm,” max detour 30%. On the included snapshot, fastest is 593.1 m; calmer is 640.4 m, about 0.6 extra minutes. The modeled exposure reduction is 26.8%; this is not a measured reduction in noise or stress.

Close the results, select **Shortest walk** and recalculate to demonstrate that preferences affect the path. Ask the assistant for a quiet walk near green spaces, confirm its settings, and show the new comparison. Toggle potential rest stops and open **Behind the map**.

Three verified scenarios are included in `backend/data/snapshot/demo-scenarios.json`; the [two-minute demo script](docs/demo-script.md) includes backup pairs. See the [pitch outline](docs/pitch-outline.md).

## Geographic data

The included compact snapshot is real OSM data, not simulated routes. It contains 2,750 nodes, 7,550 directed edges, 63 green features, eight verified destination presets and 25 mapped potential rest stops. OSM access restrictions are conservatively filtered. `metadata.json` records source, UTC retrieval time, geographic bounds, exclusions and connected components. Destinations link back to their mapped source. No precise campus coordinates were invented.

Ordinary startup does not call Overpass. Basemap tiles still need internet. To refresh, from the root:

```powershell
.\.venv\Scripts\python.exe backend/scripts/prepare_map.py
.\.venv\Scripts\python.exe backend/scripts/verify_demo.py
# Restart the backend after a successful refresh.
```

Download/validation failure preserves the existing snapshot. Missing cache produces a clear setup error rather than fictional data. Small disconnected network components are retained; unreachable selections return an error. The graph and data are versioned at under 1 MB; temporary downloads/caches and large generated geographic files remain ignored.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under ODbL 1.0. See [attribution](backend/data/ATTRIBUTION.md) and [data methodology](docs/data-methodology.md). The snapshot was retrieved October 16, 2026 in Los Angeles local time; freshness is not a claim of current conditions.

## Environment variables

Configure these only in the root `.env` or the backend process environment. No credentials are required for core routing.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | empty | Optional backend-only key; absent/failing calls use rules |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Structured-output-capable model for preference interpretation/emphasis |
| `WALKING_SPEED_KPH` | `4.8` | Assumed walking speed, valid range 1–10 |
| `OVERPASS_URL` | `https://overpass-api.de/api` | Data-preparation endpoint; optional mirror |
| `FRONTEND_URL` | local origins | Backend CORS allowlist; comma-separated production origins |

Never put keys in frontend environment variables or commit `.env`. Live paid OpenAI calls were not exercised without a key; provider failure and output validation are covered by tests.

## Deploy to Render Free and Vercel

The repository includes `render.yaml` for FastAPI and `frontend/vercel.json` for Vite. Render uses `backend` as its root directory. Uvicorn requires the ASGI attribute, so the valid start command is `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. The committed `backend/data/snapshot/` directory includes the verified OSM GraphML snapshot and supporting files; no build-time download is required.

Render settings:

```text
Service type: Web Service
Root directory: backend
Runtime: Python
Build command: pip install --upgrade pip && pip install -r requirements-lock.txt
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Plan: Free
Health check path: /api/health
```

Set `FRONTEND_URL` to the Vercel deployment origin, such as `https://neuroroute.vercel.app`. It accepts comma-separated origins. `OPENAI_API_KEY` is optional; leaving it blank enables the tested deterministic fallback. After deployment, `/api/health` should return `status: "ok"` and `graph_loaded: true`.

Vercel settings:

```text
Project root: frontend
Framework preset: Vite
Build command: npm run build
Install command: npm ci
Output directory: dist
Environment variable: VITE_API_BASE_URL=https://<your-render-service>.onrender.com
```

`VITE_API_BASE_URL` is the exact frontend variable used by `frontend/src/services/api.ts`. Set it for Production, Preview and Development as appropriate. Do not put `OPENAI_API_KEY` in Vercel. Redeploy after changing it because Vite embeds `VITE_*` values at build time. Local development leaves it blank and uses the Vite `/api` proxy.

The graph is loaded once at startup. Its compressed file is about 350 KB and the full snapshot is under 500 KB. Local startup and tests fit comfortably within ordinary developer memory, but hosted Render memory under the 512 MB cgroup was not directly observable here; monitor deploy logs for actual hosted usage. Render Free may spin down when idle, so the first request can be slow. The remaining external setup blockers are the real Render and Vercel URLs needed for `FRONTEND_URL` and `VITE_API_BASE_URL`.

## Tests and production build

From the root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe backend/scripts/verify_demo.py
# If using the portable runtime, add it to PATH for this terminal:
$env:PATH = "$PWD\tmp\node-v22.23.3-win-x64;$env:PATH"
Set-Location frontend
npm.cmd test
npm.cmd run build
```

For browser tests, start both services first, then run from `frontend`:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\..\tmp\playwright-browsers"
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Tests cover shortest paths, positive costs, preference weighting, detour limits, missing/restricted/disconnected data, API validation, AI fallback, controls, route metrics, loading/errors and browser journeys. Browser screenshots and traces are stored under ignored `tmp/`. Test status is recorded in [verification](docs/verification.md).

## Limitations and next steps

Routes use a small static network and bounded candidate search, not globally optimal constrained routing. Snaps are within 120 m of mapped walking nodes, not verified entrance connectors. Walking times omit crossing waits and entrance offsets. Crowd, lighting, live noise and construction data are unavailable. Rest stop quietness and opening hours are unverified. This prototype does not provide GPS guidance or guarantee step-free access.

Preferences persist locally; no diagnoses are collected. If configured, assistant text/settings or route summaries are sent to OpenAI. Tiles are requested from OpenStreetMap. Read [full limitations](docs/limitations.md) before a live navigation trial.

Next priorities are field verification of campus entrances/access, research with intended users, consented environmental observations and broader routing/coverage.

NeuroRoute estimates potential sensory exposure using available geographic data. Actual conditions may differ. Follow posted signs and use your judgment when navigating.

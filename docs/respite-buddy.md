# Respite Buddy handoff

## Verified in this implementation

On the feature branch, the final local checks passed:

| Command / check | Result |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest backend/tests -q` | 83 passed; includes original routing regressions, scout/schema validation, timing/deadlines, filters, swaps, data drift and real MCP protocol tests |
| `npm test` in `frontend` | 29 passed |
| `npm run test:e2e` in `frontend` | 8 passed; original walking journeys, new recommendations, stalls/fallback, source labels, swaps, deep links, responsive layout, keyboard/focus, and axe WCAG 2 A/AA checks |
| `npm run build` in `frontend` | Passed; large-chunk advisory due to embedded saved scenarios (about 179 KB gzip JS) |
| `.venv/Scripts/python.exe -m pip check` | No broken requirements |
| `python backend/scripts/verify_mcp.py http://localhost:8000/mcp/` | Discovery of all four tools and three demo recommendations passed over actual loopback HTTP |
| `git diff --check` and credential-pattern review | Passed; no detected secrets |

The pre-existing production frontend returned HTTP 200; Render health reported `graph_loaded: true`. All six existing data endpoints returned JSON with the exact Vercel CORS origin, and a real route request returned fastest, calmer and balanced roles. Those production checks verify the existing deployment, not deployment of this feature branch. The local tests include actual parent FastAPI MCP mounting and repeated lifespan cleanup; no successful Claude account connection is claimed.

## Architecture and API

React/Vite presents a ranked place list first and keeps the original Leaflet walking map and route comparison. FastAPI loads the same committed OSM graph once. `app/services/respite.py` composes the existing Router for origin → spot and spot → optional class; it does not replace graph costs, scoring, geometry or the fastest/calmer/balanced algorithm. The website REST endpoints and Python MCP tools call this one service. No accounts, schedules, report database or backend preference store were added.

New endpoints:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/spots?demo=false` | Validated scouted library; demo=true selects labeled illustrative records |
| `GET /api/spots/{id}?demo=false` | Public record details |
| `GET /api/buildings` | Existing verified OSM destination presets |
| `POST /api/reset-spots` | Rank eligible spots, returning routes, rest time, leave-by time and backups |
| `POST /api/reset-spots/swap` | Alternative with 45-minute request-scoped exclusions |
| `POST /api/plan-day` | Process structured classes in request memory and return gap recommendations |
| `/mcp/` | Streamable HTTP MCP initialization/discovery/tool calls |

Example REST request:

```json
{"near":"Leavey","next_class":"TCC","minutes":20,"needs":["quiet"],"demo":true}
```

The optional `now` and `demo_time` fields use timezone-aware ISO datetimes. `demo_time` requires `demo=true`. Demo defaults to **2026-10-19 13:00 America/Los_Angeles**. All opening-hour and after-dark decisions use campus local time. Results are deterministic for identical inputs, graph, library and time. The website's sample default uses Leavey and no next class, so rest time is explicitly provisional. Once a next class is selected both walking legs are counted.

The engine filters unknown or closed hours, unknown/restricted access, unsatisfied needs, missing verification, unreachable points and nonpositive rest time. USC ID access requires explicit eligibility. Between 19:00 and 07:00 safety must be explicitly verified; a daytime recommendation also cannot suggest staying past 19:00 when safety is unknown. Dedicated-use spaces are excluded. Both leg estimates round up to whole minutes, and rest time rounds down. Time also caps at known closing time. The source route distances and precise modeled metrics remain intact. Indoor travel, entrance offsets and crossing delays are unavailable: leave extra time.

Temporary exclusions travel in the response and the next request; there is no global report state. In the website they remain in session storage, while MCP clients retain them in the current conversation. A report does not establish a crowd observation. Day planning accepts up to 20 structured classes and uses each gap up to a conservative 240-minute maximum. It does not read screenshots or save schedules.

## Data and fallback

`backend/data/respite-spots.json` starts empty. Teammates can populate it independently with the [scouting guide](scouting.md). Real verified data must be supplied before making actual campus spot recommendations. Leavey and TCC resolve to existing OSM coordinates. JKP/Popovich Hall resolves to coordinates published in the [official USC Event Calendar](https://calendar.usc.edu/popovich_hall_jkp), recorded in `backend/data/buildings.json`. That point snaps to a disconnected graph component: the engine correctly refuses to invent a connection. This blocks the exact JKP navigation demo pending a verified connected entrance/path, so use TCC meanwhile.

Deep-link query parameters include origin and optional next-class coordinates, minutes and needs needed to reconstruct the result. A validated `#reset=` URL fragment preserves the original deadline, eligibility, route preferences and demo-time context without sending those values in the initial HTTP request URL. Delayed live links and swaps recalculate remaining time against the original deadline. Live swaps without the deadline are rejected rather than renewing the break window. Links omit class/event names and complete schedules. All URL contents, including fragments, are still visible to anyone with the link; use the website without sharing the link when that is undesirable.

When a start or class point exactly equals a spot's coordinates, the engine represents that leg as zero outdoor walking with no invented path geometry. Distinct points that merely snap to the same walking node retain the original router's rejection; this does not establish an indoor path or public entrance.

The sample demo uses real OSM points at Hutton Park, Alumni Park and Associates Park, with real network paths. Hours, access, noise, lighting and seating are explicitly simulated. They are never inserted into the scout library. No sample verification identities, crowd observations, accessibility assertions or safe-after-dark claims are fabricated. A 21:00 demo correctly returns no eligible spots. The five-minute default demo may also return no spots because actual walking times consume the budget.

Crowd data is unknown unless a real record has a typical category plus verification identity and date. The displayed date is the scout visit date, not real-time occupancy. There is no class-change crowd model, camera or sensor integration. Hours and accessibility stay unknown where not collected. Regular hours do not prove holiday availability. Source-coordinate accuracy does not prove a public building entrance or step-free route.

The site starts with bundled campus data. Existing routes match only the exact precomputed request; offline mode never fabricates routes for changed points or preferences. `frontend/src/data/respite-demo.json` contains default/sample time-chip scenarios generated by the shared engine. Saved results are labeled. Unsupported offline settings require reconnecting or restoring the default sample.

Regenerate and verify bundles after relevant data/engine changes:

```powershell
.\.venv\Scripts\python.exe backend/scripts/export_fallback.py
.\.venv\Scripts\python.exe backend/scripts/export_respite_demo.py
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

The campus fallback exporter, drift test, client retry/error handling, and exact-request saved-route lookup selectively reuse teammate commit `6942ab9`. The commit was neither merged nor cherry-picked. New Respite Buddy code adapts that approach with its own shared-engine export and drift checks.

## Update the existing deployments

These are updates to the existing free projects; no new project, paid plan or paid API is required. Review the feature PR and let a human merge before the normal main-branch production deployment. Alternatively, deliberately select this feature branch in a deployment dashboard if the team wants a preview. Pushing this branch alone does not prove a production redeploy.

Render settings:

```text
Existing service URL: https://neuroroute.onrender.com
Root Directory: backend
Runtime: Python (3.12 tested)
Build Command: pip install --upgrade pip && pip install -r requirements-lock.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/health
Instance Plan: Free
FRONTEND_URL=https://neuro-route-nine.vercel.app
WEBSITE_URL=https://neuro-route-nine.vercel.app
WALKING_SPEED_KPH=4.8
OPENAI_API_KEY=<leave blank for deterministic operation>
```

The lockfile includes `requirements-mcp.txt`, so the existing Render build command installs the pinned MCP SDK. Keep all graph files under `backend/data/snapshot` tracked. No geographic downloads run at startup. `FRONTEND_URL` accepts comma-separated origins: add the exact Vercel preview origin if testing a preview, while retaining production. No wildcard CORS is needed.

Vercel settings:

```text
Existing project URL: https://neuro-route-nine.vercel.app
Root Directory: frontend
Framework: Vite
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
VITE_API_BASE_URL=https://neuroroute.onrender.com
```

Set the frontend variable in the needed Production/Preview environments, then rebuild: Vite embeds it at build time. No secret key belongs in a `VITE_*` variable. Deep links use the existing `/` route and query parameters; no infrastructure rewrite is necessary.

After deployment verify `/api/health` has `graph_loaded: true`, GET `/api/spots` returns valid JSON, the example POST above returns labeled demo results, existing `/api/routes` works, and the Vercel browser can call Render without a CORS error. Initialize an MCP client against `https://neuroroute.onrender.com/mcp/` for protocol verification; a browser GET alone is insufficient. See [MCP instructions](mcp.md).

Render may sleep, so wait for health before the presentation. The local Windows Uvicorn process reached about 201 MiB peak working memory after loading the graph and serving REST, MCP and browser tests (210,907,136 bytes observed). This does not reproduce Render Free's 512 MB cgroup or prove hosted peak memory; monitor Render logs and actual memory during a preview deployment. No new production deployment or Claude account connection is claimed by the local checks.

## Five-step presentation

1. Open the website and choose **Try the demo**. Explain the fixed demo time and simulated conditions at real mapped locations. Use 15 or 20 minutes near Leavey; the list appears before the map. For a two-leg demo choose TCC as next class. **Restart sample demo** restores the default demo and clears only sample-spot exclusions, keeping real session reports intact.
2. Select a place, review walking/rest/leave-by time, then **Walk me there** to see the original fastest/calmer/balanced route comparison. Inspect **Why this walk?** and **Behind the map**.
3. Select **It's full** or **It's locked**. Observe the alternate spot and session-only exclusion. Change a time chip to see rankings and feasibility update.
4. If the Claude connector is available and tested, ask for an explicitly labeled demo near Leavey with quiet needs, 20 minutes and TCC next. Follow a returned website link. For day planning, let Claude convert a sample schedule screenshot into structured classes before `plan_day`; the server itself does not read images. The website's calendar preview is simulated free/busy only.
5. Call `find_reset_spots` with `demo=true` and `demo_time="2026-10-19T21:00:00-07:00"`. Show the conservative empty result because after-dark safety is unverified. Disconnect the API and run the saved default website demo to demonstrate fallback reliability.

The local first-try counters distinguish demo events from actual use; they are interaction counts, not validated product performance. The support footer links directly, without tracking, to [USC Student Health's mental health and well-being page](https://studenthealth.usc.edu/mental-health-and-well-being/), verified to return HTTP 200 with counseling information on 2026-10-17. Real calendar access, reports/check-ins, sensors and Siri remain roadmap items.

# Render and Vercel deployment

## Render Free

Create a Web Service from this repository and use the checked-in `render.yaml`, or enter these dashboard values:

```text
Root Directory: backend
Runtime: Python
Build Command: pip install --upgrade pip && pip install -r requirements-lock.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Plan: Free
Health Check Path: /api/health
```

Set `FRONTEND_URL=https://<vercel-project>.vercel.app`, plus optional `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4.1-mini`, and `WALKING_SPEED_KPH=4.8`. The backend always preserves localhost development origins. Do not commit dashboard values.

The service loads `backend/data/snapshot/usc.graphml.gz` and companion files from the repository at startup. With Render's root directory set to `backend`, `data/snapshot` resolves correctly. No Overpass request runs during startup.

Verify deployment with:

```powershell
Invoke-RestMethod https://<render-service>.onrender.com/api/health | ConvertTo-Json
```

Expected: `status: "ok"`, `graph_loaded: true`, and `features.crowds: false`.

## Vercel

Import the same repository as a separate Vercel project and set **Root Directory** to `frontend`. The checked-in `frontend/vercel.json` supplies the build, install and output settings.

```text
Framework Preset: Vite
Build Command: npm run build
Install Command: npm ci
Output Directory: dist
VITE_API_BASE_URL=https://<render-service>.onrender.com
```

Set `VITE_API_BASE_URL` for Production, Preview and Development when needed. `frontend/src/services/api.ts` appends `/api` to it. Blank means the local Vite proxy is used. Vite embeds `VITE_*` values at build time, so redeploy after changing it. Never set `OPENAI_API_KEY` in Vercel.

## Keep the backend awake (cron-job.org)

Render Free sleeps after about 15 idle minutes and takes roughly 40 seconds to wake. A free external ping every 10 minutes keeps it warm:

1. Sign in at https://cron-job.org (free) and choose **Create cronjob**.
2. Title `Respite Buddy keep-warm`, URL `https://neuroroute.onrender.com/api/health`.
3. Schedule: **Every 10 minutes**. Request method `GET`. Leave authentication blank; the endpoint is public and read-only.
4. Under notifications, enable "on failure" so you hear if the backend goes down.
5. Save, then use **Test run**. Expected: HTTP 200 with `"status":"ok"`.

Render's free tier includes 750 instance hours per month, which covers one always-on service. Turn the job off after the demo if you no longer need it.

## Offline fallback

The frontend bundles `frontend/src/data/fallback.json` and opens on it immediately, then swaps in live data when the backend answers. While the backend is asleep or unreachable, the default USC Village to Leavey Library pair (all four presets) and the three demo scenarios return saved routes, labeled as saved in the route notes. Anything else shows "Campus data isn't loading. Try the demo below." with a working demo button.

The saved routes are recorded from the real router. Regenerate them after changing the snapshot, router, presets or demo scenarios; `tests/test_fallback.py` fails if they drift:

```bash
cd backend && python scripts/export_fallback.py
```

## Verification and uncertainty

The included snapshot is real OpenStreetMap-derived data and is tracked in Git; it is under 500 KB total. Local health verification returns `graph_loaded: true`. Local startup and tests do not reproduce Render's hosted 512 MB cgroup, so exact hosted RAM usage remains unverified. OSMnx, GeoPandas and NetworkX import overhead should be monitored in Render logs. Render Free cold starts are expected.

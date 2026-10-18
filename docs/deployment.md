# Render and Vercel deployment

The existing projects are already live at `https://neuroroute.onrender.com` and `https://neuro-route-nine.vercel.app`. Update those projects; no new infrastructure or paid plan is needed. The existing health, data, route calculation and production CORS were verified successfully on 2026-10-17 before this feature. For the Respite Buddy update, MCP endpoint, environment values and verification procedure, see the [current handoff](respite-buddy.md#update-the-existing-deployments).

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

## Verification and uncertainty

The included snapshot is real OpenStreetMap-derived data and is tracked in Git; it is under 500 KB total. Local health verification returns `graph_loaded: true`. Local startup and tests do not reproduce Render's hosted 512 MB cgroup, so exact hosted RAM usage remains unverified. OSMnx, GeoPandas and NetworkX import overhead should be monitored in Render logs. Render Free cold starts are expected.

# Alumni Park to Leavey Library production investigation

Checked October 20, 2026, against https://respite-buddy.vercel.app and
https://neuroroute.onrender.com, from main commit `de2954d`.

## Result and limits

The reported failure did not reproduce in two fresh Chromium sessions. Both selected
Alumni Park as Start and Leavey Library as Destination and clicked Find My Route.
The live route response was HTTP 200 and the route comparison rendered without alerts.
The measured real route was 495.7 m and 6.2 minutes using default preferences.
Only one distinct route was returned, which is valid when routing constraints yield
the same path for fastest, calmer and balanced choices.

- `/api/health`: HTTP 200, `status: ok`, `graph_loaded: true`.
- All five startup requests (locations, metadata, features, rest stops, demo scenarios): HTTP 200.
- `/api/routes`: HTTP 200. JSON POST preflight: HTTP 200.
- Both actual responses and preflight allow `https://respite-buddy.vercel.app`.
- No browser console errors, failed requests or page exceptions appeared in reproduction.
- Deployed bundle `/assets/index-CwSkXFvE.js` compiles the API base as
  `https://neuroroute.onrender.com`; `/api` is appended once by the client.
- Live `/api/reset-spots` generated three links with the origin
  `https://respite-buddy.vercel.app`.

These verify effective API, CORS and website-link settings. They do not reveal the
literal dashboard values of FRONTEND_URL or WEBSITE_URL (WEBSITE_URL also has a
canonical default). No authenticated Render/Vercel dashboard or historical service
logs were available to this investigation.

The original incident's root cause remains unconfirmed. The displayed message comes
from the frontend API wrapper for network/CORS failure, an aborted request, an
unparseable response, or HTTP 5xx. Each request has a 25-second timeout and one retry.
A cold start lasting beyond both attempts could produce it, as could a transient
proxy/service failure. Neither was observed; cold start is a hypothesis, not a diagnosis.
Map tiles come from a separate host, so visible tiles do not establish API health.
The fallback serves only exact saved requests and cannot supply arbitrary live trips.

No runtime code, routing algorithm, snapshot, timeout, or deployment configuration
was changed without evidence of a defect. This PR adds exact-trip regression coverage
and this runbook. It does not claim to fix a historical outage that could not be reproduced.

## Production verification

1. Open `https://neuroroute.onrender.com/api/health`; require `graph_loaded: true`.
2. Open a fresh browser at `https://respite-buddy.vercel.app/#walk` with Network and
   Console open. Select Alumni Park → Leavey Library and click Find My Route.
3. Require `/api/routes` on the Render origin to return HTTP 200 with real JSON
   geometry, a visible route comparison, and no saved-demo status.
4. To run the checked-in smoke test from `frontend` with installed Node/Playwright:

   ```powershell
   $env:ROUTING_SMOKE_FRONTEND_URL='https://respite-buddy.vercel.app'
   npm run test:e2e -- e2e/live-walk.spec.ts --workers=1
   Remove-Item Env:ROUTING_SMOKE_FRONTEND_URL
   ```

The test requires an available live backend; it deliberately fails on fallback and
does not keep retrying until an outage is hidden. Run ordinary browser tests with
the local Vite server on 5173 and the actual backend on 8000.

If the error returns, record the timestamp, request URL, HTTP status, elapsed time,
console CORS error (if any), and Render request ID. Correlate with Render startup,
restart, memory and request logs. Redact tokens and calendar data before sharing.

## Dashboard settings if a future deployment differs

- Vercel → existing project → Settings → Environment Variables → Production:
  `VITE_API_BASE_URL=https://neuroroute.onrender.com` (without `/api`). Redeploy
  after changing a Vite variable; an existing JavaScript bundle is immutable.
- Render → existing service → Environment:
  `FRONTEND_URL=https://respite-buddy.vercel.app`. Preserve needed legacy/preview
  origins in the comma-separated list. Save and redeploy to apply CORS changes.
- Render: `WEBSITE_URL=https://respite-buddy.vercel.app`; this controls generated
  navigation links, not CORS or the walking route calculation.
- Keep the existing Free plan, root `backend`, tracked snapshot and start command
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

No dashboard change is indicated by the currently successful production checks.

## Validation for this PR

- Backend: 138 tests passed, including real snapshot routing and production-origin CORS.
- Frontend unit tests: 102 passed.
- Local browser suite: 44 passed, including live routing, offline demos, calendar,
  filters, navigation and accessibility checks.
- Production browser smoke: 1 passed against the deployed frontend and backend.
- TypeScript and Vite production build passed (existing large-chunk warning).
- Source/build scan found zero recognized credential patterns.
- Final production health check: HTTP 200, graph loaded, approximately 0.33 seconds.

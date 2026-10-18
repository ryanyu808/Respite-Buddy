# One-tap discovery and evidence-backed filters

Based on merged PR #6 at `eda1097`, on `feature/ryan-smart-filters`. Zero-question UX takes precedence over activity/filter selection.

## Experience

The initial reset screen presents one **Somewhere calm, now** action, a short explanation, a clearly labeled starting point and collapsed **Change preferences**. No activity, filter, slider, schedule, account, location permission or question is required. A fresh device defaults to 15 minutes; explicitly saved time/needs/walking preferences are reused. Unknown location uses Leavey Library, explicitly **not the user's current location**. Selected supported campus building names can be remembered; precise/GPS coordinates are not persisted.

An optional schedule is read locally. A future class within four hours can supply location/time/deadline without sending titles, notes or the complete schedule. A class in progress does not establish free time. The previous class's building is never assumed to be the user's current position. Missing/unavailable context uses the labeled default. Browser location requires a separate, explicit optional permission action and is limited to this session and the existing campus bounds.

Results lead with one best eligible location, rest/walk times, reason and **Walk me there** / **It's full**. Leave-by appears on the card when the next-class leg is known; otherwise rest time remains provisional. Backup cards expand on request. Directions open on request, or directly for explicit walking deep links and schedule-to-directions actions. Original route alternatives, scoring, both legs, exclusion expiry and deadlines remain intact. Known reservation-required records are not promised as walk-in resets; the app does not assume a reservation. Conflicting class schedules fall back without questions rather than arbitrarily selecting a class. Demo filter changes do not overwrite saved live filters.

After a result/error, **Adjust · optional filters** exposes quick chips and **More filters**. Original time/needs/presets/sliders/building/calendar-demo controls remain under Change preferences. Preferences clear without a confirmation questionnaire. No diagnoses or health records are inferred or stored.

At most one dismissible suggestion appears after an attempt: class gap first, then evening, then lunchtime. Lunch never automatically applies food filters. Suggestions do not block search or ask follow-ups. Live empty results say **We're still confirming campus spaces.** and offer documented exploration or the labeled sample demo. Connection details are collapsed. Live failure never silently becomes demo mode.

## Filters and contracts

`ResetRequest.filters` and `PlanDayRequest.filters` are optional backward-compatible objects. The existing four MCP tools discover these same schemas and reuse RespiteEngine. Keys:

```text
quiet, outlets, comfortable_seating, few_people, dim, indoor, outdoor,
restroom, food_allowed, food_available, step_free, open_now,
no_reservation, verified_only, evening_access,
max_walk_min (null or 1..120), access (any/open/usc_id),
activity (break/study/charge/eat/between/friend)
```

Flags default false, access any, activity break. Indoor/outdoor are mutually exclusive. Strict matching occurs **before** top-three ranking, not merely on three preselected results. Walking limits use the existing router's rounded-up outbound duration, never a straight-line estimate. Mandatory opening, access, after-dark, dedicated-use, connectivity and next-class eligibility remain independent of optional filters. Default ranking is unchanged. Study adds only an evidenced tie-break after rest time. Charge requires evidenced outlets. Eat requires food sales OR food permission; these are different attributes. Break/Between classes/Meet a friend add no unsupported restrictions or social/crowd promises.

GET `/api/campus-candidates` is preserved. POST `/api/campus-candidates/filter` accepts `{near, filters}` and returns `mode: exploration`, source records, evaluation time and optional router-derived `walk_min`. The browser filters attributes from identical bundled data while Render wakes. A walking limit requires the real service; unavailable/disconnected estimates are excluded, not invented. Approximate building anchors remain labeled and exclude indoor travel; coincident anchors can have zero **outdoor** walking time, not zero indoor travel.

## Evidence and food

Spot adds nullable, backward-compatible `food_available`, `venue_kind`, `reservation_required`, and per-attribute `evidence` (HTTPS source + checking date). Schema and blank scouting template are updated. Venue kinds support cafe, dining hall, food market, outdoor eating and seating-only; kind alone does not establish hours, permission or amenities.

Three-state matching preserves **present / absent / unknown**. Populated signed scout records support their fields; candidates need attribute-specific evidence or nonhistorical provenance explicitly supporting the field. Unsupported positives and unknowns are excluded from strict matches. Comfortable seating means evidenced soft seating, not guessed furniture. Few people still needs a dated scout note, never fabricated live occupancy. Open now uses evidenced hours in America/Los_Angeles, including overnight intervals. Evening additionally requires evidenced access and after-dark suitability. No reservation requires evidenced false, not null.

All **original 32 candidates are preserved**, with two distinct dining candidates added (34 total):

- [USC Libraries Leavey spaces](https://libraries.usc.edu/locations/leavey-library/leavey-library-spaces) documents power outlets for pods 210A/B/C and 310A/B/C. Six existing records gain outlet-specific source/date evidence; they remain reservable, unconfirmed-access candidates—not scout observations or live availability.
- [USC Hospitality dining index](https://hospitality.usc.edu/dining-locations-upc/) places Seeds Marketplace at TCC and Literatea at DML. [Seeds Marketplace](https://hospitality.usc.edu/dining-locations/seeds-marketplace/) documents food sales; [Literatea](https://hospitality.usc.edu/dining-locations/literatea/) documents a cafe inside Doheny. Existing TCC/Doheny coordinates are labeled approximate building anchors, not counters/entrances. Seeds' indoor/outdoor setting remains unknown.

Sources checked 2026-10-17, local date. No dining hours, food permission, noise, crowd, seating, step-free access, reservations or after-dark safety were invented. No current opening/service promise. Live scout library remains empty; previous unresolved research inventory is unchanged. Regenerate curated data with `backend/scripts/prepare_campus_directory.py`, schema/template with `validate_spots.py --schema`, and changed demo contracts with `export_respite_demo.py`.

## Privacy, deployment and demo

Filters use localStorage `respite-buddy-smart-filters`; selected building name uses `respite-buddy-last-campus-location`. Schedules remain in IndexedDB; GPS is not saved. No server schedule database, tracking or mandatory account. Swaps preserve filters/deadlines. Deep links include filters in the existing validated navigation fragment, not private titles/full schedules. Exact saved demo responses can be filtered over their complete three sample options, never fabricated new geometry. Strict filters may correctly produce zero sample matches where evidence is absent; original needs/time demo scenarios remain illustrative and functional.

No new dependencies, secrets, hosting resources or paid plans. Human review/merge before production deployment when services track main.

**Render Free:** root `backend`; build `pip install --upgrade pip && pip install -r requirements-lock.txt`; start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health `/api/health`. Keep `FRONTEND_URL=https://neuro-route-nine.vercel.app`, `WEBSITE_URL=https://neuro-route-nine.vercel.app` and existing optional settings. Include updated JSON data/schema. Deploy backend before/with frontend for the walking-limit endpoint. No graph replacement/download; exact hosted 512 MB peak RAM remains unverified.

**Vercel:** root `frontend`; Vite; Node 22+; install `npm ci`; build `npm run build`; output `dist`; `VITE_API_BASE_URL=https://neuroroute.onrender.com` without `/api`. Existing optional OAuth identifiers/callback files unchanged. No new variables/permissions. Redeploy after reviewed merge; preview success is not production deployment.

Demo: fresh page → one tap → honest empty state → Try the demo → one sample recommendation → Walk me there → It's full → backup, same deadline. Expand Adjust to filter without questions. Directory → Need an outlet shows six documented pods; Food available shows two venues; Open now correctly stays empty until evidence-backed hours exist. My Schedule and original walking/MCP tools remain available.

Remaining limitations: real-time noise, crowd, opening, service stock, entry, accessible entrances and indoor travel are not guaranteed. Real scout data and unresolved location research require human collection. Calendar provider credentials/live consent and OCR limits remain as documented in [calendar-and-locations.md](calendar-and-locations.md).

## Validation

- Backend: **103 passing** tests (original routing, calendar, API and real MCP protocol regressions, plus evidence matching, food distinctions, pre-ranking filtering, actual walking limits and swap deadlines).
- Frontend: **65 passing** tests (three-state attributes, filters, local context/privacy, preference persistence, deep links and all prior suites).
- Playwright: **19 passing** tests, including one visible primary action/no setup, one visible recommendation, strict-filter recalculation, saved preferences/schedule, eligible backup/deadline, candidate separation, mobile/axe, and original calendar/walking flows. Test-only synthetic verified fixtures exist only in automated tests, never in production data.
- Production build succeeds; `npm audit --omit=dev`: zero vulnerabilities. Existing large-bundle advisory and development-only test-tool advisories remain documented in the earlier calendar handoff; no dependencies were changed or force-upgraded.
- Geographic snapshot, original routing/scoring modules, Render/Vercel configuration and OAuth setup are unchanged. No paid resources or automatic merging.

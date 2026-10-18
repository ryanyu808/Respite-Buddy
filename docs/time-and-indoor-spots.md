# Break time and indoor spaces

## Available time

The only preset buttons are **15 min, 30 min, 45 min, 1 hour**. Other values from imported schedules or existing deep links still work but are displayed as calculated breaks, not additional preset buttons.

Both the presentation home and full reset tool expose an optional **Or use current time & class start** form. Pick a break date and two Pacific times, then calculate. Next-day classes require an explicit checkbox. Invalid, reversed, ambiguous daylight-saving, and over-four-hour windows are rejected. Walking legs are subtracted from the available time as before. An existing class deadline is not extended by filtering or reporting a spot full. Personal times are not persisted to the server.

## Why indoor results were empty

The previous sample library consisted only of outdoor parks; the real scout library is still empty. The indoor filter itself correctly rejected those records.

- The sample library now also includes Leavey's Weingart Reading Room, Doheny's Los Angeles Times Reference Room, and the Kortschak quiet study room, at the existing documented building anchors. **All demo hours, noise, seating, and access assumptions remain explicitly simulated**. No scout or crowd observation was created.
- The saved bundle supports all four presets and indoor + quiet/seated combinations. Arbitrary demo clock windows reuse the same real route geometry and recalculate only elapsed/rest/leave-by time, respecting the simulated 7 AM–7 PM window. Unsupported origins, next-class points, or route preferences still require the real backend; no path is guessed.
- Real indoor searches with no verified match can return a separate `documented_options` array. `recommendations` remains empty. These are known indoor places to explore, with **provisional** rest times assuming entry is possible. Opening, current access, seating, and after-dark safety are not promised. Strict confirmed-outlet, step-free, open-now, scout-only and other requirements are not relaxed.
- Calendar gap projections expose the documented options and open the same shared reset engine. Dedicated-purpose and reservation-required rooms stay out of ordinary suggestions. Distinct buildings are preferred over three rooms at one anchor.
- Zero outdoor walking at an exact building anchor is shown honestly; indoor travel is not counted, and no indoor route geometry is invented.

## Submitted location compilation

All **46** entries from `usc_respite_spots.md` were reconciled into `backend/data/campus-submitted.json` and its bundled frontend mirror. Eleven entries link to existing/now-added directory records instead of becoming duplicate cards. Thirty-five additional research entries are searchable under **More spots from the team's research**.

Two directory records were added with existing Doheny building coordinates and independently checked USC sources:

- [Hall of Honor](https://libraries.usc.edu/locations/doheny-memorial-library/rooms/hall-honor-card-catalog-room)
- [Treasure Room](https://libraries.usc.edu/locations/doheny-memorial-library/rooms/treasure-room)

The directory now has 36 geographic candidates. Entries without a checked anchor remain research-only; no coordinates or routes were invented. Reported hours and synthesized noise/crowd ratings from the submission were **not** promoted into verified attributes. Prayer/community-specific spaces are not automatically recommended based on inferred identity. The attachment's conversational instructions do not replace the application's zero-question UX.

## Deployment and maintenance

No new credentials, paid services, environment variables, or dependency changes. Publish the reviewed feature branch through the existing Render and Vercel deployments. The live indoor fallback requires the updated backend; the updated frontend remains compatible with the old response (it treats missing `documented_options` as empty). Sample recommendations work without Render after frontend assets are loaded.

After changing the demo spot library, regenerate `frontend/src/data/respite-demo.json` with `python backend/scripts/export_respite_demo.py`. The source uses the existing geographic snapshot, not fictional points. Keep the backend/frontend candidate and submitted-research mirrors synchronized. Do not mark research entries scouted without real verification.

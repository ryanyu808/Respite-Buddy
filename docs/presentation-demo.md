# Presentation-first home

The default `/` page immediately displays three sample recommendations. It does not wait for Render or a schedule, request location permission, ask questions, or apply saved live filters. An existing on-device schedule may load asynchronously and supply the next class. Start/end time inputs are visible beside the heading, with no duration buttons or hidden time form. The large demo badge and introductory paragraph have been removed. Cards retain their small SAMPLE label; a brief disclosure below the results explains that conditions are simulated, not scout observations or live availability.

The initial data is replayed through `savedDemo` from the existing `respite-demo.json` engine bundle: Leavey Library → a sample park → Tutor Campus Center, Monday October 19, 2026, 1:00–1:15 PM. Both route legs use the existing saved OSM walking graph calculations. All conditions are illustrative, not verified access, opening, crowd or accessibility claims.

## Choose your journey

**Starting from** and **Next class / destination** are searchable campus fields directly above the time inputs. Leavey and Tutor Campus Center are editable sample defaults, not inferred GPS or class information. Campus names and supported aliases/codes work. Apply them with the single **Find me a spot** button. The applied endpoints are shown above the cards, so unfinished edits are not confused with a calculated route.

The next destination may be blank. Then only the outward walk is subtracted, rest time is explicitly provisional, and no onward map or class leave-by promise is invented. Exact coincident building anchors show **No outdoor walk needed**; indoor travel remains excluded.

When available, the on-device saved schedule can fill the next destination, class deadline and current break window automatically. It never supplies an assumed current location. The existing schedule-context safeguards still reject overlapping classes, classes in progress and distant/all-day events. User edits and navigation take priority over a late schedule read. No event titles, notes or schedule are sent to a server or serialized in walking links.

`demo-route-legs.json` contains each directed location ↔ sample-spot leg calculated by the unchanged router. `savedDemo` composes exact cached legs for the selected buildings with the existing engine's eligibility seed, then recalculates walk/rest/leave-by times. Both map strategies and private deep-link endpoints are preserved. A missing path is not a zero-minute walk; unknown points and disconnected JKP are explicitly rejected, never replaced with Leavey/TCC. This does not establish campus entry or accessibility.

Regenerate both demo files with `python backend/scripts/export_respite_demo.py` after changing the snapshot, building library or routing defaults. Backend tests compare every saved directed leg with a fresh router calculation. This update needs the existing Vercel frontend deployment only; there are no backend runtime, environment-variable, dependency or paid-service changes.

## Quick demo

1. Open the website root. Three picks are already shown; no setup is needed.
2. Keep the sample endpoints or choose different campus locations, then click **Find me a spot** using the prefilled window or your own start/end times (Pacific). For example, 10:15 AM–12 PM calculates 105 minutes. **Outdoors, Indoors, Quiet, Place to sit, Lower light, Fewer people** appear directly above the cards and immediately recalculate the options without questions. The optional date/overnight controls stay collapsed.
3. Click **Walk me there** to show the saved route. Click **Then to class** to show the second leg. **Other walking routes** retains fastest, calmer, and balanced alternatives.
4. Click **Back to spots**, then **It’s full**. The next remaining eligible sample becomes the best pick, with the same class deadline. Skips affect only this demo screen, not live crowd reports or saved preferences.
5. **Show another pick** promotes another sample without excluding anything. **Restart demo** restores skipped spots; **Reset demo** restores the default window/preferences when no sample fits. Refreshing also starts a fresh presentation. Applying a new time window clears demo skips; changing preferences or reporting full does not change the deadline.

The route line and route summary are available if map tiles fail, but a completely uncached website still requires a connection to download its frontend assets. This is not a service worker/offline installation.

## Existing tools

- **My Schedule** remains available in the header. Real schedules stay on-device as before.
- **More tools** contains **Live reset tools**, **Plan a walk**, and **Campus spaces**. The live engine retains its evidence requirements and never substitutes these samples for verified results.
- `/?live=1` opens the full reset tool directly. Existing engine/MCP deep links and `/#walk` retain their original behavior.
- **Find a spot** returns to the simple presentation home from any tool.

## Deployment

Deploy the feature branch through the existing Vercel project, or merge its reviewed PR into the project's production branch to publish the new default home. Deploy the same branch to Render for matching illustrative preference eligibility in API/MCP demos. No environment-variable, dependency, or hosting-plan changes are needed. The home page uses its committed route bundle without Render. Pushing a feature branch does not by itself change the production website when production tracks `main`.

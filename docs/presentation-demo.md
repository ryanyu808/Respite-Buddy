# Presentation-first home

The default `/` page immediately displays three sample recommendations. It does not wait for Render or a schedule, request location permission, ask questions, or apply saved live filters. Both location fields start empty. A local schedule can offer an optional **Use saved next class** action, but never prefill fields without a click. Start/end time inputs stay visible with no duration buttons. Cards retain their small SAMPLE label; a brief disclosure explains that conditions are simulated, not scout observations or live availability.

Initial sample picks use a clearly labeled Leavey starting point, no next destination, and Monday October 19, 2026, 1:00–1:15 PM. This is not an inferred user location. Route legs come from the existing real OSM walking graph calculations. Conditions are illustrative, not verified access, opening, crowd or accessibility claims.

## Choose your journey

**Starting from** and **Next class / destination** are initially empty searchable comboboxes above the time inputs. Clicking opens the campus list; typing filters names and aliases/codes. Arrow keys, Enter, Escape and pointer selection work. Blank starting point uses the labeled Leavey sample, not GPS; blank destination stays blank. Apply locations with **Find me a spot**. The applied endpoints appear above the cards.

The next destination may be blank. Then only the outward walk is subtracted, rest time is explicitly provisional, and no onward map or class leave-by promise is invented. Exact coincident building anchors show **No outdoor walk needed**; indoor travel remains excluded.

The optional **Use saved next class** action fills its destination, deadline and current window on request. It never supplies an assumed current location. Existing schedule safeguards still reject overlapping classes, classes in progress and distant/all-day events. User edits and navigation take priority over a late schedule read. No event titles, notes or schedule are sent to a server or serialized in walking links.

`demo-route-legs.json` contains each directed location ↔ sample-spot leg calculated from the real graph, plus 13 explicitly illustrative records on existing mapped park or documented room anchors. The live/REST/MCP demo library remains unchanged; the expanded spot pool is presentation-only. Published building pins now match nearby connected outdoor nodes within the existing 120 m limit. This fixes JKP, Taper Hall and McCarthy Quad without changing their published coordinates or drawing invented connectors. All 13 listed locations and 169 origin/destination combinations are audited; unknown points are not silently substituted. Entrance access and unmatched building-to-path distance remain unverified/excluded, with approach notes available in directions.

## Time-aware picks

The previous six-entry demo had only three records per setting, and its seeds were already top-three lists. Updating time could only alter their rest numbers. `homeRecommendations` now evaluates the full expanded pool before ranking and displaying three cards. It checks selected needs, actual saved outward/onward walking times, positive remaining rest, the simulated opening window and exclusions. Short windows favor nearby picks. Medium and longer windows allow a change of scenery with a bounded walking target (0 / 6 / 10 minutes), while penalizing total walking and tight rest. This is a demo editorial policy, not measured crowd/noise data. Identical eligible settings may legitimately retain some choices; no random shuffle or fictional occupancy is used.

Valid time edits update results immediately without another Find click or focus jump. Partial/invalid edits preserve the last valid results and explain errors on submit. Preferences stay selected; time edits do not silently toggle them. Full-spot swaps refill cards from the remaining eligible pool without extending the deadline. Map alternatives and both legs remain available. Presentation links use `home=1` and restore their selected sample route; existing REST/MCP links are unchanged.

Regenerate both demo files with `python backend/scripts/export_respite_demo.py` after changing the snapshot, building library or routing defaults. Export fails if any listed origin/destination has no Indoor or Outdoor demo coverage. Backend tests compare every saved directed leg with a fresh router calculation; frontend tests evaluate all 169 pairs in both settings. Deploy both Render and Vercel for the updated building-point matching and browser cache. No environment-variable, dependency or paid-service changes are needed.

## Quick demo

1. Open the website root. Three picks are already shown; no setup is needed.
2. Choose campus locations or use the clearly labeled sample start, then click **Find me a spot**. Edit start/end times (Pacific) to update options immediately. For example, 10:15 AM–12 PM calculates 105 minutes. **Indoors, Outdoors, Quiet, Place to sit, Lower light, Fewer people** appear directly above the cards. The optional date/overnight controls stay collapsed.
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

Deploy the reviewed revision to Render and Vercel using their existing settings. Render must restart to load the building-point matching update; Vercel must rebuild to publish the regenerated browser routes. The home still uses its committed route bundle without Render. Pushing a feature branch does not by itself change production when production tracks `main`.

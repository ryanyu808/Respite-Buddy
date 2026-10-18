# Presentation-first home

The default `/` page immediately displays three sample recommendations. It does not wait for Render, request location, read a class schedule, ask questions, or apply saved live filters. Start/end time inputs are visible beside the heading, with no duration buttons or hidden time form. The large demo badge and introductory paragraph have been removed. Cards retain their small SAMPLE label; a brief disclosure below the results explains that conditions are simulated, not scout observations or live availability.

The data is replayed through `savedDemo` from the existing `respite-demo.json` engine bundle: Leavey Library → a sample park → Tutor Campus Center, Monday October 19, 2026, 1:00–1:15 PM. Both route legs use the existing saved OSM walking graph calculations. No geographic coordinates, campus opening hours, crowd reports, or accessibility claims were fabricated for this screen.

## Quick demo

1. Open the website root. Three picks are already shown; no setup is needed.
2. Click **Find me a spot** to move to the picks using the prefilled window, or enter your own start/end times (Pacific). For example, 10:15 AM–12 PM calculates 105 minutes. **Outdoors, Indoors, Quiet, Place to sit, Lower light, Fewer people** appear directly above the cards and immediately recalculate the options without questions. The optional date/overnight controls stay collapsed.
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

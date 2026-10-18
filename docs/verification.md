# Verification record

The latest Respite Buddy implementation results (83 backend, 29 frontend, 8 browser tests) are recorded in the [current handoff](respite-buddy.md#verified-in-this-implementation). The record below describes the original NeuroRoute baseline.

Verified October 16, 2026 (America/Los_Angeles), on Windows with Python 3.12 and project-local Node 22.23.3. Exact dependency versions are in the Python and npm lockfiles.

| Check | Result |
| --- | --- |
| Backend Pytest suite | 25 passed |
| Frontend Vitest suite | 11 passed |
| TypeScript and Vite production build | Passed |
| Playwright desktop/mobile journeys | 3 passed, including keyboard and accessibility checks |
| axe automated WCAG 2 A/AA checks | No violations on initial and route-results screens |
| Real OSM preparation | Passed: positive finite lengths, access filtering, valid geometry, counts, bounds and components recorded |
| Real demo verification | Three distinct pairs verified with computed detours within 30% |
| Python dependency consistency (`pip check`) | No broken requirements |
| Manual screenshot inspection | Desktop and mobile reviewed with loaded map tiles; responsive map fitting, text contrast, slider targets and mobile overlap corrected |

Backend tests cover shortest-path correctness, sensory cost behavior, deterministic results, positive edge costs, detour constraints, zero weights, missing green data, inactive crowd weights, identical/disconnected/distant points, missing/corrupt cache, restricted edges, API health/validation/error responses, real snapshot validity, deterministic explanation fallback, provider failure and invalid AI output.

Frontend tests cover slider changes, reset, corrupted localStorage, search-draft handling, route-card metrics/selection, successful and failed API calls, loading states and missing locations. Browser checks use the actual local API and included geographic snapshot. They exercise the campus demo, selection, route visibility, assistant confirmation, recalculation, shortest-walk behavior, rest-stop toggle, dialogs, keyboard entry, high-contrast toggle, mobile overflow and invalid selections. Automated accessibility checks supplement, but do not replace, human accessibility testing.

The browser successfully loaded OpenStreetMap tiles (HTTP 200). Early screenshots captured before tile loading were rechecked after loading. Generated screenshots and browser dependencies remain in ignored `tmp/`.

## Known verification limits

- A live paid OpenAI request was not exercised without a configured key. Mock tests verify failure and invalid-output fallback. The rule-based path is exercised end to end.
- The current Starlette TestClient emits a dependency deprecation warning about HTTPX; all backend tests pass. Browser tooling emits a harmless color-environment warning. Neither indicates a test failure.
- No field walk, mobile-device hardware test, screen-reader study or full manual WCAG audit was performed. Campus gates, entrances and real sensory conditions require field validation.
- No deployment or production operational readiness claim is made.

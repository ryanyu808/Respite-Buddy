# NeuroRoute Build Review Checklist

2026-10-16 · Navya Gupta

Fix the three P0 blockers before building anything new: the live link is broken and the build and PRD describe different products. Everything below compares the latest `main` (Ryan's merged PR #1), the live site at neuro-route-nine.vercel.app, and the Respite Finder PRD, Draft 0.2.

Priority key: **P0** blocks the demo, **P1** hurts the pitch or the user, **P2** is polish. Tick items off as they ship.

## P0 blockers

- [ ] **Decide the product direction with Ryan.** Wrong: the build answers "how do I walk from A to B more calmly?" while the PRD answers "where can I reset right now and still make my next class?" Fix: agree on one story for judges. Recommended: keep Ryan's routing and add the spot-first "Reset before class" mode (Features, item 1), then update the PRD to match.
- [ ] **Host the backend so the live link works.** Wrong: every data call on neuro-route-nine.vercel.app (`/api/locations`, `/api/map/metadata`, `/api/rest-stops`, `/api/map/features`, `/api/demo-scenarios`) returns 404 because only the React frontend is deployed. Start and destination are empty, "Find My Route" is greyed out and the demo button never appears. Fix: deploy the FastAPI backend (Render, Railway or a Vercel Python function) and point the frontend at it, or ship the demo scenarios as static JSON so the page always opens on a working result.
- [ ] **Replace the raw error with plain language.** Wrong: judges see "Unexpected token 'T'… is not valid JSON". Fix: show "Campus data isn't loading. Try the demo below." and keep a working demo path.

## Missing compared with the PRD

Ten of the PRD's requirements are missing or partial. Already met and worth keeping: the "Why this walk?" ranking line, calmer vs fastest side by side, and the honest "Behind the map" page.

- [ ] **P0 · Time to rest and "leave by".** Wrong: there is no next-class or minutes input at all. Fix: add a next-class picker and 5/10/12/15/20 minute chips; compute time to rest = minutes − walk to spot − walk from spot to class; show "leave by" on every card and recalculate when the gap changes.
- [ ] **P0 · A ranked list of places.** Wrong: rest stops are only an optional map overlay. Fix: make places the main result, ranked by time to rest, then expected crowd, with a "Tight on time" tag at 1 to 3 minutes.
- [ ] **P0 · Enterable, real spots.** Wrong: all 25 rest stops are outdoor OSM features; 8 are named only "Mapped bench", 5 only "Nearby park", none has hours and none is indoors. Fix: seed scouted indoor spots (see Features, item 2) and give every spot a real name, hours and an access note.
- [ ] **P1 · Needs chips that filter.** Wrong: the build uses noise/traffic/green sliders instead. Fix: add quiet, seated, dim light, few people, indoor and outdoor chips that filter the list.
- [ ] **P1 · Source-labeled crowd level with its age.** Wrong: crowd is "unavailable". Fix: label every card Verified by scouts, Estimate, Reported or Measured, with age ("Reported 12 min ago"); never show a crowd level without a source.
- [ ] **P1 · "Somewhere calm, now" button.** Wrong: missing. Fix: one large button that reuses the last needs and next class, stored on the device, clearable in one tap.
- [ ] **P1 · Gentle leave-by timer.** Wrong: missing. Fix: off by default, set with one tap, fires silently or with a soft vibration at the leave-by time.
- [ ] **P1 · "Need more support?" link.** Wrong: missing. Fix: a static, untracked footer link to USC student counseling on the places and route screens; wording that doesn't label or diagnose.
- [ ] **P2 · Full low-sensory mode.** Wrong: partial; only high contrast plus the system reduced-motion setting. Fix: one toggle for no motion, muted palette and larger text, saved on the device.
- [ ] **P2 · Busy-road crossings on each route.** Wrong: only "meters on major roads", hidden in a collapsed section. Fix: show crossings count and time to rest on each route card.

## Changes and improvements

- [ ] **P1 · Too many decisions before the first result.** Wrong: about ten choices (4 presets, 4 sliders, a priority toggle, a detour dropdown, the assistant) sit above the button; the PRD says an overloaded student answers no questions. Fix: lead with presets and tuck the sliders under "Fine-tune".
- [ ] **P1 · Dead crowd slider.** Wrong: it shows 50/100 and is saved but changes nothing, which reads as working. Fix: remove it, or replace it with the class-change estimate (Features, item 3).
- [ ] **P1 · False-precision scores.** Wrong: "32/100 est. exposure" and "26.8% lower estimate" are exact-looking numbers on a road-type proxy (PRD Section 9: R² about 0.70). Fix: use plain counts such as "2 fewer busy-road crossings" and label them as modeled.
- [ ] **P1 · Calmer route doesn't show its value.** Wrong: the demo's calmer route is +0.6 min and 47 m, but nothing says what it avoids, so judges won't feel a difference. Fix: show what's avoided on the card, for example "avoids 120 m of Exposition Blvd".
- [ ] **P2 · "Neuro" in the name may label users.** Wrong: the PRD's social job is "not be labeled or have to explain myself". Fix: use Respite Finder or another neutral name.
- [ ] **P2 · High contrast resets on every visit.** Wrong: the setting isn't saved. Fix: save it on the device with the other preferences.
- [ ] **P2 · "Or choose a point on the map" only sets the start.** Fix: let it set the destination too.
- [ ] **P2 · README is Windows-only.** Wrong: paths like `C:\Users\ryany` and PowerShell-only steps. Fix: add Mac setup steps so every teammate can run it.

## Features to add

Build these in order for the demo; items 1 to 3 together show the PRD's thinking and Ryan's routing engine in the first 30 seconds.

**Demo-critical**

- [ ] **1. "Reset before class" mode.** Input: where I am, my next class, minutes I have. Run Ryan's router twice per candidate spot (here → spot, spot → class) to get time to rest and leave-by, then pick calmer or fastest to get there.
- [ ] **2. Scouted indoor spot library (sensing rung 0).** 5 to 10 spots with fixed tags: lighting, seating, noise, who can enter, indoor or outdoor, hours. Label them "Verified by scouts".
- [ ] **3. Class-change crowd estimate (sensing rung 1).** Busy around class-change times, labeled "Estimate". Needs no data and replaces the dead crowd slider.
- [ ] **4. One-tap "Somewhere calm, now".** Reuses remembered needs and next class.
- [ ] **5. Leave-by timer.** Silent or soft vibration, off by default.
- [ ] **6. "Need more support?" link.** Static and untracked.
- [ ] **7. Full low-sensory mode.** Muted palette, no motion, large text, saved on the device.

**Next (after the demo)**

- [ ] **8. "It was calm / it was packed" check-ins (sensing rung 2).** One tap, no account, no free text; reports fade after 30 to 60 minutes.
- [ ] **9. Hours and access notes.** Every card shows open hours and an access note; unknown access reads "Access unconfirmed".
- [ ] **10. Class schedule pasted once.** Stored on the device only, deletable in one tap.

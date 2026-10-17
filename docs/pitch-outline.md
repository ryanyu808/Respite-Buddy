# NeuroRoute pitch outline

1. **NeuroRoute — Find your calmer way.** Personalized walking choices for the USC campus.
2. **The problem.** Navigation commonly prioritizes speed. The shortest route can include roads or environments someone would prefer to avoid.
3. **Who it serves.** People with sensory sensitivities, neurodivergent students, and anyone who prefers a calmer walk. Needs differ; preferences stay individual.
4. **The solution.** Compare fastest and estimated calmer paths with editable sliders, clear time tradeoffs and an accessible map.
5. **How it works.** OpenStreetMap geography → geospatial proxy scoring → NetworkX candidate paths → optional AI preference interpretation and grounded explanation emphasis.
6. **Live demo.** Run the verified Rose Garden → Fisher Museum scenario. Compare actual paths, modify preferences and show the recalculated geometry. Use the two-minute demo script.
7. **Differentiation.** User-controlled sensory priorities, explicit detour bounds, transparent missing data, and an app that works without an AI key.
8. **Impact and next steps.** Conduct campus user studies, validate access points, gather consented environmental observations, and explore campus accessibility partnerships. Present these as future work, not existing partnerships.

## What the AI actually does

With a configured key, a model translates natural-language walking preferences into validated slider settings and selects an emphasis for explanations. Users confirm settings before rerouting. All facts and explanation prose are generated from server-computed metrics, which prevents invented geographic claims. The graph search itself is a conventional routing algorithm, not AI. Deterministic parsing and explanations keep the product functional without a model.

Do not claim measured crowd/noise reductions, clinical benefits, guaranteed quiet routes, fabricated testimonials or unsupported market-size statistics.

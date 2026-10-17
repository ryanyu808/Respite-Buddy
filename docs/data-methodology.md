# Data methodology

## Real geographic data

Source: OpenStreetMap contributors through the Overpass API, ODbL 1.0. The compact snapshot is in `backend/data/snapshot/`; `metadata.json` records its UTC retrieval timestamp, boundary and validation counts. Initial snapshot retrieved October 16, 2026 (Los Angeles local date).

Download boundary: west -118.298, south 34.010, east -118.277, north 34.032. This boundary covers USC University Park and nearby walking areas, not all Los Angeles. Original validated graph: 2,750 nodes, 7,550 directed edges, 31 weakly connected components, 102 excluded restricted edges. Simplification and runtime parallel-edge reduction change runtime edge counts.

There are 63 mapped parks, gardens or grass features, eight verified destination presets and 25 mapped potential rest stops. Presets use OSM node positions or representative points inside source polygons; each includes an OSM source URL. They are not verified public building entrances. Doheny Library was omitted because its name could not be matched, and the Coliseum was omitted because its mapped point was too far from a walking node.

## Static proxy estimates

All edge values are normalized to [0,1]. These are transparent heuristics, not learned or medically validated measurements.

| Component | Definition |
| --- | --- |
| Road class | motorway/trunk 1.0 (excluded from walking), primary .95, secondary .8, tertiary .6, unclassified .35, residential .3, service .2, living street .15, pedestrian .05, footway/path/steps .03; unknown .35 |
| Major-road proximity | `max(0, 1 - distance_m / 100)`, distance from the edge midpoint to separately retrieved mapped primary, secondary, tertiary or trunk geometry, including their link roads and vehicle-only roadways |
| Traffic proxy | Maximum of road-class value and `0.8 * major-road proximity` |
| Noise-related proxy | Maximum of road-class value and major-road proximity |
| Green proximity | `max(0, 1 - distance_m / 80)`, distance from the edge midpoint to a mapped park, garden, recreation ground or grass geometry |
| Crowd proxy | Unavailable; excluded from costs and scores |

Lengths use OSMnx's summed network segment lengths. Spatial proximity uses projected meter coordinates, not raw latitude/longitude differences. The snapshot includes 299 major-road context geometries; these affect nearby path scoring without overriding pedestrian access restrictions. Noise and traffic are correlated indicators; they should not be interpreted as independent evidence. Static green-space proximity does not imply shade, quietness, opening hours or access to the green space itself.

## Route scores and costs

For each edge, exposure is the weighted mean of noise, traffic and `1 - green proximity`, using the user's respective 0–100 sliders as weights. Missing green data is omitted, not replaced with a fabricated measurement. All available weights zero means score zero by definition, and the response explicitly explains this.

The displayed route score is `100 * sum(edge_length * edge_exposure) / sum(edge_length)`, rounded to a whole number. Lower means lower average modeled exposure under those preferences. Compare routes under the same settings; changing sliders changes what the score means. The percentage reduction uses unrounded scores, so it may not match arithmetic on rounded cards exactly.

Routing cost is `length * (1 + strength * sensitivity_magnitude * edge_exposure)`, with sensitivity magnitude the sum of available supported sliders divided by 300. Missing green data has no effect through either the average or penalty magnitude. Costs are always positive. Candidate strengths are .5, 1, 2, 4, 8, 16 and 32. The calmer candidate minimizes total modeled exposure burden (length times exposure), not merely the average score. Detour is constrained by distance relative to the fastest route. Duplicate paths are combined and no fake alternative is created.

Time assumes 4.8 km/h by default, configurable with `WALKING_SPEED_KPH` from 1–10. It does not include waiting at crossings, accessibility barriers, entrance offsets or live congestion.

## Missing data and use constraints

No measured sound levels, live crowd density, live traffic, lighting, real-time construction, shade or personal sensory stress data is integrated. No wheelchair accessibility guarantees are made. Surface/crossing tags are retained when present but not sufficient to certify step-free access. Explicit private/no access paths and construction/vehicle-only ways are removed; unmapped gates or campus restrictions can still exist. Follow posted signs.

Potential rest stops are mapped benches and parks with no explicit private/no access tag. No assumption of quietness is made. Unknown opening hours are displayed, and even mapped hours are unverified. Rest stops are optionally shown within approximately 200 m of vertices on the selected route; this is proximity, not proof of access from that route.

## Refresh and validation

Run `backend/scripts/prepare_map.py`, then `backend/scripts/verify_demo.py` and restart the backend. The preparation script checks node/edge counts, component count, walking access, positive finite lengths, geographic bounds and valid geometries. Tests additionally validate route geometry endpoints, weights, constraints and missing data. Overpass requests are cached in ignored `tmp/overpass-cache/`. Startup never downloads data. Basemap tiles still need internet access.

Attribution and reuse terms: see [data attribution](../backend/data/ATTRIBUTION.md).

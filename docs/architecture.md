# Architecture

NeuroRoute is a local React client and FastAPI service. No database, accounts or cloud infrastructure are required.

## Data preparation

`backend/scripts/prepare_map.py` downloads the USC-area OpenStreetMap walking network through OSMnx. It retains access, foot, surface, road class, name and crossing tags. It removes explicitly restricted or vehicle-only edges before simplifying the graph, downloads mapped green spaces and named features, and derives destination points from source geometries. Unverified or distant presets are omitted.

GeoPandas projects geometries into UTM zone 11N for meter-based spatial calculations. Major-road context is retrieved separately from walkable edges: a vehicle-only roadway can affect nearby exposure without ever becoming a permitted walking path. Each edge gets static noise, traffic and green-space proxy values. The script validates positive lengths, access and geometry, then stages GraphML, GeoJSON and JSON files before publishing them in `backend/data/snapshot/`. Download or validation failures leave the existing snapshot intact. The compact real snapshot is versioned so a fresh checkout can route without an Overpass connection.

## Runtime

FastAPI loads the snapshot once at startup. The multigraph is reduced to a simple undirected walking graph, retaining the shortest permitted edge for each node pair and its actual geometry. This makes bounded candidate generation inexpensive; it can omit a longer parallel edge with better sensory properties. Restricted edges are filtered again at load time. Missing cache produces a setup-required health state and HTTP 503 for routes, never fictional data.

Start/end points snap to walking nodes within 120 m. The route response discloses both offsets; they are not validated entrance paths and are excluded from distance/time. Same-node, disconnected and distant selections return helpful HTTP 422 responses.

## Candidate routes

NetworkX finds the shortest distance path and seven paths with progressively stronger positive exposure penalties. Up to four path-penalized searches add diversity. Candidate generation is bounded; no exhaustive simple-path enumeration is performed. Paths exceeding the optional detour limit are rejected. The calmer role minimizes total distance-integrated weighted exposure among feasible candidates; the balanced role minimizes an intermediate distance-plus-exposure cost. Routes with edge-set Jaccard similarity at least 0.94 are combined, retaining multiple roles.

This is a deterministic heuristic candidate search, not a proof of the global constrained optimum. The selected walking priority determines which role is recommended. With zero supported sensitivity weights, routing reduces to shortest distance. Crowd weights currently have no effect.

## Client and API

- React/TypeScript/Vite, Tailwind CSS and custom styles implement the responsive shell.
- React Leaflet renders actual route geometries, mapped green features, snap markers and optional potential rest stops.
- A Vite development proxy forwards `/api` to `127.0.0.1:8000`.
- Pydantic validates points, preferences, route results and assistant results.
- Preferences alone persist in localStorage. Changing inputs clears outdated routes. Request sequence checks prevent late responses from restoring obsolete results.
- API endpoints include health, map metadata/features, locations, verified demo scenarios, routes, rest stops, preference interpretation and explanations. OpenAPI is available at `/docs` on the backend.

## AI grounding

`ai_service.py` optionally calls the OpenAI Responses API with a strict JSON schema, a 12-second timeout and `store: false`. The model is configurable with `OPENAI_MODEL`; the key stays on the backend. Parsed output is independently checked by Pydantic and must stay within supported preference ranges. The user reviews and confirms changes before routing recalculates.

The explanation endpoint recomputes the route on the server, so it does not trust client-submitted metrics. An optional model chooses an allowed emphasis enum; all prose and numbers are rendered from computed facts. This deliberately prevents fabricated route metrics, places or measurements. Failed or absent AI calls use rule-based parsing and deterministic explanations. The interface labels the active mode.

Reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OSMnx reference](https://osmnx.readthedocs.io/en/stable/user-reference.html).

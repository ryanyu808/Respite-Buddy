"""Export the frontend's offline fallback from the real API.

The site opens on this bundled data and swaps in live data once the backend answers.
Route results are recorded from the router itself, so the demo matches what the live
backend returns. Rerun after changing the snapshot, the router, or the presets:

    python scripts/export_fallback.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "fallback.json"

# Mirrors PRESETS in frontend/src/preferences.ts. The default start/destination pair is
# recorded under every preset so preset changes still work while the backend is down.
DEFAULTS = {"noise": 70, "crowds": 50, "traffic": 70, "green": 60, "pace": "balanced", "max_detour": 30}
PRESETS = [
    DEFAULTS,
    {**DEFAULTS, "noise": 100, "traffic": 90, "green": 50, "pace": "calmest"},
    {**DEFAULTS, "noise": 40, "traffic": 50, "green": 100, "pace": "calmest"},
    {**DEFAULTS, "noise": 0, "traffic": 0, "green": 0, "pace": "fastest", "max_detour": 10},
]
DEFAULT_ORIGIN, DEFAULT_DESTINATION = "USC Village", "Leavey Library"


def point(location):
    return {k: location[k] for k in ("lat", "lon", "name")}


def main():
    with TestClient(app) as client:
        get = lambda path: client.get(f"/api{path}").raise_for_status().json()
        locations = get("/locations")
        demos = get("/demo-scenarios")
        by_name = {l["name"]: l for l in locations}
        requests = [{"origin": point(by_name[DEFAULT_ORIGIN]), "destination": point(by_name[DEFAULT_DESTINATION]), "preferences": p} for p in PRESETS]
        requests += [{"origin": point(d["origin"]), "destination": point(d["destination"]), "preferences": d["preferences"]} for d in demos]
        routes = [{"request": r, "response": client.post("/api/routes", json=r).raise_for_status().json()} for r in requests]
        fallback = {
            "locations": locations,
            "metadata": get("/map/metadata"),
            "stops": get("/rest-stops"),
            "features": get("/map/features"),
            "demos": demos,
            "routes": routes,
        }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fallback, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(routes)} saved routes)")


if __name__ == "__main__":
    main()

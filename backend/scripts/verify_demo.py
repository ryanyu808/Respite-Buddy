"""Verify real preset pairs and publish reproducible demonstration scenarios."""
import json
import sys
from itertools import combinations
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.models import Point, Preferences, RouteRequest
from app.services.geographic_data import MapData, DATA_DIR
from app.services.routing import Router


def verify():
    data = MapData()
    if data.graph is None:
        raise RuntimeError(data.metadata)
    router = Router(data)
    scenarios = []
    preferences = Preferences(noise=95, traffic=95, green=85, pace="calmest", max_detour=30)
    for a, b in combinations(data.locations, 2):
        request = RouteRequest(origin=Point(**{k: a[k] for k in ("lat", "lon", "name")}), destination=Point(**{k: b[k] for k in ("lat", "lon", "name")}), preferences=preferences)
        try:
            result = router.calculate(request)
        except ValueError:
            continue
        if len(result.routes) < 2 or result.routes[0].distance_m < 300:
            continue
        calmer = next(r for r in result.routes if "calmer" in r.roles)
        if calmer.reduction_pct >= 5:
            scenarios.append({"origin": a, "destination": b, "preferences": preferences.model_dump(),
                              "fastest_m": result.routes[0].distance_m, "calmer_m": calmer.distance_m,
                              "reduction_pct": calmer.reduction_pct, "extra_minutes": calmer.extra_minutes,
                              "detour_pct": calmer.detour_pct})
    scenarios.sort(key=lambda s: s["reduction_pct"], reverse=True)
    scenarios = scenarios[:3]
    (DATA_DIR / "demo-scenarios.json").write_text(json.dumps(scenarios, indent=2), encoding="utf-8")
    print(json.dumps(scenarios, indent=2))
    assert len(scenarios) >= 3, "Fewer than three distinct scenarios available; document this limitation."


if __name__ == "__main__":
    verify()

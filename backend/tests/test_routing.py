import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import networkx as nx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from shapely.geometry import LineString
from app.models import Preferences, Point, RouteRequest, PreferenceRequest
from app.services.geographic_data import MapData
from app.services.routing import Router
from app.services.sensory_scoring import cost, walkable
from app.services.ai_service import interpret
from app.main import app


@pytest.fixture
def data():
    data = MapData.__new__(MapData)
    data.graph = nx.Graph()
    data.metadata = {"available": True, "features": {"crowds": False}}
    data.locations, data.stops = [], []
    for node, (x, y) in enumerate([(-118.29, 34.02), (-118.289, 34.02), (-118.288, 34.02), (-118.289, 34.021), (-118.287, 34.021)]):
        data.graph.add_node(node, x=x, y=y)
    for u, v, length, proxy in [(0, 1, 100, .9), (1, 2, 100, .9), (0, 3, 120, .1), (3, 2, 120, .1)]:
        a, b = data.graph.nodes[u], data.graph.nodes[v]
        data.graph.add_edge(u, v, length=length, noise=proxy, traffic=proxy, green=1 - proxy,
                            major=proxy > .5, highway="footway", geometry=LineString([(a["x"], a["y"]), (b["x"], b["y"])]))
    return data


def request(**changes):
    return RouteRequest(origin=Point(lat=34.02, lon=-118.29), destination=Point(lat=34.02, lon=-118.288), preferences=Preferences(**changes))


def test_shortest_and_calmer(data):
    result = Router(data).calculate(request(max_detour=20))
    assert result.routes[0].distance_m == 200
    calmer = next(r for r in result.routes if "calmer" in r.roles)
    assert calmer.distance_m == 240
    assert calmer.exposure < result.routes[0].exposure
    assert calmer.reduction_pct > 0
    assert calmer.geometry.coordinates[0] == [-118.29, 34.02]
    assert calmer.geometry.coordinates[-1] == [-118.288, 34.02]
    assert calmer.extra_minutes == .5


def test_detour_constraint(data):
    result = Router(data).calculate(request(max_detour=10))
    assert len(result.routes) == 1
    assert result.routes[0].roles == ["fastest", "calmer", "balanced"]
    assert all(r.distance_m <= 220 for r in result.routes)


def test_zero_sensitivity_returns_shortest(data):
    result = Router(data).calculate(request(noise=0, traffic=0, green=0))
    assert len(result.routes) == 1
    assert result.routes[0].exposure == 0


def test_weights_positive_and_monotone(data):
    noisy = data.graph[0][1]
    low = cost(noisy, Preferences(noise=0, traffic=0, green=0))
    high = cost(noisy, Preferences(noise=100, traffic=100, green=100))
    assert high > low > 0
    assert high > cost(data.graph[0][3], Preferences(noise=100, traffic=100, green=100))


def test_identical_location(data):
    r = request()
    r.destination = r.origin
    with pytest.raises(ValueError, match="same walking point"):
        Router(data).calculate(r)


def test_outside_network(data):
    r = request()
    r.origin = Point(lat=35, lon=-118)
    with pytest.raises(ValueError, match="120 meters"):
        Router(data).calculate(r)


def test_disconnected(data):
    r = request()
    r.destination = Point(lat=34.021, lon=-118.287)
    with pytest.raises(ValueError, match="disconnected"):
        Router(data).calculate(r)


def test_missing_green_data(data):
    for _, _, edge in data.graph.edges(data=True):
        del edge["green"]
    result = Router(data).calculate(request())
    assert all(r.breakdown.green is None and r.breakdown.crowds is None for r in result.routes)
    edge = data.graph[0][1]
    assert cost(edge, Preferences(green=0)) == cost(edge, Preferences(green=100))


def test_corrupt_cache_returns_setup_state(tmp_path):
    (tmp_path / "metadata.json").write_text("{bad json}", encoding="utf-8")
    assert MapData(tmp_path).graph is None


def test_missing_cache(tmp_path):
    data = MapData(tmp_path)
    assert data.graph is None
    assert "cache missing" in data.metadata["setup_error"]


def test_crowd_sensitivity_has_no_unsupported_effect(data):
    assert Router(data).calculate(request(crowds=0)).model_dump() == Router(data).calculate(request(crowds=100)).model_dump()


def test_missing_cache_routes_return_setup_error(tmp_path):
    with TestClient(app) as client:
        app.state.data = MapData(tmp_path)
        assert client.get("/api/health").json()["status"] == "setup_required"
        response = client.post("/api/routes", json=request().model_dump())
        assert response.status_code == 503
        assert "cache missing" in response.json()["detail"]


@pytest.mark.parametrize("value", [-1, 101])
def test_invalid_preferences(value):
    with pytest.raises(ValidationError):
        Preferences(noise=value)


@pytest.mark.parametrize("edge", [{"access": "private"}, {"foot": "no"}, {"access": ["yes", "private"]}, {"highway": "construction"}])
def test_restricted_edges(edge):
    assert not walkable(edge)


def test_determinism(data):
    assert Router(data).calculate(request()).model_dump() == Router(data).calculate(request()).model_dump()


def test_fallback(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = interpret(PreferenceRequest(text="I don't mind traffic but prefer quiet parks and a few extra minutes"))
    assert result.mode == "rule-based"
    assert result.preferences.noise == 90
    assert result.preferences.traffic == 15
    assert result.preferences.green == 90
    assert result.preferences.pace == "calmest"


def test_unknown_preference_keeps_current(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    current = Preferences(noise=21)
    result = interpret(PreferenceRequest(text="hello", current=current))
    assert result.preferences == current
    assert "No supported" in result.notes[-1]


def test_endpoints(data, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(app) as client:
        app.state.data = data
        assert client.get("/api/health").json()["graph_loaded"]
        assert client.post("/api/routes", json=request().model_dump()).status_code == 200
        assert client.post("/api/routes", json={}).status_code == 422
        assert client.post("/api/routes", json={**request().model_dump(), "preferences": {"noise": 101}}).status_code == 422
        response = client.post("/api/ai/explain", json={"request": request().model_dump(), "route_id": "calmer"})
        assert response.status_code == 200
        assert response.json()["mode"] == "rule-based"
        assert "240" not in response.json()["explanation"] or "0.24" in response.json()["explanation"]


def test_actual_snapshot():
    data = MapData()
    assert data.graph is not None, data.metadata
    assert len(data.locations) >= 3
    assert all(walkable(d) and d["length"] > 0 and d["geometry"].is_valid for _, _, d in data.graph.edges(data=True))
    assert all(0 <= d["traffic"] <= 1 and 0 <= d["noise"] <= 1 for _, _, d in data.graph.edges(data=True))
    assert any(d["major"] for _, _, d in data.graph.edges(data=True))
    assert any(not d["major"] for _, _, d in data.graph.edges(data=True))

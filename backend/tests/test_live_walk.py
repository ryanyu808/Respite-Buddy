"""The reported production trip must work against the checked-in real graph."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware
from app.main import app, frontend_origins


def test_alumni_to_leavey_with_production_cors(monkeypatch):
    origin = 'https://respite-buddy.vercel.app'
    monkeypatch.setenv('FRONTEND_URL', origin)
    allowed = frontend_origins()
    assert 'http://localhost:5173' in allowed
    assert 'http://127.0.0.1:5173' in allowed
    # Use the same environment-derived policy without changing global app middleware.
    wrapped = CORSMiddleware(app, allow_origins=allowed,
                             allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
    with TestClient(wrapped) as client:
        headers = {'Origin': origin}
        health = client.get('/api/health', headers=headers)
        assert health.status_code == 200
        assert health.json()['graph_loaded'] is True
        assert health.headers['access-control-allow-origin'] == origin
        preflight = client.options('/api/routes', headers={**headers,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'})
        assert preflight.status_code == 200
        assert preflight.headers['access-control-allow-origin'] == origin
        locations = client.get('/api/locations').json()
        start = next(place for place in locations if place['name'] == 'Alumni Park')
        end = next(place for place in locations if place['name'] == 'Leavey Library')
        point = lambda place: {key: place[key] for key in ('lat', 'lon', 'name')}
        response = client.post('/api/routes', headers=headers, json={
            'origin': point(start), 'destination': point(end)})
        assert response.status_code == 200, response.text
        assert response.headers['access-control-allow-origin'] == origin
        routes = response.json()['routes']
        assert routes
        assert all(route['distance_m'] > 0 and route['duration_min'] > 0 for route in routes)
        assert all(len(route['geometry']['coordinates']) >= 2 for route in routes)

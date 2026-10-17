"""The frontend's bundled fallback must match what the live router returns."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app.main import app

FALLBACK = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "fallback.json"


def test_saved_routes_match_router():
    fallback = json.loads(FALLBACK.read_text(encoding="utf-8"))
    assert fallback["routes"], "Run scripts/export_fallback.py"
    with TestClient(app) as client:
        assert fallback["locations"] == client.get("/api/locations").json()
        assert fallback["demos"] == client.get("/api/demo-scenarios").json()
        for saved in fallback["routes"]:
            assert saved["response"] == client.post("/api/routes", json=saved["request"]).json(), \
                "Fallback is stale. Run scripts/export_fallback.py"

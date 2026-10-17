from contextlib import asynccontextmanager
from pathlib import Path
import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .models import RouteRequest, RouteResponse, PreferenceRequest, PreferenceResponse, ExplainRequest, ExplainResponse, Location, RestStop
from .services.geographic_data import MapData, DATA_DIR
from .services.routing import Router
from .services.ai_service import interpret, route_explanation

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@asynccontextmanager
async def lifespan(app):
    app.state.data = MapData()
    yield


app = FastAPI(title="NeuroRoute", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class Health(BaseModel):
    status: str
    graph_loaded: bool
    ai_available: bool
    features: dict[str, bool]


@app.get("/api/health", response_model=Health)
def health():
    data = app.state.data
    return Health(status="ok" if data.graph is not None else "setup_required", graph_loaded=data.graph is not None, ai_available=bool(os.getenv("OPENAI_API_KEY")), features=data.metadata.get("features", {}))


@app.get("/api/locations", response_model=list[Location])
def locations():
    return app.state.data.locations


@app.get("/api/map/metadata")
def metadata():
    return app.state.data.metadata


@app.get("/api/map/features")
def features():
    return app.state.data.features


@app.get("/api/demo-scenarios")
def demo_scenarios():
    try:
        return json.loads((DATA_DIR / "demo-scenarios.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


@app.get("/api/rest-stops", response_model=list[RestStop])
def rest_stops():
    return app.state.data.stops


def calculate(request):
    if app.state.data.graph is None:
        raise HTTPException(503, app.state.data.metadata["setup_error"])
    try:
        return Router(app.state.data).calculate(request)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/routes", response_model=RouteResponse)
def routes(request: RouteRequest):
    return calculate(request)


@app.post("/api/ai/preferences", response_model=PreferenceResponse)
def preferences(request: PreferenceRequest):
    return interpret(request)


@app.post("/api/ai/explain", response_model=ExplainResponse)
def explanation(request: ExplainRequest):
    # Recompute server-side rather than trusting client-provided metrics.
    result = calculate(request.request)
    route = next((r for r in result.routes if r.id == request.route_id), None)
    if route is None:
        raise HTTPException(404, "Route not found. Recalculate your routes.")
    return route_explanation(route, result.routes[0])

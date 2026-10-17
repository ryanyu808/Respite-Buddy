from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    noise: int = Field(default=70, ge=0, le=100)
    crowds: int = Field(default=50, ge=0, le=100)
    traffic: int = Field(default=70, ge=0, le=100)
    green: int = Field(default=60, ge=0, le=100)
    pace: Literal["fastest", "balanced", "calmest"] = "balanced"
    max_detour: Literal[10, 20, 30] | None = 30


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: str = Field(default="Map selection", max_length=160)


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin: Point
    destination: Point
    preferences: Preferences = Field(default_factory=Preferences)


class PreferenceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    current: Preferences = Field(default_factory=Preferences)


class PreferenceResponse(BaseModel):
    preferences: Preferences
    explanation: str
    mode: Literal["rule-based", "AI-assisted"]
    notes: list[str]


class LineGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class Breakdown(BaseModel):
    noise: int
    traffic: int
    crowds: int | None = None
    green: int | None = None


class RouteResult(BaseModel):
    id: str
    name: str
    roles: list[str]
    distance_m: float
    duration_min: float
    exposure: int
    breakdown: Breakdown
    major_road_m: float
    extra_minutes: float
    reduction_pct: float
    detour_pct: float
    confidence: str
    geometry: LineGeometry
    streets: list[str]
    explanation: str


class RouteResponse(BaseModel):
    routes: list[RouteResult]
    recommended_id: str
    notes: list[str]
    snapped_origin: Point
    snapped_destination: Point
    origin_snap_m: float
    destination_snap_m: float
    explanation_mode: str = "rule-based"


class ExplainRequest(BaseModel):
    request: RouteRequest
    route_id: str = Field(max_length=40)


class ExplainResponse(BaseModel):
    explanation: str
    mode: str


class Location(Point):
    id: str
    osm_url: str


class RestStop(Point):
    id: str
    kind: str
    opening_hours: str | None
    osm_url: str

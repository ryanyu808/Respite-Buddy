"""Real MCP protocol tests over mounted Streamable HTTP, without network services."""

from contextlib import asynccontextmanager
from datetime import datetime
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import anyio
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel
import pytest
from starlette.applications import Starlette
from starlette.routing import Mount

from app import mcp_server
from app.respite_models import PlanDayRequest, ResetRequest, Spot, SwapRequest
from app.services.geographic_data import MapData


SUPPORT = "Need more support? USC student counseling: https://studenthealth.usc.edu/mental-health-and-well-being/"
CLASSES = [
    {"location": "Leavey", "start": "2026-10-19T12:00:00-07:00", "end": "2026-10-19T13:00:00-07:00"},
    {"location": "TCC", "start": "2026-10-19T14:00:00-07:00", "end": "2026-10-19T15:00:00-07:00"},
]


def fixture_spot(**changes):
    fields = {name: None for name in Spot.model_fields}
    fields.update(
        id="fixture-spot", name="MCP test fixture", lat=34.02, lng=-118.29,
        source_url="https://example.test/fixture", data_kind="scouted", purpose="general",
    )
    return Spot.model_validate({**fields, **changes})


def mounted_app(server):
    @asynccontextmanager
    async def lifespan(app):
        async with server.session_manager.run():
            yield

    return Starlette(routes=[Mount("/mcp", server.streamable_http_app())], lifespan=lifespan)


@asynccontextmanager
async def protocol(server):
    app = mounted_app(server)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app)) as client:
            async with streamable_http_client("http://localhost/mcp/", http_client=client) as (read, write, session_id):
                async with ClientSession(read, write) as session:
                    initialized = await session.initialize()
                    assert initialized.serverInfo.name == "Respite Buddy"
                    assert session_id() is None  # Stateless HTTP has no persisted session.
                    yield session


def payload(result, *, error=False):
    assert result.isError is error
    assert result.structuredContent["support"] == SUPPORT
    assert json.loads(result.content[0].text) == result.structuredContent
    return result.structuredContent


class StubResponse(BaseModel):
    recommendations: list[dict]
    evaluated_at: datetime
    notes: list[str]


@pytest.fixture
def stub(monkeypatch):
    class Engine:
        def __init__(self, data):
            self.data = data
            self.calls = []
            self.failure = None

        def run(self, method, request):
            self.calls.append((method, request))
            if self.failure:
                raise self.failure
            if method == "plan_day":
                return {"gaps": [], "mode": "demo"}
            if method == "details":
                return self.spot
            return StubResponse(
                recommendations=[{"deep_link": "https://neuro-route-nine.vercel.app/?to=fixture-spot"}],
                evaluated_at=datetime.fromisoformat("2026-10-19T13:00:00-07:00"),
                notes=["Crowd information unavailable."],
            )

        def recommend(self, request):
            return self.run("recommend", request)

        def swap(self, request):
            return self.run("swap", request)

        def plan_day(self, request):
            return self.run("plan_day", request)

        def details(self, id, demo=False):
            return self.run("details", (id, demo))

    engine = Engine(object())
    engine.spot = fixture_spot()
    monkeypatch.setattr(mcp_server, "RespiteEngine", lambda data: engine)
    return engine, mcp_server.create_mcp(engine.data)


def test_protocol_discovery_and_canonical_schemas(stub):
    _, server = stub
    assert isinstance(server, FastMCP)
    assert server.settings.streamable_http_path == "/"
    assert server.settings.stateless_http and server.settings.json_response

    async def check():
        async with protocol(server) as session:
            tools = {tool.name: tool for tool in (await session.list_tools()).tools}
            assert set(tools) == {"find_reset_spots", "swap_spot", "plan_day", "get_spot_details"}
            for name, model in [("find_reset_spots", ResetRequest), ("swap_spot", SwapRequest), ("plan_day", PlanDayRequest)]:
                assert tools[name].inputSchema == model.model_json_schema()
                assert tools[name].annotations.readOnlyHint is True
            assert tools["find_reset_spots"].inputSchema["properties"]["near"]["default"] == "Leavey"
            assert tools["find_reset_spots"].inputSchema["properties"]["minutes"]["default"] == 15
            assert tools["get_spot_details"].inputSchema["required"] == ["id"]

    anyio.run(check)


@pytest.mark.parametrize(("name", "arguments", "method", "request_type"), [
    ("find_reset_spots", {}, "recommend", ResetRequest),
    ("swap_spot", {"request": {"near": "Leavey", "demo": True}, "spot_id": "fixture-spot", "reason": "locked"}, "swap", SwapRequest),
    ("plan_day", {"classes": CLASSES, "needs": ["quiet"], "demo": True, "usc_id": True}, "plan_day", PlanDayRequest),
    ("get_spot_details", {"id": "fixture-spot", "demo": True}, "details", None),
])
def test_protocol_tool_calls_delegate_without_changing_results(stub, name, arguments, method, request_type):
    engine, server = stub

    async def check():
        async with protocol(server) as session:
            result = payload(await session.call_tool(name, arguments))
            actual_method, request = engine.calls[-1]
            assert actual_method == method
            if request_type:
                assert isinstance(request, request_type)
                assert request == request_type.model_validate(arguments)
            else:
                assert request == ("fixture-spot", True)
                assert result["hours"] is None and result["verified_by"] is None
            if method in {"recommend", "swap"}:
                assert result["evaluated_at"] == "2026-10-19T13:00:00-07:00"
                assert result["recommendations"][0]["deep_link"].endswith("?to=fixture-spot")
                assert result["notes"] == ["Crowd information unavailable."]

    anyio.run(check)


def test_points_times_and_exclusions_pass_to_shared_models(stub):
    engine, server = stub
    arguments = {
        "near": {"lat": 34.02, "lon": -118.29}, "next_class": "TCC", "minutes": 20,
        "needs": ["quiet", "seated"], "demo": True, "demo_time": "2026-10-19T13:00:00-07:00",
        "usc_id": True, "exclusions": [{"spot_id": "fixture-spot", "until": "2026-10-19T13:45:00-07:00"}],
    }

    async def check():
        async with protocol(server) as session:
            payload(await session.call_tool("find_reset_spots", arguments))
            assert engine.calls[-1][1] == ResetRequest.model_validate(arguments)

    anyio.run(check)


@pytest.mark.parametrize(("attributes", "demo", "verified", "category"), [
    ({"typical_crowd": "few", "verified_by": "Test fixture scout", "verified_date": "2026-10-01"}, False, True, "few"),
    ({"typical_crowd": "many"}, False, False, None),
    ({"typical_crowd": "few", "data_kind": "illustrative"}, True, False, None),
])
def test_details_explicit_provenance_verification_and_limitations(stub, attributes, demo, verified, category):
    engine, server = stub
    engine.spot = fixture_spot(**attributes)

    async def check():
        async with protocol(server) as session:
            result = payload(await session.call_tool("get_spot_details", {"id": "fixture-spot", "demo": demo}))
            assert result["verification_status"] == ("Verified by scouts" if verified else "Not verified by scouts")
            assert result["crowd"]["category"] == category
            assert result["crowd"]["source"] == ("Verified by scouts" if category else None)
            if category:
                assert result["crowd"]["observed_at"].startswith("2026-10-01")
            else:
                assert result["crowd"]["observed_at"] is None
                assert "Crowd information unavailable." in result["limitations"]
            assert "Opening hours unconfirmed." in result["limitations"]
            assert "Access unconfirmed." in result["limitations"]
            assert "Step-free access unconfirmed." in result["limitations"]
            assert "This spot is not verified safe after dark." in result["limitations"]

    anyio.run(check)


def test_unknown_tool_has_footer_and_protocol_remains_usable(stub):
    _, server = stub

    async def check():
        async with protocol(server) as session:
            result = payload(await session.call_tool("not_a_tool", {}), error=True)
            assert result["error"]["code"] == "unknown_tool"
            payload(await session.call_tool("find_reset_spots", {}))

    anyio.run(check)


@pytest.mark.parametrize(("name", "arguments"), [
    ("find_reset_spots", {"minutes": 0}),
    ("find_reset_spots", {"needs": ["invented"]}),
    ("find_reset_spots", {"needs": ["indoor", "outdoor"]}),
    ("find_reset_spots", {"near": {"lat": 999, "lon": -118.29}}),
    ("find_reset_spots", {"now": "2026-10-19T13:00:00"}),
    ("find_reset_spots", {"demo_time": "2026-10-19T13:00:00-07:00"}),
    ("find_reset_spots", {"unexpected": "private schedule secret"}),
    ("swap_spot", {"spot_id": "fixture-spot"}),
    ("swap_spot", {"request": {}, "spot_id": "fixture-spot", "reason": "invented"}),
    ("plan_day", {"classes": []}),
    ("plan_day", {"classes": [{"location": "private schedule secret", "start": "bad", "end": "bad"}]}),
    ("get_spot_details", {}),
    ("get_spot_details", {"id": ""}),
])
def test_invalid_arguments_are_structured_private_errors(stub, name, arguments, caplog):
    engine, server = stub

    async def check():
        async with protocol(server) as session:
            result = payload(await session.call_tool(name, arguments), error=True)
            assert result["error"]["code"] == "invalid_arguments"
            assert "private schedule secret" not in json.dumps(result)
            assert engine.calls == []

    anyio.run(check)
    assert "private schedule secret" not in caplog.text


@pytest.mark.parametrize(("failure", "code"), [
    (ValueError("private schedule secret"), "invalid_request"),
    (KeyError("private schedule secret"), "not_found"),
    (FileNotFoundError("private schedule secret"), "data_unavailable"),
    (RuntimeError("private schedule secret"), "data_unavailable"),
    (TypeError("private schedule secret"), "internal_error"),
])
def test_engine_failures_do_not_leak_private_details(stub, failure, code, caplog):
    engine, server = stub
    engine.failure = failure

    async def check():
        async with protocol(server) as session:
            result = payload(await session.call_tool("find_reset_spots", {}), error=True)
            assert result["error"]["code"] == code
            assert "private schedule secret" not in json.dumps(result)

    anyio.run(check)
    assert "private schedule secret" not in caplog.text


@pytest.mark.parametrize(("host", "origin", "status"), [
    ("neuroroute.onrender.com", None, 200),
    ("neuroroute.onrender.com:443", "https://neuroroute.onrender.com", 200),
    ("localhost:8000", "http://localhost:5173", 200),
    ("127.0.0.1:8000", None, 200),
    ("[::1]:8000", None, 200),
    ("attacker.example", None, 421),
    ("neuroroute.onrender.com.attacker.example", None, 421),
    ("localhost", "https://attacker.example", 403),
])
def test_transport_dns_rebinding_protection(stub, host, origin, status):
    _, server = stub
    app = mounted_app(server)

    async def check():
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app)) as client:
                headers = {"host": host, "accept": "application/json, text/event-stream"}
                if origin:
                    headers["origin"] = origin
                response = await client.post("http://localhost/mcp/", headers=headers, json={
                    "jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
                })
                assert response.status_code == status
                if status == 200:
                    assert response.headers["content-type"].startswith("application/json")
                    assert "mcp-session-id" not in response.headers

    anyio.run(check)


@pytest.fixture(scope="module")
def campus():
    data = MapData()
    assert data.graph is not None, "The checked-in geographic snapshot must load for MCP integration tests."
    return data


def test_real_engine_demo_links_swap_plan_details_and_after_dark(campus):
    server = mcp_server.create_mcp(campus)

    async def check():
        async with protocol(server) as session:
            arguments = {"near": "Leavey", "minutes": 30, "needs": ["quiet"], "demo": True}
            first = payload(await session.call_tool("find_reset_spots", arguments))
            assert first["mode"] == "demo" and 1 <= len(first["recommendations"]) <= 3
            again = payload(await session.call_tool("find_reset_spots", arguments))
            assert again == first
            spot = first["recommendations"][0]["spot"]
            link = urlparse(first["recommendations"][0]["deep_link"])
            assert link.scheme == "https" and parse_qs(link.query)["to"] == [spot["id"]]
            onward = payload(await session.call_tool("find_reset_spots", {**arguments, "next_class": "TCC"}))
            assert onward["recommendations"]
            for item in onward["recommendations"]:
                query = parse_qs(urlparse(item["deep_link"]).query)
                next_class = onward["next_class"]
                assert query["next"] == [f'{next_class["lat"]},{next_class["lon"]}']
                assert set(query) <= {"to", "from", "next", "minutes", "needs", "demo"}
                assert item["walk_to_class_min"] is not None and item["route_to_class"] is not None
            details = payload(await session.call_tool("get_spot_details", {"id": spot["id"], "demo": True}))
            assert details["id"] == spot["id"] and details["data_kind"] == "illustrative"
            assert details["verified_by"] is None
            swapped = payload(await session.call_tool("swap_spot", {"request": arguments, "spot_id": spot["id"], "reason": "full"}))
            assert all(item["spot"]["id"] != spot["id"] for item in swapped["recommendations"])
            assert swapped["exclusions"][0]["spot_id"] == spot["id"]
            followup = payload(await session.call_tool("find_reset_spots", {**arguments, "exclusions": swapped["exclusions"]}))
            assert followup["recommendations"] == swapped["recommendations"]
            independent = payload(await session.call_tool("find_reset_spots", arguments))
            assert independent == first  # No global or server-session demotion.
            day = payload(await session.call_tool("plan_day", {"classes": CLASSES, "demo": True}))
            assert len(day["gaps"]) == 1
            dark = payload(await session.call_tool("find_reset_spots", {**arguments, "demo_time": "2026-10-19T21:00:00-07:00"}))
            assert dark["recommendations"] == []
            live = payload(await session.call_tool("find_reset_spots", {"now": "2026-10-19T13:00:00-07:00"}))
            assert live["mode"] == "live"

    anyio.run(check)


def test_missing_geographic_data_unknown_location_and_spot(campus):
    missing = SimpleNamespace(graph=None, locations=[], stops=[], metadata={})

    async def check():
        for data, name, arguments in [
            (missing, "find_reset_spots", {}),
            (campus, "find_reset_spots", {"near": "not-a-supported-campus-building"}),
            (campus, "get_spot_details", {"id": "does-not-exist"}),
        ]:
            async with protocol(mcp_server.create_mcp(data)) as session:
                payload(await session.call_tool(name, arguments), error=True)

    anyio.run(check)


def test_actual_fastapi_parent_protocol_and_mount_cleanup_across_two_lifecycles():
    from app.main import app

    async def check():
        original_routes = list(app.routes)
        for _ in range(2):
            async with app.router.lifespan_context(app):
                assert sum(getattr(route, "path", None) == "/mcp" for route in app.routes) == 1
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app)) as client:
                    health = await client.get("http://localhost/api/health")
                    assert health.status_code == 200 and health.json()["graph_loaded"]
                    async with streamable_http_client("http://localhost/mcp/", http_client=client) as (read, write, _):
                        async with ClientSession(read, write) as session:
                            await session.initialize()
                            assert len((await session.list_tools()).tools) == 4
                            result = payload(await session.call_tool("find_reset_spots", {"demo": True, "minutes": 30}))
                            assert result["mode"] == "demo" and result["recommendations"]
            assert app.routes == original_routes

    anyio.run(check)

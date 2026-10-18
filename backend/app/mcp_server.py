"""Streamable HTTP MCP adapter for the shared Respite Buddy engine.

The parent ASGI app must mount ``streamable_http_app()`` at ``/mcp`` and
enter ``session_manager.run()`` in its lifespan. See docs/mcp.md.
"""

from collections.abc import Callable
from inspect import Parameter, Signature
import json
from typing import Any

from anyio import to_thread
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .respite_models import PlanDayRequest, ResetRequest, SwapRequest
from .services.respite import RespiteEngine, SUPPORT


def _result(payload: dict[str, Any], *, error: bool = False) -> CallToolResult:
    payload = {**payload, "support": SUPPORT}
    return CallToolResult(
        isError=error,
        structuredContent=payload,
        content=[TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))],
    )


def _error(code: str, message: str, **details: Any) -> CallToolResult:
    return _result({"error": {"code": code, "message": message, **details}}, error=True)


def _invalid(exc: ValidationError) -> CallToolResult:
    # Do not echo input values, validator messages, or schedules into responses/logs.
    fields = [
        {"field": ".".join(map(str, item["loc"])), "type": item["type"]}
        for item in exc.errors(include_input=False, include_context=False, include_url=False)
    ]
    return _error("invalid_arguments", "Check the tool arguments and try again.", fields=fields)


def _spot_details(engine: RespiteEngine, request: Any) -> dict[str, Any]:
    # This shared helper also supplies recommendation crowd provenance. Details
    # must not infer a live crowd level from a bare typical_crowd attribute.
    from .services.respite import crowd_for_spot

    spot = engine.details(request.id, demo=request.demo)
    crowd = crowd_for_spot(spot, demo=request.demo)
    verified = bool(
        not request.demo and spot.data_kind == "scouted" and spot.verified_by and spot.verified_date
    )
    limitations = [
        "Crowd category is a dated typical-condition note, not live occupancy."
        if crowd.category is not None else "Crowd information unavailable."
    ]
    if crowd.observed_at is not None:
        limitations.append("Crowd timestamp uses the verification date; the exact observation time is unavailable.")
    if not verified:
        limitations.append("This spot has no verified scout record for this response.")
    if request.demo or spot.data_kind == "illustrative":
        limitations.append("DEMONSTRATION: sample attributes are illustrative; confirm actual conditions before visiting.")
    if spot.hours is None:
        limitations.append("Opening hours unconfirmed.")
    elif len(spot.hours) < 7:
        limitations.append("Opening hours are unknown for days missing from the record.")
    if spot.access is None:
        limitations.append("Access unconfirmed.")
    elif spot.access == "restricted":
        limitations.append("Access is restricted; this record does not grant entry.")
    elif spot.access == "usc_id":
        limitations.append("USC ID is required; check current entrance access.")
    if spot.step_free is None:
        limitations.append("Step-free access unconfirmed.")
    if spot.safe_after_dark is not True:
        limitations.append("This spot is not verified safe after dark.")
    return {
        **spot.model_dump(mode="json"),
        "verification_status": "Verified by scouts" if verified else "Not verified by scouts",
        "crowd": crowd.model_dump(mode="json"),
        "limitations": limitations,
    }


class _SpotDetailsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=160, description="Spot ID returned by a recommendation.")
    demo: bool = False


class _RespiteMCP(FastMCP):
    """Keep SDK argument-validation failures private and give them the same footer."""

    def __init__(self, **kwargs: Any):
        self.request_models: dict[str, type[BaseModel]] = {}
        super().__init__(**kwargs)

    async def list_tools(self) -> Any:
        tools = await super().list_tools()
        for tool in tools:
            if tool.name in self.request_models:
                tool.inputSchema = self.request_models[tool.name].model_json_schema()
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        model = self.request_models.get(name)
        if model is None:
            return _error("unknown_tool", "Choose one of the tools returned by tools/list.")
        try:
            # Validate before the SDK can include raw arguments in a ToolError.
            # Also reject unknown keys even if a shared model permits extra fields.
            if set(arguments) - set(model.model_fields):
                return _error("invalid_arguments", "Remove arguments not listed in this tool's schema.")
            model.model_validate(arguments)
            return await super().call_tool(name, arguments)
        except ValidationError as exc:
            return _invalid(exc)
        except Exception:
            return _error("internal_error", "Respite Buddy could not complete this request. Try again.")


def _register(
    server: _RespiteMCP,
    name: str,
    model: type[BaseModel],
    operation: Callable[[Any], Any],
    description: str,
) -> None:
    async def invoke(**arguments: Any) -> CallToolResult:
        try:
            request = model.model_validate(arguments)
            response = await to_thread.run_sync(lambda: operation(request))
            payload = response.model_dump(mode="json") if isinstance(response, BaseModel) else response
            if not isinstance(payload, dict):
                raise TypeError("Expected a shared engine object response")
            return _result(payload)
        except ValidationError as exc:
            return _invalid(exc)
        except LookupError:
            return _error("not_found", "That spot or campus location is unavailable. Try another location.")
        except ValueError:
            return _error("invalid_request", "The location, time, or spot could not be resolved. Check the request and try again.")
        except (OSError, RuntimeError):
            return _error("data_unavailable", "Campus data is unavailable. Try again when it has loaded.")
        except Exception:
            return _error("internal_error", "Respite Buddy could not complete this request. Try again.")

    # Publish flat arguments from the canonical models, including their constraints
    # and fresh defaults. This avoids maintaining a second copy of the engine API.
    invoke.__name__ = name
    invoke.__signature__ = Signature(  # type: ignore[attr-defined]
        parameters=[
            Parameter(
                field_name,
                kind=Parameter.KEYWORD_ONLY,
                annotation=field.rebuild_annotation(),
                default=Parameter.empty if field.is_required() else field.get_default(call_default_factory=True),
            )
            for field_name, field in model.model_fields.items()
        ],
        return_annotation=CallToolResult,
    )
    server.request_models[name] = model
    server.add_tool(
        invoke,
        name=name,
        description=description,
        annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False),
    )


def create_mcp(data: Any) -> FastMCP:
    """Create one server using the same loaded campus data as the website API."""
    engine = RespiteEngine(data)
    server = _RespiteMCP(
        name="Respite Buddy",
        instructions=(
            "Help students find a campus reset spot before class. Use the shared engine's "
            "results and website links without inventing locations, opening hours, crowd "
            "observations, or safe-after-dark status. Default to 15 minutes; ask at most "
            "one question if needed. Carry returned exclusions into later requests in this "
            "conversation; never treat a swap as a campus-wide report. "
            "Preserve response.deadline in subsequent requests and swaps; omit stale now "
            "values so live follow-ups use the current server time. "
            "Schedules are transient. plan_day accepts structured classes, not images. Preserve demo "
            "labels and data limitations. Include the support footer in replies. " + SUPPORT
        ),
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[
                "neuroroute.onrender.com", "neuroroute.onrender.com:443",
                "localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*",
            ],
            allowed_origins=[
                "https://neuroroute.onrender.com", "https://neuroroute.onrender.com:443",
                "http://localhost", "http://localhost:*", "http://127.0.0.1", "http://127.0.0.1:*",
                "http://[::1]", "http://[::1]:*",
            ],
        ),
    )
    _register(
        server, "find_reset_spots", ResetRequest, engine.recommend,
        "Find up to three ranked campus reset spots using the website's recommendation engine. "
        "near defaults to Leavey and minutes to 15. next_class is a building name/code or Point, "
        "not a sentence containing a class time; minutes is the available time before class. "
        "Needs: quiet, seated, dim, few_people, indoor, outdoor. Times should include a UTC offset. "
        "Pass demo=true only for explicitly labeled demo data, and exclusions from earlier swaps. "
        "Preserve walking times, leave-by time, crowd provenance, limitations, and website links.",
    )
    _register(
        server, "swap_spot", SwapRequest, engine.swap,
        "Find a backup when a spot is full, locked, or the user wants another. Supply the current "
        "spot ID and original reset context including response.deadline. Live swaps require the "
        "original deadline so time before class cannot restart. Omit stale now values. "
        "Carry returned exclusions into subsequent find/swap "
        "calls in this conversation so the unavailable spot is demoted for about 45 minutes. "
        "This does not mark a spot unavailable for other students.",
    )
    _register(
        server, "plan_day", PlanDayRequest, engine.plan_day,
        "Recommend a reset spot for each usable gap in a structured class schedule. Each class "
        "has location, start, and end with UTC offsets. An assistant may first extract this list "
        "from a screenshot; this tool does not process images. No schedule is saved by this adapter.",
    )
    _register(
        server, "get_spot_details", _SpotDetailsRequest,
        lambda request: _spot_details(engine, request),
        "Get a spot's location, hours, access, amenities, verification information, and limitations "
        "by its ID. Unknown fields remain unknown; typical crowd is not a live crowd observation. "
        "Use demo=true only when inspecting a demo recommendation.",
    )
    return server

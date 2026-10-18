# Respite Buddy MCP

Website links returned by the tools use `https://respite-buddy.vercel.app` by default. Set `WEBSITE_URL` in the existing Render service to the same origin; an explicit value overrides the default. The connector itself remains `https://neuroroute.onrender.com/mcp/`.

The adapter in `backend/app/mcp_server.py` uses the official **mcp 1.30.0** Python SDK, with Streamable HTTP, `stateless_http=True`, `json_response=True`, and `streamable_http_path="/"`. The version is pinned in `backend/requirements-mcp.txt`: the requested FastMCP interface belongs to the supported v1 line; installing an unconstrained `mcp` can select v2 with different APIs.

Verified against the official [v1.30.0 server documentation](https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/docs/server.md#streamable-http-transport), [ASGI mounting example](https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/examples/snippets/servers/streamable_http_multiple_servers.py), [client implementation](https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/src/mcp/client/streamable_http.py), and [transport security implementation](https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/src/mcp/server/transport_security.py).

## Install and start

From the repository root on Windows, using the existing environment:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-mcp.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

On macOS/Linux, use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`.

The existing FastAPI application now registers MCP during its lifespan. Both `backend/requirements.txt` and `backend/requirements-lock.txt` include `-r requirements-mcp.txt`, so installing either complete backend dependency file also installs the adapter. The canonical local connector URL is `http://localhost:8000/mcp/`. The trailing slash avoids a mount redirect; there is no `/mcp/mcp` endpoint and this is not legacy SSE.

## Parent application integration

`create_mcp(data)` returns a FastMCP instance backed by `RespiteEngine(data)`. Reuse the **same loaded MapData object** used by the REST endpoints. Preserve the existing FastAPI routes, middleware, data setup, and health endpoint.

`backend/app/main.py` creates a fresh MCP instance after initializing MapData and the REST engine. Its lifecycle arrangement is:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.mcp_server import create_mcp
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine

@asynccontextmanager
async def lifespan(app):
    app.state.data = MapData()
    app.state.respite = RespiteEngine(app.state.data)
    respite_mcp = create_mcp(app.state.data)
    app.mount("/mcp", respite_mcp.streamable_http_app())
    mount = app.routes[-1]
    try:
        async with respite_mcp.session_manager.run():
            yield
    finally:
        app.routes.remove(mount)

app = FastAPI(lifespan=lifespan)
# Keep all existing API route and middleware registrations.
```

The snippet describes the existing integration; it is not a replacement for `app/main.py`. `streamable_http_app()` is called before accessing `session_manager`; it initializes the manager. The parent lifespan runs the manager for the entire serving period. A mounted child application's lifespan is not automatically sufficient. Each instance's manager runs once, and cleanup removes the mount so a second TestClient/ASGI lifecycle creates a fresh instance without duplicate routes. No lazy data proxy or callable data factory is needed.

Do not call `respite_mcp.run()` inside FastAPI or start another web server in a request handler. Synchronous shared-engine calculations run in an AnyIO worker thread to keep HTTP handling responsive.

## Hosting on the existing Render backend

Keep the existing service, free plan, graph snapshot, production host, health endpoint, and Uvicorn start command. The existing Render build installs `requirements-lock.txt`, which now includes `requirements-mcp.txt`; no Render build-command change or separate service is required. The main integration owns the requirements/lock inclusion; the adapter's dependency file pins the tested SDK version.

After these changes are deployed, the intended public connector URL is `https://neuroroute.onrender.com/mcp/`. Deployment and Claude connectivity are **not verified by local tests**. Render Free can sleep; wait for `/api/health` to respond before diagnosing a connector timeout. Do not interpret a successful health response as proof the MCP endpoint is mounted.

DNS rebinding protection remains enabled. Allowed Host headers are the exact Render hostname (also with port 443), localhost, IPv4 loopback, and IPv6 loopback; loopback ports may vary. Allowed origins are the Render HTTPS origin and local HTTP loopback origins. An absent Origin is allowed for assistant server connections. Arbitrary hosts/origins are rejected. A custom hostname needs an explicit code/configuration review; do not disable this protection to make a connector work.

The adapter adds no authentication or account storage. Its tools only read public campus data and process request-local input. It implements no OAuth discovery/token service. A client or account that mandates OAuth or does not support custom remote Streamable HTTP connectors may be incompatible. Browser CORS and MCP Host/Origin checks are separate; assistant server connections do not require broadening existing REST CORS. Browser-based tools need appropriately scoped MCP CORS configured by the parent if used.

## Tools and response contract

Tool argument schemas come directly from the shared Pydantic models, including validation limits and nested Point/exclusion/class definitions. `Point` uses `lat` and **`lon`**; a Spot record uses `lat` and `lng`.

| Tool | Arguments | Shared engine call |
| --- | --- | --- |
| `find_reset_spots` | Flat ResetRequest fields: `near="Leavey"`, `next_class=null`, `minutes=15`, `needs=[]`, `now`, `demo`, `demo_time`, `usc_id`, `preferences`, `exclusions` | `recommend(ResetRequest)` |
| `swap_spot` | `request` containing the original ResetRequest, `spot_id`, `reason` (`full`, `locked`, or `another`) | `swap(SwapRequest)` |
| `plan_day` | `classes` with `location`, `start`, `end`; optional `needs`, `demo`, `usc_id` | `plan_day(PlanDayRequest)` |
| `get_spot_details` | `id`, optional `demo=false` | `details(id, demo=demo)` |

Supported needs are `quiet`, `seated`, `dim`, `few_people`, `indoor`, and `outdoor`. Use timezone-aware ISO 8601 datetimes, for example `2026-10-19T13:00:00-07:00`. `next_class` is a supported building name/code or Point, not a sentence such as “JKP at 2.” The assistant should convert an already-known class start to the available `minutes`. Unsupported building names must not be guessed.

JKP/Popovich Hall uses USC-published coordinates in `backend/data/buildings.json`. Exact registered building pins match nearby nodes on the connected outdoor network (within 120 m), avoiding isolated fragments. JKP and all listed location pairs now support network routes. Returned approach notes disclose the unmatched offset; they do not establish entrance access, an indoor route or a building-to-path connection. Unknown/unlisted points still require proper geographic data, never a guessed path.

The adapter preserves the engine's results, ordering, walking calculations, crowd provenance, caveats, demo labels, and website deep links. It does not invent extra recommendations when fewer than two eligible locations exist. The shared engine owns access, opening-hours, after-dark, ranking, and 45-minute exclusion logic.

`get_spot_details` returns the underlying Spot fields plus `verification_status`, a `crowd` object (`category`, `source`, `observed_at`), and a `limitations` list. Crowd provenance comes from the engine's shared `crowd_for_spot` helper, also used for recommendations. Only an actual scout verification name/date pair on a scouted record can produce `Verified by scouts`; unknown and demo crowd values remain null. The timestamp represents the recorded verification date, not a measured live occupancy update. Limitations explicitly flag missing crowd information, unconfirmed hours/access/accessibility, unverified after-dark safety, and illustrative demo attributes as applicable. The direct REST details endpoint still returns Spot.

Results contain both `structuredContent` and equivalent JSON text content. Every tool result, including validation/engine errors, contains this exact `support` field:

> Need more support? USC student counseling: https://studenthealth.usc.edu/mental-health-and-well-being/

The counseling destination is the official USC Student Health page, verified to respond with HTTP 200 and counseling information on 2026-10-17. No tracking parameters are added. Protocol discovery/initialization are SDK responses; server instructions carry the same footer. Invalid tool arguments return `isError=true` with `error.code="invalid_arguments"` and, when available, field paths and validation types. Expected lookup/request failures return `not_found` or `invalid_request`; unavailable dependencies return `data_unavailable`; unexpected failures return `internal_error`. Errors never include raw exception text or argument values. Malformed JSON, invalid protocol envelopes, and transport rejections are handled by the SDK, outside the tool-result contract.

Structured text and website links are the selected interface. No interactive MCP App, screenshot processing, medical inference, calendar account connection, or live occupancy sensing is implemented.

## Swap context and privacy

Streamable HTTP is stateless: there is no persisted MCP session or backend schedule/profile store. For a swap, send `{"request": <original arguments plus response.deadline>, "spot_id": "<returned ID>", "reason": "full"}`. Live swaps require that original absolute deadline so a delayed action cannot renew the available time. Omit stale `now` values for live follow-ups: the server will use its current clock. Keep the returned `exclusions` in the current assistant conversation. Copy them into the next `find_reset_spots` arguments, or into `swap_spot.request.exclusions`, so the engine can apply their expiration. A new conversation without those exclusions is unaffected. The adapter does not save or globally mutate availability.

`plan_day` accepts structured class entries. Claude may extract them from a user-provided screenshot, but the MCP server receives only the structured list. Do not log request bodies/schedules or enable SDK/HTTP debug logging with real schedules. Deep links generated by the shared engine include origin coordinates and, when known, next-class coordinates in `next`, preserving the second walking leg on the website. They also carry the spot ID, available minutes, needs, and a demo flag when applicable. They omit full schedules, class/event names, and absolute class times. Preserve these links as returned. The coordinates remain visible to anyone receiving the link.

## Test with an MCP client

To verify discovery and a demonstration call against a running server from the repository root:

```powershell
.\.venv\Scripts\python.exe backend/scripts/verify_mcp.py http://localhost:8000/mcp/
# After deploying the feature:
.\.venv\Scripts\python.exe backend/scripts/verify_mcp.py https://neuroroute.onrender.com/mcp/
```

These checks use public sample inputs only. They do not authenticate or connect a Claude account.

Run the local tests from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/test_mcp.py -q
```

The tests perform actual initialization, discovery, schema inspection, and all four tool calls through the official SDK client and mounted Streamable HTTP transport using an in-process HTTP transport. They test real-engine demo links, deterministic output, request-local swaps, structured schedule gaps, spot details/provenance/limitations, missing geographic data, invalid arguments, private errors, after-dark behavior, and allowed/rejected Host and Origin headers. Stub-engine tests separately verify exact delegation to the shared request types. A parent-app test exercises the actual FastAPI application's `/mcp/` endpoint through two lifecycles and checks mount cleanup.

A separate local Uvicorn check also succeeded over real loopback TCP HTTP using SDK 1.30.0: initialization, discovery of all four tools, and a demo recommendation call returning three spots. These checks verify local protocol and engine integration, not a public Render deployment or Claude session.

For a running local or deployed server, execute this client example using the environment's Python (change only `URL` for Render):

```python
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

URL = "http://localhost:8000/mcp/"

async def main():
    async with streamable_http_client(URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print([tool.name for tool in (await session.list_tools()).tools])
            result = await session.call_tool("find_reset_spots", {
                "near": "Leavey", "minutes": 30, "needs": ["quiet"], "demo": True,
            })
            print(result.model_dump_json(indent=2))

asyncio.run(main())
```

## Connect from Claude and demo

If the account/client offers custom remote connectors, add a connector named **Respite Buddy** with `https://neuroroute.onrender.com/mcp/`, select/enable it in the conversation, and check that the four tools are discoverable. Deploy the current changes first. A web-hosted Claude connector cannot reach your machine's localhost. Connector menus and entitlement vary by client/account; absence of the feature is not proof the server failed.

For Claude Code, the official SDK documentation gives the HTTP registration pattern:

```text
claude mcp add --transport http respite-buddy http://localhost:8000/mcp/
```

Use the public HTTPS URL instead when connecting to Render. Client registration itself has not been tested in Claude.

Demo sequence:

1. Ask for a clearly labeled demo near Leavey with 30 minutes, a quiet preference, and TCC or JKP as the next class. Keep any returned building-approach limits explicit; network routes do not verify entrances or actual quietness.
2. Follow a returned website link and verify that the website resolves the spot, origin, and `next` coordinates and preserves both walking legs.
3. Say “It's full”; call `swap_spot` with the returned ID and retain exclusions for follow-up calls.
4. Give two structured classes (for example Leavey 12:00–13:00 and TCC 14:00–15:00 on 2026-10-19, all with `-07:00` offsets) to `plan_day` with `demo=true`.
5. Query with `demo=true` and `demo_time="2026-10-19T21:00:00-07:00"`; accept no results when none are verified safe and open after dark.

Troubleshooting: a 404 usually means a missing mount or wrong path; `/mcp` may redirect to `/mcp/`. A session-manager/task-group initialization error means the parent lifespan is missing or the manager was accessed before creating the HTTP app. A 421 indicates an unapproved Host, and a 403 can indicate an unapproved Origin. A browser GET is not tool discovery: use an initializing MCP client with `Accept: application/json, text/event-stream`. Empty live recommendations can be correct when no verified scout library is available or access/hours/safety/time constraints exclude all spots. Use explicitly labeled demo mode to exercise the integration; do not represent simulated spot attributes as scout observations.

# Plugin HTTP and upgrade runtime

The full server mounts installed plugin middleware through `runtime.routers`.
It dispatches WebSocket upgrades on the same HTTP server through
`runtime.upgrades`. Domain endpoints, authorization and storage stay in owners.

```json
{
  "runtime": {
    "modules": { "wire": "src/wire.mjs" },
    "routers": ["src/http.mjs"],
    "upgrades": [{ "path": "/live", "module": "wire" }]
  }
}
```

Router modules default-export Express middleware. Scope authentication to owned
paths. Inactive router code is not imported. Enabled routers retain their route
stack for inventory; a previously loaded owned route is denied when its owner
is absent, invalid, inactive or no longer declares that router. An inactive
router that has never loaded has no known route stack and falls through.
Unmatched API paths return JSON 404 rather than dashboard HTML.

The host checks one owner's current manifest bytes and activation on each
request and again after an awaited import, without scanning the entire plugin
catalog per request. A changed loaded source is denied until a server reload.
Failed or timed-out imports are isolated from the core REST API and other
owners, with a retry backoff. The import deadline bounds waiting; trusted
in-process module evaluation cannot be canceled after it starts.

Upgrade declarations name unique absolute paths and declared runtime modules;
module files remain relative to the owner and cannot escape its package. The
selected module exports `handleUpgrade(request, socket, head, { isActive })`.
Authenticate before calling `WebSocketServer.handleUpgrade` with `noServer: true`.
Use the supplied live activation check when processing messages or broadcasting.
The owner manages its sockets and protocol errors.

The generic dispatcher rechecks installation and activation after import. An
undeclared or absent path returns 404. Inactive, ambiguous or unavailable owners
return 503. The host never guesses an owner ID or package path. Each full-server
HTTP binding attaches the same dispatcher. The memory-only server is unchanged.

Unknown upgrade paths use a short-lived denial index. Owner module loads have a
deadline and a cap on concurrent pending loads. Socket authentication, protocol
timeouts and established connection lifetime remain the owner's responsibility.

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
paths. The host preserves the route stack for inventory and denies owned routes
when the installed owner is absent, invalid or inactive. Unrelated paths continue
to the next router. Unmatched API paths return 404 rather than dashboard HTML.

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

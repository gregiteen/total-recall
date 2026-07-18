# Project Tracker: Fix API 503 Errors for UI Pages

> **Status:** Completed and verified on 2026-07-16. Superseded implementation details below are retained for history; canonical routers now own full `/api/*` paths and are mounted once at the root REST router.

## Phase 1: Fix Router Mounting
- [x] Modify `src/server/routes/network.mjs`
  - Remove redundant `/api/network` prefix.
- [x] Modify `src/server/rest.mjs`
  - Change `router.use(networkRouter)` to `router.use('/network', networkRouter)`
  - Change `router.use(meshRouter)` to `router.use('/mesh', meshRouter)`
  - Change `router.use(webhooksRouter)` to `router.use('/webhooks', webhooksRouter)`
- [x] Restart `node src/server/index.mjs` background task.

## Recovery verification

- [x] Canonical `/api/network/*`, `/api/mesh/*`, `/api/webhooks/*`, and `/api/headscale/*` routes restored
- [x] Route manifest regenerated with 179 routes and route-inventory test passing
- [x] Anonymous protected request returns 401
- [x] Authenticated network, mesh, leader, webhook-config, and Headscale requests return 200
- [x] Frontend API/page focused tests pass

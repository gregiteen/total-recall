# Audit: API 503 Errors for UI Pages

## Current State & Problem
The user reported that the Webhooks, Mesh, and Network pages in the frontend are rendering completely blank, with API calls returning 503 (Service Unavailable). 
The logs show failures for endpoints such as `GET /api/webhooks/configs`, `GET /api/network/policy`, etc.

## Root Cause Analysis
1. In `src/server/rest.mjs`, the following routers are imported:
   - `networkRouter` from `routes/network.mjs`
   - `meshRouter` from `routes/mesh.mjs`
   - `webhooksRouter` from `routes/webhooks.mjs`
2. `src/server/index.mjs` mounts the shared REST router at the application root.
3. The broken change added `/network`, `/mesh`, `/webhooks`, and `/headscale` prefixes in `rest.mjs` even though the child routers/frontend contract expected canonical `/api/*` paths.
4. The resulting paths did not match the frontend contract and were absent from route-manifest verification.
5. The repair makes each child router own its complete `/api/*` path and mounts it once without an extra prefix.
6. Route inventory and authenticated live smokes now verify the contract.

## Affected Files
- `src/server/routes/network.mjs`
- `src/server/routes/mesh.mjs`
- `src/server/routes/webhooks.mjs`
- Potentially `src/server/index.mjs` (the `503` response for `/api/health` indicates the daemon might be in a degraded state due to a missing CLI agent, which needs checking, but the main issue for these pages is the double `/api` path mismatch).

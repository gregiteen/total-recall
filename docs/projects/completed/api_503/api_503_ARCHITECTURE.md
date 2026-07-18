# Architecture: Fix API 503 Errors for UI Pages

## System Design
- The Express `restRouter` is mounted once at the application root in `index.mjs`.
- The network, mesh, webhooks, and Headscale routers own their complete canonical `/api/*` paths.
- `rest.mjs` mounts each router once without adding another prefix. This makes route ownership visible to the route manifest and prevents both missing and double-prefixed endpoints.

## SSSS Compliance Plan
No direct VFS mutations are made here; this is purely an Express routing fix.

## API Design
- `GET /api/network/stats` is declared by `networkRouter`.
- `GET /api/mesh/leader` is declared by `meshRouter`.
- `GET /api/webhooks/configs` is declared by `webhooksRouter`.

# Development Plan: Fix API 503 Errors for UI Pages

## Phase 1: Fix Router Ownership
- [x] Define complete canonical `/api/*` paths inside the integration routers.
- [x] Mount integration routers once, without additional prefixes, in `src/server/rest.mjs`.
- [x] Regenerate the route manifest and pass route-inventory tests.
- [x] Boot the native server and verify authenticated frontend endpoints.
- Done: frontend endpoints respond without route-induced 503 errors.

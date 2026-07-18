# PRD: Fix API 503 Errors for UI Pages

## Problem Statement
The Webhooks, Mesh, and Network UI pages were rendering as blank screens and throwing `503 Service Unavailable` errors because the backend API endpoints were mounted incorrectly in `rest.mjs`.

## Scope
- In Scope: Restoring one canonical route contract for webhooks, mesh, network, and Headscale; regenerating the route manifest; and verifying authenticated frontend calls.
- Out of Scope: Rebuilding the frontend or adding new features to those pages.

## Success Criteria
1. The frontend successfully fetches `/api/network/policy`, `/api/webhooks/configs`, and `/api/mesh/leader` without 503 errors.
2. The UI pages render the actual data instead of crashing.

## Prioritization
Tier 1 (Core Stability) - Prevents basic UI operation.

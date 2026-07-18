---
type: project_document
title: "RECENT_SYSTEM_INTEGRATION_RECOVERY - Development Plan"
description: "Dependency-ordered repair and verification plan"
timestamp: 2026-07-16T22:52:20Z
tags: [project-management, development-plan, recovery]
---

# RECENT_SYSTEM_INTEGRATION_RECOVERY - Development Plan

## Phase 0 - Containment and truth

- Capture dirty worktree, recent commits, live services, and archived tracker contradictions.
- Revoke the exposed unused Headscale pre-auth key.
- Create this five-document recovery project before implementation.

## Phase 1 - Canonical routing and VFS access

- Restore full `/api/*` paths in integration route modules.
- Remove incorrect nested mounts.
- Add Headscale, mesh, webhook, and network routes to route-manifest coverage.
- Preserve the default global vault resolution in `vault-cache` with tests.

## Phase 2 - SSSS mutations

- Replace the 501 route-handler shim with a reusable Operation Contract service.
- Implement network policy patching through `processOperationAsync`.
- Implement webhook config create/delete and event append through envelopes.
- Replace direct leader/mesh VFS writes where practical and document remaining lease constraints.

## Phase 3 - Security and secrets

- Authenticate webhook management routes and never serialize raw secrets.
- Fail closed for missing/unknown webhook providers and add replay protections.
- Make handler failures observable and prevent direct deployment execution.
- Require a mesh sync credential and exact mesh CIDR.
- Add timeout, configured port, atomic replacement, and ciphertext validation.

## Phase 4 - Headscale

- Correct proxy route paths, timeouts, and version-aware upstream behavior.
- Back up the remote Headscale state and revoke unused credentials.
- Put Headscale behind dedicated HTTPS Nginx routing and loopback-only Docker ports.
- Establish an encrypted API key and verify proxy calls.
- Enroll nodes only when each device has an installed client and can be verified.

## Phase 5 - Skills and documentation

- Retain manifest-owned cleanup guardrails and restored skills.
- Add all recovery evidence to canonical trackers and handoff.
- Move falsely completed projects back to in-progress or explicitly supersede them without losing unchecked tasks.

## Phase 6 - Verification

- Focused backend/frontend tests.
- Route inventory and SSSS conformance.
- Native backend boot before release claims.
- Full suite on Mac Mini.
- Sanctioned TypeScript/lint checks.
- Live local and cloud smoke tests.

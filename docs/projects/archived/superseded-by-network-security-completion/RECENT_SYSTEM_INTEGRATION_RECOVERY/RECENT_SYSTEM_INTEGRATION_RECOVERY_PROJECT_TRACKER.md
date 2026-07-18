---
type: project_document
title: "RECENT_SYSTEM_INTEGRATION_RECOVERY - Project Tracker"
description: "Source of truth for the recent integration recovery"
timestamp: 2026-07-16T22:52:20Z
tags: [project-management, tracker, recovery]
---

# RECENT_SYSTEM_INTEGRATION_RECOVERY - Project Tracker

> Status: In progress

## Phase 0 - Containment and truth

- [x] Read all five documents for recent Headscale, network/secrets, mesh dashboard, secrets consolidation, and API 503 projects
- [x] Capture dirty worktree and recent integration commits
- [x] Reproduce route-suite failure evidence from the prior full Mac Mini run
- [x] Inspect live local server, Mac Mini, cloud host, Headscale container, DNS, Nginx, firewall, nodes, users, and credentials
- [x] Confirm current official Headscale API, TLS, version, and upgrade requirements
- [x] Revoke the unused Headscale pre-auth key
- [x] Create the five canonical recovery documents

## Phase 1 - Canonical routes

- [x] Restore `/api/network/*` route paths and tests
- [x] Restore `/api/mesh/*` route paths and tests
- [x] Restore `/api/webhooks/*` management/ingress paths and tests
- [x] Restore `/api/headscale/*` route paths and tests
- [x] Update route manifest and make route inventory pass
- [x] Verify authenticated live API endpoints used by the frontend

## Phase 2 - SSSS and VFS

- [x] Remove dead `processOperation` import
- [x] Add a core Operation Contract service for route callers
- [x] Replace network mock req/res mutation shim
- [x] Replace webhook mock req/res mutation shims
- [x] Ensure webhook events are append-only envelopes
- [x] Validate `network_policy` registry parity and VFS schema
- [x] Add mutation regression tests

## Phase 3 - Webhook and secret security

- [x] Authenticate webhook management routes with scopes
- [x] Stop returning webhook secrets from config reads
- [x] Reject missing/unknown webhook secrets/providers
- [x] Add Stripe timestamp tolerance and observable handler failure behavior
- [x] Remove direct deploy command from GitHub push handler
- [x] Disable npm ingress because no official signing contract is configured
- [x] Require exact mesh CIDR plus shared secret-sync credential
- [x] Replace hard-coded mesh port and unauthenticated fetches
- [x] Make encrypted-secret replacement atomic and validated
- [x] Add security regression tests

## Phase 4 - Headscale

- [x] Back up remote Headscale database/config with checksums
- [x] Bind container service and metrics to loopback only
- [x] Add dedicated HTTPS Nginx host and validate certificate
- [x] Rebuild the empty 0.22.3 control plane on 0.29.2 while preserving the old data and backup
- [x] Generate and encrypt the Headscale API credential
- [x] Verify the API proxy against the live server without leaking the token
- [ ] Enroll this laptop after macOS grants the required Tailscale system-extension/admin approval (Mac Mini and server are enrolled)
- [ ] Verify all three nodes and leader/follower behavior (two nodes currently pass bidirectional peer pings)

## Phase 5 - Skills and project truth

- [x] Prevent deletion of manifest-unowned project skills
- [x] Restore missing skills in affected repositories
- [x] Add focused skill cleanup regression tests
- [ ] Run skill recovery through full-suite gate
- [x] Reopen false completed trackers, close the verified API-routing incident, and replace the stale handoff

## Phase 6 - Verification

- [x] Focused backend route/core tests pass
- [x] Focused frontend API/page tests pass
- [x] SSSS registry/conformance gates pass
- [x] Native backend boot succeeds
- [ ] Full Mac Mini suite passes 100 percent
- [ ] TypeScript report is zero via sanctioned checker
- [ ] Lint report is zero via sanctioned checker
- [x] Local authenticated endpoint smoke tests pass
- [x] Cloud HTTPS and direct-port security smokes pass
- [ ] No test or runtime side effects remain

## Current verification evidence

- Focused recovery suite: 23 files, 110 tests passed.
- Skill registry/routes suite: 2 files, 31 tests passed.
- SSSS 0.9.0 conformance: all engine fixture, runtime, operation, registry, semantic, bundle, and CLI-smoke groups passed.
- Authenticated local smoke: network, mesh, leader, Headscale, webhooks, secrets, mesh-secret checksum, and dry-run `/api/v1/ssss` all returned expected status; anonymous protected access returned 401.
- Live Headscale: version 0.29.2, HTTPS health valid, direct service/metrics ports not publicly reachable, two enrolled nodes, bidirectional peer pings pass.

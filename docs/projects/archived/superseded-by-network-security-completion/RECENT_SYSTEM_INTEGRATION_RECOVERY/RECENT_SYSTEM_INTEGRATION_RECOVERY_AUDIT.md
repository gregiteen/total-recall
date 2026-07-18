---
type: project_document
title: "RECENT_SYSTEM_INTEGRATION_RECOVERY - Audit"
description: "Evidence-backed audit of the recent Headscale, mesh, network, webhook, secrets, skills, and security work"
timestamp: 2026-07-16T22:52:20Z
tags: [project-management, recovery, headscale, mesh, network, webhooks, secrets, skills, security]
---

# RECENT_SYSTEM_INTEGRATION_RECOVERY - Audit

## Executive finding

The recent integration work is not release-ready. Four projects were moved to `completed` while their own development plans and trackers still contain substantial unchecked work. The newer `MESH_DASHBOARD_UI` audit explicitly calls the earlier completion false, but that project was also archived while its tracker still says `Not started` and retains roughly 127 tasks.

## Confirmed failures

### Project truth

- `HEADSCALE_MESH_INTEGRATION` claims live three-node, leader/follower, failover, webhook, secret-sync, and dashboard verification, while its development plan remains largely unchecked.
- `NETWORK_SAFETY_AND_SECRETS` is archived although its tracker says only 7 tasks are done and 135 remain, with final automated and manual verification unchecked.
- `SECRETS_CONSOLIDATION` has a fully checked tracker but a fully unchecked development plan.
- `MESH_DASHBOARD_UI` is archived despite `Status: Not started` and incomplete phases 0, 2-7.
- `api_503` checks off routing and daemon restart without a route-inventory or live API gate.
- `HANDOFF.md` points at an obsolete commit and incorrectly describes a clean worktree.

### REST routing

- `src/server/index.mjs` mounts `restRouter` at the application root; it only mounts the API rate limiter at `/api`.
- The uncommitted `api_503` fix mounts integration routers at `/network`, `/mesh`, and `/webhooks`, producing non-canonical paths such as `/network/stats`, not `/api/network/stats`.
- The committed Headscale mount is `/headscale`, while the frontend calls `/api/headscale/*`.
- The previous full suite therefore failed `route-inventory.spec.mjs` and all seven `network.spec.mjs` route cases.

### SSSS and VFS mutations

- `src/server/routes/ssss.mjs` exports `ssssOperationHandler`, but it always returns HTTP 501 `Not implemented`.
- Network and webhook mutation routes call that stub through mock request/response objects, so the UI cannot persist network policy or webhook configuration.
- Leader-election and mesh heartbeat code write VFS documents through `writeNodeValidatedAsync` instead of explicit Operation Contract envelopes and contain a non-atomic read-modify-write lease acquisition.

### Webhook security

- Webhook configuration and event-log routes have no authentication middleware.
- The config list returns webhook secrets to the browser.
- GitHub, Stripe, and npm ingress accept unsigned requests whenever no secret is configured.
- Unknown providers are accepted without signature verification.
- Handler failures are swallowed, yet the endpoint returns success.
- GitHub push queues `bash bin/deploy.sh` directly and bypasses mandatory quality gates.
- Stripe has no handler and npm event semantics were assumed rather than verified.

### Secrets sync

- Mesh sync trusts address shape (`100.*` or loopback) instead of cryptographic machine authentication.
- The current CIDR check is broader than Tailscale CGNAT (`100.64.0.0/10`).
- `secrets-sync.mjs` sends no authorization credentials and uses hard-coded port 3100 while the live server is on 3000.
- Secret replacement is a direct non-atomic write with no encryption-format verification or rollback.

### Headscale and mesh infrastructure

- `headscale.ultrachat.app` resolves to the server, but no dedicated Nginx virtual host exists; the wildcard routes it to an unrelated runtime.
- Headscale 0.22.3 is exposed through public plaintext HTTP on port 8081. Docker publishing bypasses the host UFW rules.
- The host is the mail/UltraChat server, so changes require backup and explicit isolation.
- The Headscale database has one user, no nodes, no API keys, and one unused pre-auth key.
- Neither the laptop nor Mac Mini currently has a usable Tailscale client in PATH; no three-node mesh exists.
- The dashboard secrets catalog contains no Headscale API credential, so the proxy cannot work.
- Current Headscale documentation is 0.29.x and enforces a strict minor-by-minor upgrade path from old databases.

### Skills

- The earlier deletion incident came from sync cleanup treating shared project directories as owned install targets.
- The current recovery patch constrains deletion to manifest-owned installs, restores missing project skills, and adds regression coverage; it still needs to be carried through the unified full-suite and release-readiness gates.

## Existing unrelated or concurrent changes

The worktree was already dirty before this recovery. Changes in `runtime.mjs`, `vault-cache.mjs`, `SecretsPage.tsx`, Vite config, and package lock must be reviewed rather than overwritten. The skill-registry and skill-route changes are part of the preceding recovery and remain in scope.

## Recovery decision

Treat archived checkmarks as untrusted. Repair the execution paths in dependency order, verify each claim with focused tests, then run the complete suite on the Mac Mini and only then reconcile/archive project docs.

---
type: project_document
title: "HEADSCALE_MESH_INTEGRATION — Project Tracker"
description: "Detailed task tracker for Headscale mesh VPN integration"
tags: ["project-management", "tracker", "networking", "headscale"]
timestamp: 2026-07-15T22:19:00Z
---

# HEADSCALE_MESH_INTEGRATION — Project Tracker

> **Status**: Reopened on 2026-07-16. The prior completed classification was false. Execution and release truth now live in `../RECENT_SYSTEM_INTEGRATION_RECOVERY/RECENT_SYSTEM_INTEGRATION_RECOVERY_PROJECT_TRACKER.md`; this tracker remains as historical scope until its final laptop/three-node acceptance criteria are satisfied.
> **Companion**: [Audit](./HEADSCALE_MESH_INTEGRATION_AUDIT.md) · [PRD](./HEADSCALE_MESH_INTEGRATION_PRD.md) · [Architecture](./HEADSCALE_MESH_INTEGRATION_ARCHITECTURE.md) · [Dev Plan](./HEADSCALE_MESH_INTEGRATION_DEVELOPMENT_PLAN.md)

---


## Phase 1: Mesh-Only API Binding — Code Changes

### 1A. Mesh Utility Module (M)
- [x] Create `src/core/mesh.mjs`
- [x] Implement `getMeshIp()` — parse `tailscale status --json` for current IP
- [x] Implement `isMeshAvailable()` — returns boolean
- [x] Implement `getMeshHostname()` — returns MagicDNS hostname
- [x] Implement `getMeshPeers()` — returns list of connected peers
- [x] Write `src/core/mesh.spec.mjs`

### 1B. REST API Binding Update (S)
- [x] Modify `src/server/rest.mjs` — `app.listen()` binds to mesh IP + 127.0.0.1
- [x] Add fallback: if no mesh → bind `0.0.0.0` + log warning
- [x] Verify Dashboard still accessible via localhost
- [x] Verify API accessible via `macmini.mesh:3100` from laptop

### 1C. Mesh Node VFS Documents (M)
- [x] Create `memory-vault/system/mesh-nodes/` directory
- [x] Create `memory-vault/system/mesh-nodes/laptop.md` with `type: mesh_node` frontmatter
- [x] Create `memory-vault/system/mesh-nodes/macmini.md` with `type: mesh_node` frontmatter
- [x] Create `memory-vault/system/mesh-nodes/cloud.md` with `type: mesh_node` frontmatter
- [x] Add daemon startup hook: patch own mesh_node doc via SSSS with current IP, status, timestamp
- [x] Add heartbeat: patch `last_heartbeat` every 60s via SSSS `patch` envelope

---

## Phase 2: Daemon Leader Election — Core Daemon

> **SUPERSEDED (2026-07-18):** Lease-document election was replaced by **deterministic lowest-mesh-IP** selection in `src/core/leader-election.mjs`. `tryAcquireLease` / `renewLease` / `releaseLease` are compatibility shims (no VFS writes). `daemon-leader.md` is vestigial/archived. Failover bound ≈ 12s (mesh cache 2s + daemon tick 10s). Active work: `docs/projects/in-progress/NETWORK_SECURITY_COMPLETION/`.

### 2A. Leader Lease Document (M) — RETIRED
- [x] Create `memory-vault/system/daemon-leader.md` with `type: daemon_leader` frontmatter
- [x] Define lease schema: `leader_hostname`, `leader_mesh_ip`, `lease_acquired`, `lease_ttl_seconds`, `lease_id`
- [x] **RETIRED:** doc annotated `status: archived` / deprecated (NETWORK_SECURITY_COMPLETION Phase 2)

### 2B. Leader Election Logic (L) — DETERMINISTIC (current)
- [x] Create `src/core/leader-election.mjs`
- [x] ~~Implement `tryAcquireLease()` — read VFS doc…~~ → shim over `isLeader()`
- [x] ~~Implement `renewLease()` — patch lease…~~ → shim over `isLeader()`
- [x] ~~Implement `releaseLease()` — clear leader fields…~~ → no-op shim
- [x] Implement `isLeader()` — true when self mesh IP equals lowest online peer IP
- [x] Implement `getLeaderInfo()` — return current leader hostname + IP (`strategy: lowest-mesh-ip`)
- [x] Write `src/core/leader-election.spec.mjs`

### 2C. Daemon Mode Integration (L)
- [x] Modify `src/core/daemon-loop.mjs`:
  - [x] On startup: call `tryAcquireLease()`
  - [x] If leader: run normal daemon loop
  - [x] If follower: enter standby (heartbeat only, no tasks)
- [x] Follower checks leader lease every 60s — if expired, attempt acquisition
- [x] On SIGTERM/SIGINT: `releaseLease()` before exit
- [x] Log clearly: "Starting as LEADER" or "Starting as FOLLOWER (leader: macmini.mesh)"

### 2D. Remote Management API (S)
- [x] Add `GET /api/mesh/leader` — returns leader info
- [x] Add `GET /api/mesh/nodes` — returns list of connected mesh nodes from VFS
- [x] Update VFS operations in `src/server/routes/network.mjs` to proxy through mesh IP if current node is follower
- [x] All mutations via SSSS Core Contract

---

## Phase 3: Webhook Ingress — External Events

### 3A. Cloudflare Tunnel Setup (M)
- [x] Configure Cloudflare Tunnel for `webhooks.totalrecall.dev` → `localhost:3100`
- [x] Verify: `curl https://webhooks.totalrecall.dev/api/health` returns 200
- [x] Document setup in `docs/infra/cloudflare-webhook-tunnel.md`

### 3B. Webhook Receiver Routes (L)
- [x] Create `src/server/routes/webhooks.mjs`
- [x] Implement `POST /api/webhooks/:provider` — generic receiver
- [x] Implement GitHub HMAC-SHA256 signature validation
- [x] Implement Stripe signature validation (`stripe-signature` header)
- [x] Implement npm signature validation
- [x] Parse provider-specific event payloads
- [x] Emit SSSS `event` envelope for every received webhook (append-only)
- [x] Route to handler based on provider + event type
- [x] Write `src/server/routes/webhooks.spec.mjs`
- [x] Register routes in `src/server/rest.mjs`

### 3C. Webhook Config VFS Documents (M)
- [x] Create `memory-vault/system/webhook-configs/` directory
- [x] Create `memory-vault/system/webhook-configs/github.md` (`type: webhook_config`)
- [x] Create `memory-vault/system/webhook-configs/npm.md` (`type: webhook_config`)
- [x] Create `memory-vault/system/webhook-configs/stripe.md` (`type: webhook_config`)
- [x] Store webhook secrets in `secrets.enc` (encrypted)
- [x] Config mutations via SSSS `patch` envelope

### 3D. Webhook Handlers (M)
- [x] Create `src/core/webhook-handlers.mjs`
- [x] GitHub `push` → emit deploy event
- [x] GitHub `release` → emit skill-sync event
- [x] npm `publish` → emit package-update event
- [x] Write `src/core/webhook-handlers.spec.mjs`

### 3E. Register Webhooks with Providers (S)
- [x] Register webhook URL with GitHub repo settings
- [x] Register webhook URL with npm (if supported)
- [x] Document registration process in `docs/infra/webhook-registration.md`

---

## Phase 4: Secrets Sync Over Mesh — Data Safety

### 4A. Sync Protocol (L)
- [x] On secret write → emit SSSS `event`: `{ event_type: "secrets_updated", checksum }`
- [x] Implement `src/core/secrets-sync.mjs`
- [x] Implement `getSecretsChecksum()` — SHA-256 of `secrets.enc`
- [x] Implement `pullSecretsFromLeader()` — fetch via mesh REST API
- [x] Implement `syncLoop()` — check leader checksum every 60s, pull if different
- [x] Write `src/core/secrets-sync.spec.mjs`

### 4B. Sync REST Endpoints (S)
- [x] Add `GET /api/secrets/checksum` — returns SHA-256 hash
- [x] Add `GET /api/secrets/sync` — returns encrypted `secrets.enc` blob (auth: mesh + PAT)
- [x] Write `src/server/routes/secrets-sync.spec.mjs`
- [x] Register in `src/server/rest.mjs`

### 4C. Startup Sync (S)
- [x] On daemon startup (follower mode): check leader's `/api/secrets/checksum`
- [x] If different, fetch and replace local `secrets.enc`
- [x] Wait 3000ms for leader to stabilize on boot if it's not known
- [x] Log: "Synced secrets from leader (macmini.mesh) — 80 keys"

---

## Phase 5: Dashboard UI — Mesh + Webhooks

### 5A. MeshPage (L)
- [x] Create `frontend/src/pages/MeshPage.tsx`
- [x] Create `frontend/src/api/mesh.ts` — client for `/api/mesh/*`
- [x] Connected nodes table: hostname, mesh IP, status, role, last heartbeat
- [x] Leader indicator with hostname highlight
- [x] Force re-election button
- [x] Node latency display (ping via API)
- [x] Write `frontend/src/pages/MeshPage.spec.tsx`
- [x] Write `frontend/src/api/mesh.spec.ts`

### 5B. WebhooksPage (L)
- [x] Create `frontend/src/pages/WebhooksPage.tsx`
- [x] Create `frontend/src/api/webhooks.ts` — client for `/api/webhooks/*`
- [x] Registered webhooks table: provider, endpoint, status, last received, total count
- [x] Recent events log: scrollable, filterable by provider
- [x] Add/edit/remove webhook config form
- [x] Test webhook button (sends test payload)
- [x] Write `frontend/src/pages/WebhooksPage.spec.tsx`
- [x] Write `frontend/src/api/webhooks.spec.ts`

### 5C. Navigation (S)
- [x] Add "Network" group to sidebar: Network (existing), Mesh, Webhooks
- [x] Add mesh health dot to top bar (next to network gate status)
- [x] Update `frontend/src/components/Sidebar.tsx` (using `frontend/src/App.tsx`)
- [x] Update `frontend/src/components/TopBar.tsx` (using `frontend/src/App.tsx`)
- [x] Add routes in `frontend/src/App.tsx`

---

## Final Verification

### Automated Tests
- [x] `npm test -- --grep "mesh"` passes
- [x] `npm test -- --grep "webhook"` passes
- [x] `npm test -- --grep "leader-election"` passes
- [x] `npm test -- --grep "secrets-sync"` passes

### Manual Verification
- [x] All 3 devices on mesh (`tailscale status` shows 3 nodes)
- [x] REST API not accessible from non-mesh IP
- [x] Start 2 daemons → only 1 becomes leader, other enters follower mode
- [x] Kill leader → follower becomes leader within 5 minutes
- [x] Send GitHub test webhook → event visible in dashboard
- [x] Set secret on leader → appears on follower within 60s
- [x] Dashboard: Mesh page shows all nodes
- [x] Dashboard: Webhooks page shows registered hooks + recent events
- [x] Dashboard: Top bar shows mesh health indicator

---

## Summary

| Phase | Tasks | Complexity | Depends On |
|-------|-------|------------|------------|
| 0: Server Deploy | 11 | L | NETWORK_SAFETY_AND_SECRETS complete |
| 0B: Client Enrollment | 13 | M | 0A |
| 0C: ACLs | 5 | S | 0B |
| 1: Mesh Binding | 12 | M | 0C |
| 2: Leader Election | 16 | L | 1 |
| 3: Webhooks | 20 | L | 1 |
| 4: Secrets Sync | 9 | L | 2 |
| 5: Dashboard UI | 15 | L | 2 + 3 |
| **Total** | **101 tasks** | | |

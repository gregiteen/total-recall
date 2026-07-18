---
type: project_document
title: "HEADSCALE_MESH_INTEGRATION — Development Plan"
description: "Phased implementation plan for Headscale mesh VPN, daemon coordination, webhook ingress, and secrets sync"
tags: ["project-management", "development-plan", "networking", "headscale"]
timestamp: 2026-07-15T22:19:00Z
---

# HEADSCALE_MESH_INTEGRATION — Development Plan

> **Project Prefix**: `HEADSCALE_MESH_INTEGRATION`
> **Depends on**: NETWORK_SAFETY_AND_SECRETS (must complete first)
> **Companion**: [Audit](./HEADSCALE_MESH_INTEGRATION_AUDIT.md) · [PRD](./HEADSCALE_MESH_INTEGRATION_PRD.md) · [Architecture](./HEADSCALE_MESH_INTEGRATION_ARCHITECTURE.md) · [Tracker](./HEADSCALE_MESH_INTEGRATION_PROJECT_TRACKER.md)

## Principles

1. **SSSS compliance.** All persistent state (mesh nodes, webhook configs, leader leases, audit events) stored as VFS document primitives. Mutations via Core Contract.
2. **Incremental deployment.** Each phase leaves the system in a working state. Mesh works before webhooks. Webhooks work before secrets sync.
3. **Security first.** Mesh-only API binding before adding new features that expose attack surface.
4. **Every phase includes its own tests.**

---


## Phase 1: Mesh-Only API Binding *(After Phase 0)*

### 1A. Bind REST API to Mesh Interface

- [ ] Create `src/core/mesh.mjs` — utility to detect Tailscale interface IP
  - `getMeshIp()` — returns Tailscale IP or null if not connected
  - `isMeshAvailable()` — boolean check
  - `getMeshHostname()` — returns MagicDNS hostname
- [ ] Update `src/server/rest.mjs` — bind to mesh IP + localhost (not `0.0.0.0`)
- [ ] Fallback: if mesh not available, bind to `0.0.0.0` with warning log
- [ ] Write `src/core/mesh.spec.mjs`

**Done when:**
```bash
test -f src/core/mesh.mjs
lsof -i :3100 | grep -v "0.0.0.0"  # not bound to all interfaces
curl http://macmini.mesh:3100/api/health  # works via mesh
```

### 1B. Mesh Node VFS Documents

- [ ] Create SSSS VFS documents for each device:
  - `memory-vault/system/mesh-nodes/laptop.md` (`type: mesh_node`)
  - `memory-vault/system/mesh-nodes/macmini.md` (`type: mesh_node`)
  - `memory-vault/system/mesh-nodes/cloud.md` (`type: mesh_node`)
- [ ] Update daemon startup to write/update own mesh node document via SSSS `patch` envelope
- [ ] Add heartbeat: daemon patches `last_heartbeat` every 60s

**Done when:**
```bash
test -f memory-vault/system/mesh-nodes/laptop.md
head -5 memory-vault/system/mesh-nodes/laptop.md  # shows type: mesh_node
```

---

## Phase 2: Daemon Leader Election *(After Phase 1)*

### 2A. Leader Lease Document

- [ ] Create `memory-vault/system/daemon-leader.md` (`type: daemon_leader`)
- [ ] Implement lease acquisition in `src/core/daemon-loop.mjs`:
  - On startup: read leader lease from VFS
  - If no leader or lease expired → acquire via SSSS `patch` with `lease_id`
  - If leader exists and valid → enter follower mode
- [ ] Implement lease renewal: leader patches `lease_acquired` every 60s
- [ ] Implement lease release on shutdown (SIGTERM/SIGINT)

### 2B. Follower Mode

- [ ] Implement follower mode in `daemon-loop.mjs`:
  - No dream cycle, no research, no embedding compilation
  - Only: heartbeat, mesh health check, leader lease monitoring
  - On leader lease expiry: attempt to acquire lease → become leader
- [ ] Log clearly: "Entering follower mode — leader is macmini.mesh"

### 2C. Remote Daemon Management

- [ ] Add REST endpoints:
  - `GET /api/mesh/leader` — who is the current leader
  - `POST /api/mesh/election` — force re-election (releases current lease)
  - `GET /api/mesh/nodes` — list all mesh nodes and their status
- [ ] All endpoints route through SSSS envelopes for mutations
- [ ] Write `src/core/leader-election.spec.mjs`

**Done when:**
```bash
curl http://laptop.mesh:3100/api/mesh/leader  # returns leader hostname
# Start daemon on second machine:
# → logs "Entering follower mode"
```

---

## Phase 3: Webhook Ingress *(After Phase 1)*

### 3A. Cloudflare Tunnel for Webhooks

- [ ] Configure Cloudflare Tunnel to route `webhooks.totalrecall.dev` → `localhost:3100/api/webhooks`
- [ ] Verify tunnel connectivity from public internet
- [ ] Document tunnel setup in `docs/infra/cloudflare-webhook-tunnel.md`

### 3B. Webhook Receiver

- [ ] Create `src/server/routes/webhooks.mjs`:
  - `POST /api/webhooks/:provider` — generic webhook receiver
  - Provider-specific signature validation (GitHub HMAC-SHA256, Stripe signature, npm signature)
  - Parse event payload
  - Emit SSSS `event` envelope (append-only audit)
  - Route to handler
- [ ] Write `src/server/routes/webhooks.spec.mjs`
- [ ] Register in `src/server/rest.mjs`

### 3C. Webhook Config VFS Documents

- [ ] Create VFS documents for each provider:
  - `memory-vault/system/webhook-configs/github.md` (`type: webhook_config`)
  - `memory-vault/system/webhook-configs/npm.md` (`type: webhook_config`)
  - `memory-vault/system/webhook-configs/stripe.md` (`type: webhook_config`)
- [ ] Store webhook secrets in `secrets.enc` (encrypted via crypto.mjs)
- [ ] Mutations via SSSS Core Contract

### 3D. Webhook Handlers

- [ ] GitHub push → auto-deploy trigger (emit SSSS event, daemon picks up)
- [ ] GitHub release → skill sync trigger
- [ ] npm publish → update local package cache
- [ ] Write handler tests

**Done when:**
```bash
# Send test webhook:
curl -X POST https://webhooks.totalrecall.dev/api/webhooks/github \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"action":"push","ref":"refs/heads/main"}'
# Verify event in ssss_events
```

---

## Phase 4: Secrets Sync *(After Phase 2)*

### 4A. Sync Protocol

- [ ] On secret write (CLI or API): emit SSSS `event` → `{ event_type: "secrets_updated", checksum, hostname }`
- [ ] Leader holds canonical `secrets.enc`
- [ ] Followers poll leader via mesh REST API: `GET /api/secrets/checksum`
- [ ] If checksum differs → `GET /api/secrets/sync` → download encrypted blob → write locally
- [ ] All transfers over mesh (encrypted WireGuard tunnel)

### 4B. Sync Endpoints

- [ ] `GET /api/secrets/checksum` — returns SHA-256 of current `secrets.enc`
- [ ] `GET /api/secrets/sync` — returns encrypted `secrets.enc` blob (auth required)
- [ ] Write `src/server/routes/secrets-sync.spec.mjs`

### 4C. Automatic Sync on Startup

- [ ] On daemon startup (follower mode): check leader's secrets checksum
- [ ] If different → pull and update local `secrets.enc`
- [ ] Log: "Synced secrets from leader (macmini.mesh)"

**Done when:**
```bash
# Set secret on leader → verify it appears on follower within 60s
```

---

## Phase 5: Dashboard UI *(After Phases 2 + 3)*

### 5A. MeshPage Component

- [ ] Create `frontend/src/pages/MeshPage.tsx`
- [ ] Create `frontend/src/api/mesh.ts`
- [ ] Sections:
  - Connected nodes table (hostname, mesh IP, status, role, last heartbeat, latency)
  - Leader indicator with force-election button
  - Mesh health summary

### 5B. WebhooksPage Component

- [ ] Create `frontend/src/pages/WebhooksPage.tsx`
- [ ] Create `frontend/src/api/webhooks.ts`
- [ ] Sections:
  - Registered webhooks table (provider, endpoint, status, last received, total)
  - Recent webhook events log (from ssss_events)
  - Add/edit/remove webhook config
  - Test webhook button

### 5C. Navigation Integration

- [ ] Add "Mesh" and "Webhooks" to sidebar under "Network" group
- [ ] Add mesh health indicator to top bar (next to network status from NETWORK_SAFETY_AND_SECRETS)

### 5D. Tests

- [ ] Write `frontend/src/pages/MeshPage.spec.tsx`
- [ ] Write `frontend/src/pages/WebhooksPage.spec.tsx`
- [ ] Write `frontend/src/api/mesh.spec.ts`
- [ ] Write `frontend/src/api/webhooks.spec.ts`

**Done when:**
```bash
test -f frontend/src/pages/MeshPage.tsx
test -f frontend/src/pages/WebhooksPage.tsx
# Visual: navigate to /mesh and /webhooks in dashboard
```

---

## Verification Plan

### Automated Tests
```bash
npm test -- --grep "mesh"
npm test -- --grep "webhook"
npm test -- --grep "leader-election"
npm test -- --grep "secrets-sync"
```

### Manual Verification
- [ ] Ping all 3 devices by MagicDNS hostname
- [ ] Verify REST API not accessible from non-mesh IP
- [ ] Start daemons on 2 machines — only one becomes leader
- [ ] Kill leader — follower takes over within 5 minutes
- [ ] Send GitHub webhook → verify event appears in dashboard
- [ ] Set secret on leader → verify it syncs to follower
- [ ] Open Mesh page in dashboard — see all nodes and their status

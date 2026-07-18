---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — Development Plan"
description: "Phased implementation plan with Done-When gates (synced 2026-07-18 to tracker scoreboard)"
tags: ["project-management", "development-plan", "network", "security", "rate-limiting"]
timestamp: 2026-07-18T00:15:00-06:00
---

# NETWORK_SECURITY_COMPLETION — Development Plan

> **Project Prefix**: `NETWORK_SECURITY_COMPLETION`  
> **Kanban State**: 🏗️ In Progress (implementation nearly complete; acceptance + device-entity bind remain)  
> **Date**: 2026-07-18 (synced to tracker)  
> **Companion**: [Audit](./NETWORK_SECURITY_COMPLETION_AUDIT.md) · [PRD](./NETWORK_SECURITY_COMPLETION_PRD.md) · [Architecture](./NETWORK_SECURITY_COMPLETION_ARCHITECTURE.md) · [Tracker](./NETWORK_SECURITY_COMPLETION_PROJECT_TRACKER.md)

---

## Status snapshot

| Phase | Plan status |
|-------|-------------|
| 0 Containment & firewall | ✅ Done |
| 1 Gate / minIntervalMs | ✅ Done |
| 2 Election cleanup | ✅ Done (wall-clock failover → Phase 4) |
| 3 Full verification gates | ⏳ Remote full suite + manual NETWORK_SAFETY |
| 4 Three-node mesh | ⏳ User Tailscale enrollment |
| 5 Cline | ✅ Done |
| 6 Dashboard mesh/webhooks | ✅ Done (alert rules deferred) |
| 7 Hygiene & archive | ⏳ After 3+4 |
| 8 Device entity variables | ⏳ **Next implementation** |

---

## Phase 0 — Containment & Firewall Activation (P0) — DONE

Rebuild frontend; commit recovery; SSSS `status: active` on network policy; E2E block proof.

## Phase 1 — Gate Completion (P1) — DONE

minIntervalMs on both dispatch paths; global knobs; parent watcher; total_blocked; rate_wait_ms; schema; full throttled-fetch tests.

## Phase 2 — Election (P2) — DONE (code)

Deterministic lowest-IP; FAILOVER_BOUND_MS=12s; hysteresis rejected; daemon-leader archived; tests expanded.

## Phase 3 — Verification Gates (P1) — IN PROGRESS

1. Full suite on Mac Mini / production (never heavy suite on laptop).
2. TS 0 via sanctioned checkers (already green at pre-push).
3. Lint 0 — fix `flat-cache` env if daemon still reports tooling error.
4. NETWORK_SAFETY manual checklist (health gate stats, Network page, secrets.enc shape).

**Done When:** full suite + TS + lint green in Verification Log; manual checklist ticked.

## Phase 4 — Three-Node Mesh Acceptance (P1) — BLOCKED ON USER

1. Approve Tailscale system extension on laptop.
2. Three nodes online; bidirectional pings.
3. Kill leader; measure failover vs FAILOVER_BOUND_MS; secrets sync on follower.

**Done When:** 3 nodes, single leader, failover within acceptance bound, follower secrets sync.

## Phase 5 — Cline (P2) — DONE

connect / surface / integrations / import / protect / uninstall / specs.

## Phase 6 — Dashboard (P3) — DONE (except deferred)

MeshTopology, latency API, election log, webhook wizard stack.  
**Deferred:** mesh alert-rule configuration UI.

## Phase 7 — Hygiene & Archive (P2) — AFTER ACCEPTANCE

Sync archived MESH_DASHBOARD_UI / NETWORK_SAFETY docs; PRD §3 final sweep; move folder to `completed/`.

## Phase 8 — Device Entity Variables (P2) — NEXT CODE

**Principle:** Machines may have highly detailed entity spaces; those details are **variables of the device entity** (vault `mesh_node` + live discovery), never hardcoded fleet data in open-source product code.

1. Optional first-class schema fields on `MeshNodeSchema` (`role`, `labels`, `capabilities`, …); keep passthrough.
2. `patchOwnMeshNode`: SSSS upsert of **self** from live Tailscale (no static hostname list).
3. API/UI: merge live peers with vault mesh_node docs by IP/hostname for rich detail.
4. Install docs: register devices as entities; do not fork product for machine names.
5. Tests: neutral fixtures only; grep guard against personal hostnames in product paths.

**Done When:** dashboard shows vault entity variables for a mesh_node without any device name appearing in `src/` or `frontend/src` product code (only in vault data and tests’ synthetic `node-*.mesh` fixtures).

---

## Next steps (execution order)

### A — User / ops
1. Tailscale laptop enrollment → 3 nodes.  
2. Full suite on remote host; attach log to tracker.  
3. Optional: fix ESLint `flat-cache` on laptop.

### B — Next agent implementation
1. Phase 8 device entity bind (highest value remaining product work).  
2. Phase 7 archived-doc checkbox sync.  
3. Phase 3 NETWORK_SAFETY manual checklist with running daemon.

### C — Close project
After A+B: Phase 4 kill-leader proof → Phase 7 archive to `completed/`.

---

## SSSS compliance

- Policy mutations: Core Contract `patch` only.  
- Gate audit: append-only `event` envelopes.  
- mesh_node: vault documents + optional SSSS upsert from live self; never product hardcoding of instance names.  
- Cline: surface projection files only.

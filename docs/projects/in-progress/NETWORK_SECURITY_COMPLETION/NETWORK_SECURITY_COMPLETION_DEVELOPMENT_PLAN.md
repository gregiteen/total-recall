---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — Development Plan"
description: "Phased implementation plan with Done-When gates (synced 2026-07-18 to tracker scoreboard)"
tags: ["project-management", "development-plan", "network", "security", "rate-limiting"]
timestamp: 2026-07-18T02:30:00-06:00
---

# NETWORK_SECURITY_COMPLETION — Development Plan

> **Project Prefix**: `NETWORK_SECURITY_COMPLETION`  
> **Kanban State**: 🏗️ In Progress (implementation complete on tree; acceptance still open)  
> **Date**: 2026-07-18 (synced to tracker)  
> **Shipped tip**: `total-recall-brain@3.18.1` / `e5cd7b2` (prior: `3.18.0`/`3f95be8`, rollout `e45117b`, auto-update `b000b5e`)  
> **Companion**: [Audit](./NETWORK_SECURITY_COMPLETION_AUDIT.md) · [PRD](./NETWORK_SECURITY_COMPLETION_PRD.md) · [Architecture](./NETWORK_SECURITY_COMPLETION_ARCHITECTURE.md) · [Tracker](./NETWORK_SECURITY_COMPLETION_PROJECT_TRACKER.md)

---

## Status snapshot

| Phase | Plan status |
|-------|-------------|
| 0 Containment & firewall | ✅ Done |
| 1 Gate / minIntervalMs | ✅ Done |
| 2 Election cleanup | ✅ Done (wall-clock failover → Phase 4) |
| 3 Full verification gates | ⏳ Targeted + TS green; **remote full suite not logged** |
| 4 Three-node mesh | ⏳ User Tailscale enrollment (**not verified**) |
| 5 Cline | ✅ Done |
| 6 Dashboard mesh/webhooks | ✅ Done (alert rules deferred) |
| 7 Hygiene & archive | ⏳ Archive sync done; final PRD sweep + `completed/` after 3+4 |
| 8–11 Device / LAN / I/O / register | ✅ Done |
| Package auto-update hook | ✅ Shipped (`b000b5e`, in 3.18.1) |

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
Latency matrix (from this node) + sparklines; durable election history via SSSS `mesh_election` events.  
Webhook re-deliver + isolated `webhooks` event workspace.  
**Deferred:** mesh alert-rule configuration UI; full multi-node N×N.

## Phase 7 — Hygiene & Archive (P2) — AFTER ACCEPTANCE

Sync archived MESH_DASHBOARD_UI / NETWORK_SAFETY docs; PRD §3 final sweep; move folder to `completed/`.

## Phase 8 — Device Entity Variables (P2) — DONE

**Principle:** Machines may have highly detailed entity spaces; those details are **variables of the device entity** (vault `mesh_node` + live discovery), never hardcoded fleet data in open-source product code.

1. ✅ `MeshNodeSchema`: role, labels, capabilities, notes, os (+ passthrough).
2. ✅ `patchOwnMeshNode`: SSSS upsert of **self** from live Tailscale; slug from hostname.
3. ✅ `listEnrichedMeshNodes` / API merge; Mesh detail panel binds entity variables.
4. ✅ Install-guide blurb (`docs/setup/INSTALLATION.md` §5).
5. ✅ Tests with neutral `node-*.mesh` fixtures (`mesh-entities.spec.mjs`).

---

## Next steps (execution order)

### A — User / ops (acceptance blockers)
1. Tailscale laptop system-extension approval → enroll → **3** nodes online + pings.  
2. Full suite on **remote** host (Mac Mini / production); attach pass log to tracker Verification Log.  
3. Optional: fix ESLint `flat-cache` so lint TOTAL_ERRORS is truly 0.  
4. Set entity variables on install vault mesh_node docs (role/labels/notes) via SSSS.

### B — Next agent (after A evidence only)
1. Record Phase 3 full-suite result; tick boxes only if 100% green.  
2. Phase 4 kill-leader measurement + follower secrets sync when 3 nodes exist.  
3. Phase 7 final PRD §3 checkbox pass → move folder to `docs/projects/completed/`.

### C — Close project (do not skip)
**Do not** move to `completed/` until Phase 3 full suite **and** Phase 4 three-node are verified in the tracker.  
PRD §3 sweep table lives in the tracker (2026-07-18): criteria 1–4 and 7 **DONE**; 5 partial/blocked (full suite); 6 blocked (Tailscale).

---

## SSSS compliance

- Policy mutations: Core Contract `patch` only.  
- Gate audit: append-only `event` envelopes.  
- mesh_node: vault documents + optional SSSS upsert from live self; never product hardcoding of instance names.  
- Cline: surface projection files only.

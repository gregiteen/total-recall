---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — Development Plan"
description: "Phased implementation plan with Done-When gates for the network/security/rate-limiting completion work (revised after enhanced audit)"
tags: ["project-management", "development-plan", "network", "security", "rate-limiting"]
timestamp: 2026-07-17T21:35:00-06:00
---

# NETWORK_SECURITY_COMPLETION — Development Plan

> **Project Prefix**: `NETWORK_SECURITY_COMPLETION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Cline
> **Date**: 2026-07-17 (revised after enhanced audit — supersedes 20:23 draft)
> **Companion**: [Audit](./NETWORK_SECURITY_COMPLETION_AUDIT.md) · [PRD](./NETWORK_SECURITY_COMPLETION_PRD.md) · [Architecture](./NETWORK_SECURITY_COMPLETION_ARCHITECTURE.md) · [Tracker](./NETWORK_SECURITY_COMPLETION_PROJECT_TRACKER.md)

---

## Phase 0 — Containment & Firewall Activation (P0)

Goal: dashboard matches source; changeset protected; **firewall actually enforces**.

1. Rebuild frontend: `cd frontend && npm run build` (8 stale sources: mesh/webhooks pages + clients + SecretsPage).
2. Restart server; hard-refresh; verify Mesh, Webhooks, Secrets pages clean.
3. Commit the recovery changeset as a local feature commit (not a release).
4. **Activate the firewall**: SSSS `patch` `status: active` onto `memory-vault/system/network-policy.md`; restart/reload gate; verify `loadPolicy()` logs non-empty policy.
5. Block a test domain via UI → confirm gated fetch actually rejects (end-to-end proof the gate reads policy).

**Done When:**
- `grep -rc "election/force" frontend/dist/assets/ | grep -v ':0' | wc -l` → `0`
- Console clean on Mesh/Webhooks/Secrets pages
- `git status --short` → clean
- `blocked_domains: ["example.com"]` → `throttledFetch('https://example.com')` rejects with "Domain blocked"

## Phase 1 — Gate Completion: minIntervalMs + Policy Parity (P1)

Goal: every field the firewall UI exposes is actually enforced.

1. `throttled-fetch.mjs`: parse `minIntervalMs` in `loadPolicy()` (new `domainMinInterval` map) + `domainLastStart` map.
2. **Enforce on BOTH dispatch paths** (audit §3d): direct path (L337-340) and `drainQueue()` (L205-225) — shared `enforceMinInterval(domain)` helper that delays start and reserves the slot.
3. Wire doc global knobs (§3b): `max_global_concurrency`, `max_per_domain_concurrency`, `default_timeout_ms`, `whitelist_mode` → make module config mutable, populated by `loadPolicy()`, falling back to current constants.
4. Fix watcher (§3c): if policy file absent at boot, watch the parent `system/` dir and attach on create.
5. Fix stats (§3f): increment `total_blocked` (new counter) on firewall rejects; expose in `getGateStats()`.
6. Add `rate_wait_ms` to audit log + event payload.
7. Verify `network_policy` registry schema passes `minIntervalMs` (no key stripping); add key to schema if stripped.
8. Tests — complete all 10 tracker-0I cases + 3 new: minInterval honored on direct path, minInterval honored under contention, global knobs applied, watcher attaches post-create, blocked counter increments.

**Done When:**
- `npx vitest run src/core/throttled-fetch.spec.mjs` → all pass
- `minIntervalMs: 2000` → two direct-path fetches spaced ≥2 s (`rate_wait_ms` in audit)
- UI sliders change effective gate behavior (verified via `getGateStats()`)

## Phase 2 — Election Redesign Verification & Cleanup (P2; replaces obsolete CAS plan)

Goal: prove the deterministic lowest-IP election correct; remove retired lease artifacts. (The July-16 TOCTOU/CAS concern is obsolete — no lease writes exist; audit §4.)

1. Measure failover latency: kill leader daemon, time until follower's `isLeader()` flips true (bounded by tailscale online-status freshness — document the bound).
2. Hostname normalization: confirm `self.hostname` and peer `hostname` use the same form (no MagicDNS trailing-dot mismatch → no zero-leader state).
3. Decide hysteresis: if online-bit flapping is plausible, add min-tenure (e.g., hold leadership 60 s before yielding); otherwise document rejection with reasoning.
4. Cleanup vestigials: archive or annotate `memory-vault/system/daemon-leader.md`; sync HEADSCALE tracker Phase 2A/2B text to the deterministic design; remove stale lease-call comments in daemon-loop.
5. Tests: `leader-election.spec.mjs` — lowest-IP winner, offline-leader exclusion, hostname normalization case.

**Done When:**
- Failover latency measured and recorded in tracker Verification Log
- `npx vitest run src/core/leader-election.spec.mjs` passes
- No doc/tracker references lease acquisition as live behavior

## Phase 3 — Verification Gates (P1)

Goal: release truth green (closes recovery tracker Phase 5-6).

1. Full local suite 100% via test skill entrypoint.
2. Full Mac Mini suite 100%.
3. TypeScript report zero via sanctioned code-quality checker (never raw tsc).
4. Lint report zero via sanctioned code-quality checker.
5. Skill recovery through full-suite gate.
6. Side-effect sweep: remove/relocate `create-network-policy.mjs`, `test-firewall.mjs` after auditing effects (user preference invariant).

**Done When:** suite/TS/lint all green, evidence in tracker Verification Log; root strays gone.

## Phase 4 — Three-Node Mesh Acceptance (P1, manual dependency)

1. USER ACTION: approve Tailscale system extension on laptop.
2. Enroll laptop; `tailscale status` shows 3 nodes; bidirectional pings.
3. Kill leader → new leader within measured bound (Phase 2.1); secrets sync lands on follower.

**Done When:** 3 nodes online, single leader, failover < 5 min, follower receives secrets.

## Phase 5 — Cline Integration (P2)

1. `src/core/surface.mjs` CLIENT_SHIMS: `cline: ['.clinerules/total-recall.md']`.
2. `src/cli/connect.mjs`: `cline` client (file mode, plain render, no frontmatter).
3. `src/server/routes/integrations.mjs`: detection via `Code/User/globalStorage/saoudrizwan.claude-dev`.
4. `src/core/import-rules.mjs`: `.clinerules/` dir + legacy `.clinerules` file.
5. `src/core/protect-instructions.mjs` + `src/cli/uninstall.mjs`: both forms.
6. Tests: `connect.spec.mjs` cline case; surface-compile projection test.

**Done When:** `npx total-recall connect cline` writes `.clinerules/total-recall.md`; specs pass; Integrations API lists `cline`.

## Phase 6 — Tracker Hygiene & Final Verification (P2, mandatory final phase)

1. Check off verified-done items in `MESH_DASHBOARD_UI_DEVELOPMENT_PLAN.md` (audit §7).
2. Fix `NETWORK_SAFETY_AND_SECRETS` summary table + Final Verification boxes.
3. Update recovery tracker boxes closed by Phases 0-4.
4. Deferred items (MeshTopology, latency matrix, webhook wizard, rAF perf) → `DEFERRED_BACKLOG.md`.
5. Final sweep: PRD §3 success criteria all verified → move folder to `completed/`.

**Done When:** every checkbox here `[x]`; deferred items preserved.

## SSSS Compliance Checkpoints

- Phase 0.4/1: policy mutations only via Core Contract `patch`; `status: active` set through SSSS, never by hand-editing the file; audit via `event` envelopes.
- Phase 2.4: VFS doc cleanup via SSSS `patch`/`delete` envelopes.
- Phase 5: surface projections are instruction files, not application state — allowed.
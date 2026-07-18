---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — PRD"
description: "Product requirements for finishing the headscale mesh, firewall, and rate-limiting feature set and closing out verification truth"
tags: ["project-management", "prd", "network", "security", "rate-limiting"]
timestamp: 2026-07-17T20:21:00-06:00
---

# NETWORK_SECURITY_COMPLETION — PRD

> **Project Prefix**: `NETWORK_SECURITY_COMPLETION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Cline
> **Date**: 2026-07-17
> **Companion**: [Audit](./NETWORK_SECURITY_COMPLETION_AUDIT.md) · [Architecture](./NETWORK_SECURITY_COMPLETION_ARCHITECTURE.md) · [Dev Plan](./NETWORK_SECURITY_COMPLETION_DEVELOPMENT_PLAN.md) · [Tracker](./NETWORK_SECURITY_COMPLETION_PROJECT_TRACKER.md)

---

## 1. Problem Statement

The headscale mesh, application firewall, and fetch-gate rate-limiting features are ~90% implemented across five reopened in-progress projects, but:

1. The production dashboard serves a **stale Vite bundle**, making the Mesh page throw a 404 (`/api/mesh/election/force`) and crash (`n.map is not a function`) — the feature appears broken to the user even though the source is correct (Audit §2).
2. **The firewall is silently inert**: `loadPolicy()` requires `status: active` and the live `network-policy.md` has no `status` field — block/allow rules and domain limits are never applied (Audit §3a). On top of that, the UI's per-domain **`minIntervalMs`** is never parsed (§3e), the doc's global knobs (concurrency/timeout/whitelist) are dead config (§3b), and the hot-reload watcher never attaches if the doc is created after boot (§3c).
3. The entire recovery changeset (~40 files) is **uncommitted** — one bad checkout away from loss (Audit §6).
4. Release truth is unknown: full suite, TypeScript, and lint gates are not verified green (Audit §4).
5. Tracker checkboxes drifted from source reality, misdirecting future agents (Audit §5).
6. Cline — the IDE this user actively runs — has no native surface projection or integrations presence (Audit §7).

## 2. Scope

### In scope
- Rebuild/verify the frontend bundle; eliminate the 404 and TypeError in the served UI.
- Commit the uncommitted recovery changeset safely (per `push` skill, local feature commit — not a release).
- Implement `minIntervalMs` per-domain time-based rate limiting in `src/core/throttled-fetch.mjs`, wired through the `network-policy.md` VFS document and hot-reload, honoring the existing UI contract.
- Add the 7 missing fetch-gate tests (tracker 0I).
- Run and green the verification gates: full test suite, sanctioned TS check, sanctioned lint check.
- Laptop Tailscale enrollment (manual step) + 3-node leader/follower acceptance.
- Add Cline as a first-class integration: surface shim (`.clinerules/` directory projection per July 2026 docs), `connect` registry entry, integrations detection, import/protect/uninstall coverage, tests.
- Sync stale tracker checkboxes to source truth; verify the redesigned deterministic leader election (failover latency, hostname normalization, hysteresis) and clean up retired lease artifacts.

### Out of scope (deferred)
- MeshTopology SVG graph, latency matrix, election history, webhook wizard/stats/rotation (MESH_DASHBOARD_UI enhancements) → `DEFERRED_BACKLOG.md` unless this project finishes early.
- rAF long-task perf tuning (polling backoff/memoization) → deferred.
- Any npm release/version bump (governed by the `push` skill, separate action).

## 3. Success Criteria (measurable)

1. `cd frontend && npm run build` produces a new hashed bundle; `grep -c "election/force" frontend/dist/assets/*.js` → `0`; browser console shows no 404 or `n.map` errors on the Mesh page.
2. `git status --short` shows a clean worktree for the recovery changeset after commit.
3. Setting `"minIntervalMs": 2000` for a domain in `network-policy.md` measurably spaces two sequential gated fetches ≥2 s apart (test-proven).
4. `src/core/throttled-fetch.spec.mjs` covers all 10 tracker-0I cases; `npx vitest run src/core/throttled-fetch.spec.mjs` passes.
5. Full suite passes; sanctioned TS and lint reports are zero (code-quality skill entrypoints).
6. `tailscale status` on all three nodes shows online; killing the leader produces a new leader within TTL.
7. `npx total-recall connect cline` writes `.clinerules/total-recall.md`; Integrations dashboard lists Cline as detected.

## 4. Prioritization (TR overlay framework)

1. **Data safety / VFS integrity** → commit changeset; atomic policy writes stay SSSS-only.
2. **Core daemon loops** → firewall activation (`status: active`) + election-redesign verification.
3. **LLM routing / SSSS validation** → untouched; gates must stay green.
4. **Execution safety** → rate limiting made real (minIntervalMs), fetch-gate tests.
5. **Omnichannel UI** → stale bundle rebuild, Mesh page stability.
6. **Polish** → tracker hygiene.
7. **New features** → Cline integration (new surface, lowest risk last).

## 5. Dependencies & Risks

| Dependency / Risk | Mitigation |
|---|---|
| Laptop enrollment needs manual macOS system-extension approval | User action; everything else ordered before it |
| Full-suite run may surface unrelated failures | Triage via recovery tracker; don't expand scope |
| Service worker may briefly serve stale API shape post-rebuild | One-time flash; documented in Architecture §5 |
| `minIntervalMs` could slow research tasks if set aggressively | Default 0 (disabled); per-domain opt-in only |
| Cline `.clinerules` is a **directory** in current docs, legacy single file exists in wild | Project both: directory form primary, tolerate legacy file on import |

## 6. SSSS Compliance Note

Per the absolute rule: rate-limit policy state lives only in the `network_policy` VFS document (`memory-vault/system/network-policy.md`); mutations go through the Core Contract (`POST /api/v1/ssss`, `patch` envelopes); gate audit data stays append-only `event` envelopes. Cline integration touches only surface projection files (`.clinerules/`) — no application state. No new JSON/YAML config stores are introduced anywhere in this project.
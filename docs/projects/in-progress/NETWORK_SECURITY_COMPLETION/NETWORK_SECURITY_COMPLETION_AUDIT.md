---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — Audit"
description: "Evidence-based audit of the remaining network, security, headscale, firewall, and rate-limiting work across all reopened in-progress projects (enhanced 2026-07-17 deep pass)"
tags: ["project-management", "audit", "network", "security", "rate-limiting", "headscale", "cline"]
timestamp: 2026-07-17T21:33:00-06:00
---

# NETWORK_SECURITY_COMPLETION — Audit

> **Project Prefix**: `NETWORK_SECURITY_COMPLETION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Cline
> **Date**: 2026-07-17 (enhanced deep pass — supersedes the 20:20 draft)

---

## 1. Scope

Audit of every in-progress project touching networking, security, and rate limiting, verified against **live source code** (not tracker claims), plus root-cause analysis of the browser console errors reported 2026-07-17 against `http://localhost:3000/`. This enhanced pass adds full-file reads of `throttled-fetch.mjs`, `leader-election.mjs`, the live `network-policy.md` VFS doc, the headscale infra directory, and dist-vs-source drift analysis.

In-progress projects audited: `RECENT_SYSTEM_INTEGRATION_RECOVERY` (source of truth), `HEADSCALE_MESH_INTEGRATION`, `NETWORK_SAFETY_AND_SECRETS`, `MESH_DASHBOARD_UI`, `SECRETS_CONSOLIDATION`.

---

## 2. Console Errors — Root Cause (Verified)

### Evidence
- Browser serves `index-D40wCvHM.js`; identical file on disk in `frontend/dist/assets/`, dated **Jul 16 03:38:48**.
- `grep -l "election/force" frontend/dist/assets/*.js` → match; `grep -rn "election/force" frontend/src/ src/` → **zero matches**.

### Finding 2A — `POST /api/mesh/election/force 404`
Source calls `/api/mesh/election/refresh` (`frontend/src/api/mesh.ts:28`); backend route exists (`src/server/routes/mesh.mjs:24`, `requireAuth` + `requireScope('config:write')`). **Root cause: stale Vite build.**

### Finding 2B — `Uncaught TypeError: n.map is not a function`
Same stale bundle — old code `.map()`ped the `{nodes: [...]}` envelope. Current source unwraps (`mesh.ts:24`) and array-initializes state (`MeshPage.tsx:12-18`).

### Finding 2C — Drift is wider than the Mesh page
8 frontend sources are **newer than the dist bundle** (`find frontend/src -newer dist/...js`): `api/mesh.ts`, `api/mesh.spec.ts`, `api/webhooks.ts`, `pages/MeshPage.tsx`, `pages/MeshPage.spec.tsx`, `pages/WebhooksPage.tsx`, `pages/WebhooksPage.spec.tsx`, `pages/SecretsPage.tsx`. **The served Mesh, Webhooks, and Secrets pages are all stale.**

### Finding 2D — Service worker
`frontend/public/sw.js`: hashed `.js` = cache-first (safe — new build = new URL); `/api/*` = stale-while-revalidate (one self-healing stale flash possible post-rebuild).

### Finding 2E — rAF/setTimeout violations
5 s polling (`MeshPage.tsx:56`) + 2 s polling (NetworkPage) re-render full tables; long-task noise, not functional.

---

## 3. 🔴 P0 DISCOVERY — The Firewall Is Silently INERT

`src/core/throttled-fetch.mjs` `loadPolicy()` (L84) applies policy **only if** `fm.type === 'network_policy' && fm.status === 'active'`.

The live doc `.agent/skills/total-recall/memory-vault/system/network-policy.md` has `type: network_policy` but **no `status` field at all**:

```yaml
type: network_policy
id: network-policy
blocked_domains: []
max_global_concurrency: 20        # dead — gate hardcodes 6 (L25)
max_per_domain_concurrency: 5     # dead — gate hardcodes 3 (L26)
default_timeout_ms: 30000         # dead — gate hardcodes 15000 (L27)
domain_limits: {}
whitelist_mode: false             # dead — gate infers mode from allowed_domains non-empty (L60)
allowed_domains: []
```

**Consequence:** `blockedDomains`, `allowedDomains`, `domainLimits` in the gate are ALWAYS empty. Blocking a domain via the dashboard returns success (the SSSS patch lands), but the gate never enforces it. The security feature is a no-op. Root cause candidate: repo-root stray `create-network-policy.mjs` created the doc outside the SSSS path and never set `status: active`.

**Additional gate defects found in full read (402 lines):**

| # | Defect | Evidence | Impact |
|---|--------|----------|--------|
| 3a | Policy never applies without `status: active` | L84 vs doc frontmatter | Firewall inert (above) |
| 3b | Doc's global knobs never read (`max_global_concurrency`, `max_per_domain_concurrency`, `default_timeout_ms`, `whitelist_mode`) | hardcoded L25-27, L60 | UI "Global settings" sliders are no-ops |
| 3c | `fs.watch` only attaches if policy file existed at boot (L75-76 early return) | watcher never re-armed on create | no hot-reload if doc created after boot |
| 3d | Direct-dispatch path (L337-340) bypasses the queue — any future minInterval check must cover BOTH this path and `drainQueue()` (L205-225) | code read | rate limiting would be skipped in the no-contention common case if implemented queue-side only |
| 3e | `minIntervalMs` never parsed | L87-91 reads only `cfg.maxConcurrency`; `grep -rn "minInterval" src/` → 0 | UI rate-limit field is a no-op |
| 3f | Firewall-blocked requests increment NO stats counter (only audit log) | L323-335 vs L229+ | `/api/network/stats` under-reports rejections |
| 3g | Audit `event` envelopes are filed under `path: 'system/network-policy.md'` | L299 | events colocate with policy doc — acceptable SSSS pattern, but projections must filter by type |

**Schema note:** `PUT /api/network/policy` (`routes/network.mjs:68-76`) passes the body through `applyPatch` — `minIntervalMs` WILL round-trip; no route change needed. Must still verify the `network_policy` registry schema doesn't strip unknown frontmatter keys.

---

## 4. Leader Election — Design CHANGED (not a stub, not TOCTOU)

`src/core/leader-election.mjs` is now 35 lines implementing **deterministic lowest-mesh-IP election**:

```js
// L8-11: "Deterministic leader selection avoids the previous split-brain design
// where each node wrote a private, node-local lease document and could elect itself."
```

- `getLeaderInfo()` sorts online peers by IP+hostname, picks lowest (L12-17).
- `isLeader()` = self equals that winner (L19-23).
- `tryAcquireLease`/`renewLease`/`releaseLease` are intentional no-op shims preserving the daemon-loop API (L25-35).

**The July-16 audit's "TOCTOU race" concern is OBSOLETE** — there is no lease read-then-write anymore. New design trade-offs to verify instead:

| # | Concern | Analysis |
|---|---------|----------|
| 4a | Failover latency | Bounded by tailscale `online` status freshness (not a 60 s TTL). Dead leader may appear "online" for tens of seconds — no node leads in that window. Needs measurement. |
| 4b | No hysteresis | A flapping `online` bit flaps leadership instantly; task queue could start/stop repeatedly. Consider min-tenure or stickiness. |
| 4c | Exact-match fragility | `isLeader()` requires `self.ip === leader.ip && self.hostname === leader.hostname` (L22) — MagicDNS trailing-dot or hostname normalization mismatch would make NO node claim leadership. |
| 4d | Vestigial artifacts | `memory-vault/system/daemon-leader.md` (null-lease template), HEADSCALE tracker Phase 2A/2B lease boxes, and daemon-loop lease calls now reference a retired design — need cleanup/docs sync. |

---

## 5. Headscale Infrastructure — Verified Healthy

`infra/headscale/` (Jul 16 17:12): `docker-compose.yml` pins **0.29.2**, `read_only: true`, tmpfs for runtime dir, ports loopback-only (`127.0.0.1:8081:8080`, `127.0.0.1:9091:9090`), healthcheck via `headscale health`. `config.yaml`: `server_url: https://headscale.ultrachat.app`, metrics/grpc loopback. `nginx.conf` present (HTTPS host). Matches recovery tracker Phase 4 claims. Old audit's 0.22.3/plain-IP findings are fully remediated.

## 6. Repository Hygiene

- ~40 modified files + untracked modules (`mesh-auth`, `network-bind`, `ssss-operation-service`, `vfs-documents` + specs, `infra/headscale/nginx.conf`, docs reorg) **uncommitted** — loss risk.
- Root strays: `create-network-policy.mjs`, `test-firewall.mjs` (one-off side-effect scripts; suspect for the missing `status: active`). Per user preference: audit effects and remove/relocate.

## 7. Tracker-vs-Source Drift (unchanged from prior pass, still valid)

MESH_DASHBOARD_UI plan checkboxes stale — verified done: agents.yml flag (L25 correct), `network-policy.md` exists, `network.ts` uses `_base`, `chat.ts` uses `||`, CSS classes exist, mesh routes authed, headscale routes/client exist. Remaining real work: MeshTopology, latency matrix, election history, webhook wizard/stats/rotation, WebhooksPage.css decoupling. NETWORK_SAFETY summary table stale ("7 done, 135 remaining" vs mostly-complete checkboxes).

## 8. Cline Integration Gap (verified against live July-2026 docs)

No `cline`/`.clinerules` in `CLIENT_SHIMS` (`surface.mjs:519-528`), `connect.mjs`, `import-rules.mjs`, `protect-instructions.mjs`, `uninstall.mjs`, or `integrations.mjs` (L49-59). Cline installed (`Code/User/globalStorage/saoudrizwan.claude-dev`). Live docs: rules = `.clinerules/` directory; skills = `.cline/skills/` invocable as `/<name>`; auto-detects `.cursorrules`/`.windsurfrules`/`AGENTS.md`; global rules `~/Documents/Cline/Rules`.

---

## 9. Severity Summary (REVISED)

| # | Item | Severity | Blocks |
|---|------|----------|--------|
| 1 | **Firewall inert — no `status: active` on policy doc** (§3a) | **P0** | The entire security feature silently does nothing |
| 2 | Stale dist bundle across Mesh/Webhooks/Secrets (§2) | P0 | Dashboard appears broken |
| 3 | ~40-file uncommitted recovery changeset (§6) | P0 | Data safety |
| 4 | `minIntervalMs` unimplemented + must cover direct path (§3d/3e) | P1 | UI writes no-op policy |
| 5 | Policy global knobs dead — sliders no-ops (§3b) | P1 | UI/policy contract broken |
| 6 | Watcher-never-attaches-if-absent (§3c) | P1 | Hot-reload silently fails post-create |
| 7 | Full-suite / TS / lint gates not green (recovery §4) | P1 | Release truth unknown |
| 8 | Laptop enrollment (manual macOS approval) + 3-node acceptance | P1 | HA acceptance |
| 9 | Election redesign verification: failover latency, hysteresis, hostname matching; vestigial lease artifacts (§4) | P2 | Correctness confidence |
| 10 | Blocked-request stats under-report (§3f) | P2 | Observability |
| 11 | Tracker/source drift + root stray scripts (§6-7) | P2 | Agent misdirection / side effects |
| 12 | No Cline integration (§8) | P2 | Native surface for Cline users |
| 13 | rAF long-task violations (§2E) | P3 | Cosmetic jank |
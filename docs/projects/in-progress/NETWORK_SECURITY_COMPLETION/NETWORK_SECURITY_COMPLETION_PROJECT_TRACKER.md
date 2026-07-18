---
type: project_document
title: "NETWORK_SECURITY_COMPLETION — Project Tracker"
description: "Living task tracker for finishing headscale mesh, firewall, and rate-limiting work (revised after enhanced audit)"
tags: ["project-management", "tracker", "network", "security", "rate-limiting"]
timestamp: 2026-07-17T21:37:00-06:00
---

# NETWORK_SECURITY_COMPLETION — Project Tracker

> **Status**: In progress
> **Companion**: [Audit](./NETWORK_SECURITY_COMPLETION_AUDIT.md) · [PRD](./NETWORK_SECURITY_COMPLETION_PRD.md) · [Architecture](./NETWORK_SECURITY_COMPLETION_ARCHITECTURE.md) · [Dev Plan](./NETWORK_SECURITY_COMPLETION_DEVELOPMENT_PLAN.md)

> **Merged-From Provenance (2026-07-17):** This project is now the single active tracker for all outstanding network/security/rate-limiting work. The following projects were merged in and their folders archived to `docs/projects/archived/superseded-by-network-security-completion/`:
> - `RECENT_SYSTEM_INTEGRATION_RECOVERY` → Phases 3-4 below (gates, enrollment, acceptance)
> - `NETWORK_SAFETY_AND_SECRETS` → Phase 1 (gate completion/tests) + Phase 3.7 (manual verification checklist)
> - `HEADSCALE_MESH_INTEGRATION` → Phase 4 (three-node acceptance — its only remaining criteria)
> - `MESH_DASHBOARD_UI` → Phase 6 (dashboard enhancements — promoted from deferred per user instruction)
> - `SECRETS_CONSOLIDATION` → fully complete; archived with no carried items
> - Carried skip: NETWORK_SAFETY 1A "remove PID file on uncaughtException" remains intentionally skipped (daemon suppresses uncaught exceptions by design).

---

## ⏳ Phase 0: Containment & Firewall Activation (P0)

Goal: dashboard matches source; changeset protected; firewall actually enforces.

- [x] Audit: prove stale bundle — `election/force` in dist only; source clean
- [x] Audit: prove firewall inert — `loadPolicy()` requires `status: active` (throttled-fetch.mjs:84); live `network-policy.md` has no `status` field
- [x] Audit: prove dist drift spans 8 files (mesh/webhooks pages + clients + SecretsPage)
- [x] Rebuild frontend (`cd frontend && npm run build`) (S)
- [x] Restart server + hard-refresh; verify Mesh, Webhooks, Secrets pages: no 404, no `n.map` (S)
- [x] Commit recovery changeset (~40 modified + untracked modules) (M)
- [x] SSSS `patch` `status: active` onto `memory-vault/system/network-policy.md` (S)
- [x] Reload gate; verify loadPolicy logs non-empty policy (S)
- [x] E2E proof: block test domain via UI → gated fetch rejects "Domain blocked" (S)


## ⏳ Phase 1: Gate Completion — minIntervalMs + Policy Parity (P1)

Goal: every field the firewall UI exposes is actually enforced.

- [ ] Parse `minIntervalMs` in `loadPolicy()` → new `domainMinInterval` map (S)
- [ ] Add `domainLastStart` map (S)
- [ ] Shared `enforceMinInterval(domain)` helper covering BOTH direct path (L337-340) and `drainQueue()` (L205-225) (M)
- [ ] Wire doc global knobs: `max_global_concurrency`, `max_per_domain_concurrency`, `default_timeout_ms`, `whitelist_mode` → mutable config + `loadPolicy()` population (M)
- [ ] Fix watcher: watch parent `system/` dir when policy file absent at boot; attach on create (S)
- [ ] Add `total_blocked` counter on firewall rejects; expose in `getGateStats()` (S)
- [ ] Add `rate_wait_ms` to audit log + append-only SSSS event payload (S)
- [ ] Verify `network_policy` registry schema passes `minIntervalMs` (no key stripping); extend schema if stripped (S)
- [ ] Test: minInterval honored on direct path (fake timers) (S)
- [ ] Test: minInterval honored under queue contention (S)
- [ ] Test: default-off (0/unset) behavior unchanged (S)
- [ ] Test: hot-reload picks up changed minIntervalMs (S)
- [ ] Test: global knobs applied from doc (S)
- [ ] Test: watcher attaches when policy created after boot (S)
- [ ] Test: blocked counter increments + appears in stats (S)
- [ ] Test: global concurrency cap at MAX_GLOBAL_CONCURRENCY (S)
- [ ] Test: per-domain cap at MAX_PER_DOMAIN (S)
- [ ] Test: queue drains when slots free (S)
- [ ] Test: timeout fires AbortController (S)
- [ ] Test: whitelist mode rejects non-whitelisted domains (S)
- [ ] Test: per-domain maxConcurrency override respected (S)
- [ ] Test: getGateStats() counts correct (S)

## ⏳ Phase 2: Election Redesign Verification & Cleanup (P2)

Goal: prove deterministic lowest-IP election; remove retired lease artifacts. (CAS/TOCTOU plan obsolete — no lease writes exist.)

- [ ] Measure failover latency: kill leader, time follower `isLeader()` flip; record bound (M)
- [ ] Verify hostname normalization: no MagicDNS trailing-dot mismatch → no zero-leader state (S)
- [ ] Hysteresis decision: implement min-tenure OR document rejection rationale (S)
- [ ] Archive/annotate vestigial `memory-vault/system/daemon-leader.md` via SSSS (S)
- [ ] Sync HEADSCALE tracker Phase 2A/2B text to deterministic design (S)
- [ ] Remove stale lease-call comments in daemon-loop (S)
- [ ] Test: lowest-IP winner, offline-leader exclusion, hostname normalization (M)

## ⏳ Phase 3: Verification Gates (P1)

Goal: release truth green (closes recovery tracker Phase 5-6 + NETWORK_SAFETY final verification).

- [ ] Full local suite 100% via test skill entrypoint (L)
- [ ] Full Mac Mini suite 100% (L)
- [ ] TypeScript report zero via sanctioned code-quality checker (M)
- [ ] Lint report zero via sanctioned code-quality checker (M)
- [ ] Skill recovery through full-suite gate (S)
- [ ] Audit + remove/relocate root strays: `create-network-policy.mjs`, `test-firewall.mjs` (S)
- [ ] NETWORK_SAFETY manual verification: daemon gate stats ≤6 concurrent via `/api/health`; research task keeps `lsof -i | wc -l` under 20; Network page live stats update; block via UI fails with clear error; `secrets.enc` not valid JSON; all API integrations work through the gate; top-bar indicator reflects gate health (M)
- [ ] `npm test -- --grep "secrets-store"` and `--grep "network"` pass (S)
- [ ] No test/runtime side effects remain (S)

## ⏳ Phase 4: Three-Node Mesh Acceptance (P1)

Goal: headscale acceptance criteria satisfied.

- [ ] USER ACTION: approve Tailscale system extension on laptop (manual)
- [ ] Enroll laptop; `tailscale status` shows 3 nodes (S)
- [ ] Bidirectional pings across all 3 nodes (S)
- [ ] Kill leader → new leader within measured bound; secrets sync lands on follower (M)

## ⏳ Phase 5: Cline Integration (P2)

Goal: Cline first-class surface + integration.

- [ ] `src/core/surface.mjs` CLIENT_SHIMS: `cline: ['.clinerules/total-recall.md']` (S)
- [ ] `src/cli/connect.mjs`: `cline` client entry (file mode, plain render) (S)
- [ ] `src/server/routes/integrations.mjs`: detection via `Code/User/globalStorage/saoudrizwan.claude-dev` (S)
- [ ] `src/core/import-rules.mjs`: `.clinerules/` dir + legacy `.clinerules` file entries (S)
- [ ] `src/core/protect-instructions.mjs`: guard both forms (S)
- [ ] `src/cli/uninstall.mjs`: cleanup lists cover both forms (S)
- [ ] Test: `connect.spec.mjs` cline case writes `.clinerules/total-recall.md` (S)
- [ ] Test: surface compile projects the cline shim (S)

## ⏳ Phase 6: Dashboard Enhancements (P3 — merged from MESH_DASHBOARD_UI)

Goal: finish the remaining mesh/webhook UI work (promoted from deferred per user instruction 2026-07-17).

- [ ] MeshTopology component — SVG node graph visualization (L)
- [ ] Node detail cards (click node → hostname, IP, uptime, latency history) (M)
- [ ] Election history log section (M)
- [ ] Latency matrix (node-to-node ping grid) (M)
- [ ] Fix latency ping: remove `mode: 'no-cors'`, use proper API endpoint (S)
- [ ] Alert rule configuration for mesh events (node offline, leader change) (M)
- [ ] WebhooksPage.css — decouple from MeshPage.css (S)
- [ ] Webhook provider configuration wizard + upgraded Add form (URL, masked secret, event types, enabled toggle) (L)
- [ ] Expandable JSON payload viewer in event log (M)
- [ ] Per-provider delivery stats (total, success rate, avg time) (M)
- [ ] Secret rotation button (S)
- [ ] Dynamic provider filter dropdown from config data (S)
- [ ] Verify webhook VFS configs include secret field (S)
- [ ] Update MeshPage/WebhooksPage specs for new features (M)
- [ ] rAF perf: polling backoff + memoization on Mesh/Network pages (S)

## ⏳ Phase 7: Tracker Hygiene & Final Verification (P2)

Goal: docs match source; project archivable (mandatory final testing phase).

- [ ] Check off verified-done items in archived `MESH_DASHBOARD_UI` docs (Audit §7) (S)
- [ ] Fix archived `NETWORK_SAFETY_AND_SECRETS` summary table + Final Verification boxes (S)
- [ ] Confirm archived trackers carry the superseded-by pointer (S)
- [ ] Final sweep: all PRD §3 success criteria verified (M)
- [ ] Move project folder to `completed/` per archival rule (S)

---

## Verification Log

- 2026-07-17: `grep -l "election/force" frontend/dist/assets/*.js` → `index-D40wCvHM.js` (Jul 16 03:38); source grep → 0 matches
- 2026-07-17: `find frontend/src -newer dist/index-D40wCvHM.js` → 8 files (mesh.ts+spec, webhooks.ts, MeshPage.tsx+spec, WebhooksPage.tsx+spec, SecretsPage.tsx)
- 2026-07-17: `throttled-fetch.mjs` full read (402 lines) — L84 requires `status: active`; live `network-policy.md` frontmatter has NO `status` field → firewall inert; L25-27 hardcode 6/3/15000 ignoring doc knobs; L75-76 watcher only attaches if file exists at boot; L337-340 direct path bypasses queue; L323-335 blocked requests increment no stats counter
- 2026-07-17: `leader-election.mjs` full read (35 lines) — deterministic lowest-mesh-IP design; tryAcquire/renew/release are intentional no-op shims; TOCTOU concern obsolete
- 2026-07-17: `infra/headscale` verified — 0.29.2, loopback-only ports, read-only container, `server_url: https://headscale.ultrachat.app`, healthcheck present
- 2026-07-17: `grep -n "it(" src/core/throttled-fetch.spec.mjs` → 3 tests only
- 2026-07-17: root strays found — `create-network-policy.mjs`, `test-firewall.mjs`
- 2026-07-17: `PUT /api/network/policy` (network.mjs:68-76) passes body through `applyPatch` — minIntervalMs will round-trip; registry schema check still required
- 2026-07-17: `ls .../globalStorage/saoudrizwan.claude-dev` → exists; docs.cline.bot fetched live — `.clinerules/` directory format; skills in `.cline/skills/` invocable as `/<name>`
- 2026-07-17: recovery tracker evidence — focused suite 23 files/110 tests pass; SSSS 0.9.0 conformance green; Headscale 0.29.2 live, 2 nodes enrolled
- 2026-07-18: Phase 0 completed. `npm install lodash-es d3-selection preact` fixed 3 missing transitive deps that blocked `vite build` (react-force-graph-3d/kapsule/float-tooltip); rebuilt `frontend/dist` (new hash `index-Dki2jzcc.js`); confirmed via `curl` + process check that server serves the fresh bundle and no 404s on Mesh/Webhooks/Secrets routes.
- 2026-07-18: Discovered the live global-brain `network-policy.md` (`/Users/greg/.agent/skills/total-recall/memory-vault/system/network-policy.md`) already had `status: active` and 1 blocked domain (`example.com`) prior to this session — firewall was NOT actually inert at runtime; re-confirmed via SSSS `patch` envelope (idempotent) and a direct E2E `throttledFetch('https://example.com/')` call, which correctly threw `Fetch blocked: Domain blocked by firewall policy (example.com)`.
- 2026-07-18: Committed the 91-file recovery changeset (`de1b53e` on `main`) — verified `docs/projects/completed/{HEADSCALE_MESH_INTEGRATION,MESH_DASHBOARD_UI,NETWORK_SAFETY_AND_SECRETS,SECRETS_CONSOLIDATION}` were clean `git`-detected renames into `docs/projects/archived/superseded-by-network-security-completion/`, not data loss. `server.log` added to `.gitignore` and untracked.
- 2026-07-18: code-quality daemons (`start-here-ts.mjs` / `start-here-lint.mjs`) report 0 TS errors / 0 lint issues (stable, 3-pass confirmed) prior to push.
- 2026-07-18: Targeted test confirmation (not full suite, per test-skill laptop guidance) — `throttled-fetch.spec.mjs`, `network.spec.mjs`, `ssss.spec.mjs`, `config.spec.mjs`, `ssss-kernel-bridge.spec.mjs` (39 tests) + `mesh.spec.ts`, `MeshPage.spec.tsx`, `WebhooksPage.spec.tsx` (12 tests) — all 51 pass.
- 2026-07-18: OpenRouter verified end-to-end — `OPENROUTER_API_KEY` in the secrets store validated live against `GET https://openrouter.ai/api/v1/auth/key` (HTTP 200, active paid key); rebound via `secret meta OPENROUTER_API_KEY --repo total-recall`; set as local `preferred_agent` in `brain.json`. Backend (`models.mjs`, `provider-catalog.mjs`, `usage-tracker.mjs`) and frontend (`SecretsPage.tsx`, `UsagePage.tsx`) OpenRouter plumbing already existed and required no code changes.
- 2026-07-18: Recorded a global SSSS preference node (`memory-vault/preferences/preferences-8e65c833.md`, priority high, modality must_not) instructing future sessions to avoid Gemini/Google API calls until the user's outstanding $200 balance is resolved, without removing shared Gemini support code.


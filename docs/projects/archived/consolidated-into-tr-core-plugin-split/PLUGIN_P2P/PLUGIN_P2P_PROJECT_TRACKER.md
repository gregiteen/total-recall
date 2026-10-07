---
type: project_document
title: PLUGIN_P2P — Project Tracker
description: Project Tracker with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# PLUGIN_P2P — Project Tracker

> **Project Prefix**: `PLUGIN_P2P`
> **Kanban State**: In progress — corrections and verification pending
> **Date**: 2026-09-30
> **Reconciliation author**: Codex
> **Based on audit**: [PLUGIN_P2P_AUDIT.md](PLUGIN_P2P_AUDIT.md), current reconciliation

## Current status — reopened verification

Historical checked implementation tasks remain as dated records below. They do not certify the present artifact or the new review/conformance routes. Public independent-user exchange and current release readiness remain pending. The [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md) owns shared blockers PIC-001–005/PIC-021.

## ✅ Phase 0 — Audit and documentation reconciliation

- [x] Reconcile all five P2P documents and the review/badge requirements conflict.
- [x] Distinguish public all-user sharing from optional own-device mesh transport.

## ⏳ Phase 1 — Correction dependencies and scope

- [ ] Resolve opt-in authenticated review-text proposal; do not infer approval of numerical ratings/aggregate social proof (M).
- [ ] PIC-002/003: Prove registered review schema and real persistence lifecycle before review exposure (L).
- [ ] PIC-004: Bind review provenance to authentication and measured conformance to artifact evidence (L).
- [ ] PIC-005: Reconcile route inventory and API contract (M).

## ⏳ Phase 2 — Packaged/installed integrity, privacy and attribution

- [ ] Verify fetched/decoded/installed package checksum agreement and modified-since-install reporting (M).
- [ ] Reject changed header/pin/content and malformed manifests without partial installs or false success events (M).
- [ ] Verify traversal/symlink/size/file-count/interrupted-install handling and cleanup (M).
- [ ] Verify private/mesh-only isolation, public opt-in and unshare revocation (M).
- [ ] Inspect/test package contents for secret-store/session/private-vault/unrelated-data inclusion (M).
- [ ] Test manifest authorship as a claim, authenticated review attribution separately, and hash integrity without false author-verification badges (M).

## ⏳ Phase 3 — Live independent-user exchange

- [ ] Complete public-host share/inspect/install/run with independent sender and recipient outside a shared mesh (L).
- [ ] Verify actual plugin-owned UI and capability behavior from the installed package (L).
- [ ] Verify unsharing and changed-artifact handling; record sanitized logs, environment/date/digest/exit status (M).
- [ ] Complete private two-node mesh install separately (M).

## ⏳ Phase 4 — Final verification and closure

- [ ] Run complete current full Vitest/configured gates on Mac mini as background jobs (L).
- [ ] Verify native backend boot and authenticated plugin browser walkthrough (M).
- [ ] PIC-021: Reconcile current completion claims with evidence and resolve every correction before marking ready (M).

## Reconciliation verification log

- 2026-09-30: Documentation-only updates. No new source/test/deployment changes or live exchange completed.
- Prior current-snapshot Mac mini full baseline: 361 files, 355 pass/6 fail; five snapshot omissions corrected. Affected-file rerun: five pass, route inventory fail; 54 tests pass/1 fail. Historical green results below do not supersede the current failure or satisfy independent-user exchange.

## Requirement conflict and reviewable resolution (PIC-023)

Historical P2P requirements prohibited all ratings, reviews, and verified fields. The later showcase requirements requested real user reviews and conformance displays. Those documents gave agents contradictory instructions. The proposed resolution is genuine opt-in, authenticated authored review text, separate from artifact-bound measured conformance evidence. Neither publisher assertions nor user opinion may generate a verified badge. Invented stars, download numbers, review totals, fabricated status, and manifest-only verification remain prohibited. This is a documented proposal for review, not a claim that Greg approved additional product scope. Numerical ratings and aggregate stars remain outside the agreed correction scope until this conflict is explicitly resolved.

Public person-to-person sharing among independent Total Recall users is the requirement. Private mesh sharing is an additional own-device capability and cannot substitute for the public sender-to-recipient path. A checksum establishes byte integrity; it does not establish author identity, safety, live capability, or independent verification.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded where inconsistent

Original text is retained for traceability. Dated source/test assertions are historical evidence, not certification of the current installed artifact. The reconciliation above controls current planning; no additional product scope is approved by its existence.

# PLUGIN_P2P — Project Tracker

> Living checklist. `[ ]` todo · `[/]` in progress · `[x]` done

## Phase 0 — Docs
- [x] AUDIT (S)
- [x] PRD (S)
- [x] ARCHITECTURE (M)
- [x] DEVELOPMENT_PLAN (S)
- [x] PROJECT_TRACKER (S)

## Phase 1 — Stability + honesty
- [x] `src/server/routes/plugins.mjs`: delete CURATED_CATALOG, ratings helpers, `/rate`, fake fallbacks (M)
- [x] `src/cli/plugin/search.mjs`: `available` / `peers` / `search`, no stars (S)
- [x] `src/core/plugin-context.mjs`: fix const reassignment; mtime-keyed generator import (S)
- [x] `src/core/plugin-runner.mjs` + `plugin-runner-child.mjs` + spec (M)
- [x] `/run` → `config:write`, child process (S)
- [x] Drop `root`/`projectRoot` overrides (S)
- [x] Delete stale `.agent/config/plugin-ratings.json` (held a test-written 4.8★ "review") (S)

## Phase 2 — Layout + bundled
- [x] `plugin-loader.mjs`: `projectPluginsDir`/`globalPluginsDir`/`bundledPluginsDir`, `listBundledPlugins`, `use_cases`, task `command` + cron validation, `resolveProjectRoot` (vault is 4 levels deep, not 3) (M)
- [x] `git mv .agent/plugins/* plugins/` (S)
- [x] `package.json` files += `plugins/` (S)
- [x] meta-harness: **deleted** — imported a function that never existed and duplicated `total-recall harness list` (S)
- [x] system-monitor: honest generator (no mislabelled node count); `sample` task every 15 min (S)
- [x] git-sentinel / code-quality: no `process.exit`, correct argv index (S)
- [x] Manifests: `use_cases`, author "Total Recall", real `$schema` URL (S)
- [x] `metadata.plugin.schema.json`: drop unconsumed `entrypoint`/`hooks`/`ui`/`notifications`/`tools`; add `use_cases`, task `command` (S)
- [x] `src/cli/plugin/create.mjs`: new paths, `--use-case`, no placeholder task, honest templates, argv fix (S)
- [x] `src/cli/init.mjs`: create `skills/total-recall/plugins` not `.agent/plugins` (S)
- [x] `bin/total-recall.mjs`: plugin command exit code honoured (S)
- [x] `scaffold/.agent/plugins/` removed (stale copies shipped in tarball) (S)
- [x] `brain-state.json` (+ scaffold/live copies): `plugins` is per-brain state (S)

## Phase 3 — Store
- [x] `schema.mjs`: `PluginRecordSchema` registered as host extension type (S)
- [x] `plugin-bundle.mjs` + spec (M)
- [x] `plugin-store.mjs` + spec (L)
- [x] CLI install/remove use store (M)

## Phase 4 — P2P
- [x] `src/server/routes/plugins-mesh.mjs` + mount + spec (M)
- [x] `src/core/plugin-peers.mjs` + spec (M)
- [x] CLI `peers`, `share`, `unshare`, `install peer:host/id` (M)
- [x] Route manifest regenerated (S)
- [x] Live peer query against the real mesh: fixed older-version SPA fallback being reported as a JSON parse error; now `unsupported`
- [ ] Live two-node install: Mac mini runs 3.28.0 → needs this version (blocked on release/deploy)

## Phase 8 — Requirement change (2026-09-22): sharing is for ALL users
> User: "plugin sharing is for all users not user's different machines". The Phase 4 transport
> (private Headscale mesh + mesh sync token) only reaches one user's own devices, so it does not
> meet the requirement. Bundle format, store, provenance/hash and install pipeline are reusable.
- [x] Choose direct hash-pinned HTTPS bundle links as the public transport (no central catalog); keep mesh sharing as an own-device convenience
- [x] Update PRD + ARCHITECTURE for person-to-person sharing and the executable-code trust model
- [x] Keep `/api/mesh/plugins*` + "On the mesh" tab for own-device sync, clearly separated from public sharing
- [x] Add a separate `public_shared` opt-in so old mesh-only shares never become public
- [x] Add public bundle route, safe HTTPS fetch, pinned hash verification, CLI/UI share links, and focused tests
- [x] Add a shipped plugin authoring skill with the actual manifest, capabilities, validation, and sharing workflow
- [ ] Live public-host share and install between independent Total Recall users
- [x] Mesh peer URLs now read `brain_port` from each SSSS mesh-node entity; the node records its configured port during its periodic self update
- [x] Found live: "laptop" (100.64.0.3) is a stale Headscale entry, last seen 63d ago; this machine is gregs-macbook-pro (100.64.0.6) (S) — deleted 2026-09-25; the Chromebook joined as `chromebook` (100.64.0.4)

## Phase 5 — Tasks
- [x] `plugin-tasks.mjs` + spec (M)
- [x] `daemon-loop.mjs` wiring (own 60 s timer, per node, stopped on shutdown) (S)
- [x] Live: daemon ran `system-monitor:sample` at the 13:00 slot (recorded in plugin_record + plugin.task_run event)

## Phase 6 — Dashboard
- [x] `frontend/src/api/plugins.ts` types/functions (S)
- [x] `PluginsPage.tsx` rewrite: Installed / Bundled / On the mesh, use-case filter, share toggle, provenance + hash (L)
- [x] `PluginsPage.spec.tsx` (M)
- [x] `docs/ARCHITECTURE.md` plugin section rewritten (S)

## Phase 7 — Verify
- [x] Plugin specs green (Mac mini): 92/92 backend + 4/4 page
- [x] Frontend `tsc -b && vite build` (Mac mini)
- [x] Server boot: `com.totalrecall.brain` restarted on new code, `/health` 200; daemon restarted via `total-recall daemon stop/start`
- [x] Full suite (Mac mini): 1842 passed / 12 failed on first run; all 12 traced to the test copy (unanchored rsync exclude dropped `scaffold/.agent/skills/total-recall/`; `_TR_TEST_AGENT_DIR` hid tts config) and pass on corrected rerun (56/56 + tts 5/5)
- [ ] Browser screenshot of Plugins page (needs a signed-in session)

## Verification Log

- 2026-09-25: Isolated Mac Mini source snapshot — `npm --prefix frontend run build` passed (`tsc -b`, Vite); `npm test` passed 336 files / 1,908 tests. Local fast code-quality gate passed all five checks after copying the generated dashboard bundle. Live cross-user and two-node install checks remain open above.


## Action Log

- 2026-10-07T16:39:48Z — Codex: Consolidated this project into TR_CORE_PLUGIN_SPLIT at Greg's request. Historical checkboxes were preserved as claims; every item is mapped in the successor source register. No implementation completion is inferred from this move.

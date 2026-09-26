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

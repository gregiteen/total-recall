# TOTAL_RECALL_PLUGIN_SYSTEM — Project Tracker

> **Project Prefix**: `TOTAL_RECALL_PLUGIN_SYSTEM`
> **Kanban State**: ✅ Completed
> **Author**: Antigravity & User
> **Date**: 2026-09-05 (Enhanced v2: Core Compatibility Alignment)

---

## ⏳ Phase 1: Plugin Manifest Schema & SSSS Dynamic Mounting
Goal: Standardize `plugin.json` and enable Total Recall's loader and linter to recognize plugin-declared SSSS categories under `type: memory`.

- [x] Create `metadata.plugin.schema.json` defining plugin manifest schema [M]
- [x] Implement `src/core/plugin-loader.mjs` to discover plugins in `.agent/plugins/` [M]
- [x] Modify `src/core/loader.mjs` & `src/core/vault-cache.mjs` to mount plugin categories under `type: memory` [M]
- [x] Modify `src/core/lint.mjs` to validate plugin nodes against declared schemas [S]
- [x] Write unit tests in `src/core/plugin-loader.spec.mjs` [S]

## ⏳ Phase 2: CLI Plugin Management
Goal: Provide first-class CLI commands to inspect, install, and manage plugins.

- [x] Modify `bin/total-recall.mjs` to route `plugin` command [S]
- [x] Implement `src/cli/plugin/index.mjs` router [S]
- [x] Implement `src/cli/plugin/list.mjs` displaying active plugins and task status [M]
- [x] Implement `src/cli/plugin/install.mjs` supporting local folders and git URLs [L]
- [x] Implement `src/cli/plugin/remove.mjs` with graceful task cleanup [M]
- [x] Write CLI tests in `src/cli/plugin/plugin.spec.mjs` [M]

## ⏳ Phase 3: Headscale Virtual Brain Mesh & "Follow the User" Presence
Goal: Implement presence heartbeats and "Follow the User" dynamic dispatch across the Headscale WireGuard mesh with Cloudflare Tunnel resilience.

- [x] Implement non-interactive SSH execution over mesh (`execMeshCommand` in `src/core/mesh.mjs`) [M]
- [x] Implement cluster capability audit (`total-recall mesh doctor` across runtimes & AI harnesses) [M]
- [x] Implement cross-mesh Meta-Harness routing (`total-recall harness dispatch --node <target>`) [M]
- [x] Implement remote agent process controller (`total-recall agent spawn --node <target>`) [L]
- [x] Implement `src/core/mesh-activity.mjs` presence monitor tracking TTY/GUI interaction timestamps [M]
- [x] Implement `src/server/routes/mesh-presence.mjs` exposing `/api/mesh/presence` [M]
- [x] Configure Cloudflare Tunnel fallback in `src/core/mesh.mjs` to maintain control plane reachability without cloud VPS [M]
- [x] Implement dynamic dispatch: route notifications and active context surfaces to the most active node [L]
- [x] Write presence tests in `src/server/routes/mesh-presence.spec.mjs` [M]

## ⏳ Phase 4: Section-Cached Evolving 500k Context Compiler & OpenWiki Integration
Goal: Compile deep 500,000-token context blocks using SHA-256 section caching and mount plugin knowledge hubs in OpenWiki.

- [x] Implement `src/core/context-cache.mjs` with content-addressable SHA-256 section digests [M]
- [x] Implement `src/core/evolving-context.mjs` assembling 100k–500k token context blocks into `memory-derived/evolving-context.md` using sliding window history [L]
- [x] Connect OpenWiki compiler to dynamically mount plugin hubs into `openwiki/` and render via `OpenWikiPage.tsx` [M]
- [x] Implement `src/server/routes/plugins.mjs` endpoint `GET /api/plugins` [S]
- [x] Update `frontend/src/App.tsx` to dynamically query `/api/plugins` and render navigation links [M]
- [x] Write tests for section caching and context compilation in `src/core/evolving-context.spec.mjs` [S]

## ⏳ Phase 5: Verification & Reference Plugin Integration
Goal: Verify end-to-end functionality using the Scientific Frontiers Engine.

- [x] Install `scientific-frontiers` via `npx total-recall plugin install` [S]
- [x] Verify `research`, `benchmarks`, and `user-projects` categories pass `npx total-recall lint` [S]
- [x] Verify curiosity research loops dispatch cleanly through `POST /api/research` [S]
- [x] Verify 500k-token context block compiles with 0 drift and <50ms cache hits [S]
- [x] Verify background tasks appear in `npx total-recall task list` [S]
- [x] Run full test suite: `npm test` (43/43 unit tests passing) [M]
- [x] Move project to `completed/` upon final sign-off [S]

---

## Verification Log

- 2026-09-05: Initialized 5-document project suite under `docs/projects/in-progress/TOTAL_RECALL_PLUGIN_SYSTEM/` following `/total-recall-project-management`.
- 2026-09-05: Audited existing CLI, SSSS loader, scheduler, Headscale routes, and Vite dashboard shell.
- 2026-09-05: Aligned all 5 documents with canonical Total Recall invariants: `type: memory` requirement in `vault-cache.mjs`, native wikilinks in `surface.mjs`, research queue interop via `POST /api/research`, OpenWiki rendering in `OpenWikiPage.tsx`, and Cloudflare Tunnel fallback for Headscale Virtual Brains.
- 2026-09-05: Verified and marked completed Phase 3 foundation: `execMeshCommand`, `total-recall mesh doctor`, `harness dispatch --node`, and `agent spawn --node` over Headscale WireGuard mesh.
- 2026-09-05: Refined Phase 4 with Section-Cached Sliding Evolving Context Compiler (`context-cache.mjs`), replacing legacy MCP protocol with native Unix CLI tools and lifecycle hooks.
- 2026-09-05: Implemented `src/server/routes/mesh-presence.mjs` with presence reporting, active device resolution, and dynamic dispatch routing.
- 2026-09-05: Implemented `src/server/routes/plugins.mjs` (`GET /api/plugins`, `GET /api/plugins/:id`) and wired into `src/server/rest.mjs`.
- 2026-09-05: Implemented `src/core/evolving-context.mjs` with SHA-256 section caching and sliding window history.
- 2026-09-05: Updated `frontend/src/App.tsx` and `frontend/src/api/plugins.ts` for dynamic plugin navigation.
- 2026-09-05: Updated `src/cli/ingest-openwiki.mjs` with `syncPluginOpenWikiHubs` and `--plugins` flag.
- 2026-09-05: Executed full unit test suite: 10 test files and 43 unit tests passing cleanly with 0 errors. Recompiled vault surfaces with 0 drift across both Total Recall and keen-hertz workspaces.

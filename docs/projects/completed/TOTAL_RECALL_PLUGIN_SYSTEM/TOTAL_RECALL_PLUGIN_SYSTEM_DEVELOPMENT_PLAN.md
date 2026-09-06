# TOTAL_RECALL_PLUGIN_SYSTEM — Development Plan

> **Project Prefix**: `TOTAL_RECALL_PLUGIN_SYSTEM`
> **Kanban State**: ✅ Completed
> **Author**: Antigravity & User
> **Date**: 2026-09-05 (Enhanced v2: Core Compatibility Alignment)

---

## 1. Phasing & Dependency Ordering

The development plan is structured into five sequential phases:
* **Phase 1:** Plugin Manifest Schema & SSSS Dynamic Category Mounting (`type: memory`).
* **Phase 2:** CLI Subcommands (`total-recall plugin <list|install|remove>`).
* **Phase 3:** Headscale Virtual Brain Mesh, Cloudflare Tunnel & "Follow the User" Activity Monitoring.
* **Phase 4:** Evolving 500k Context Compiler & OpenWiki Integration.
* **Phase 5:** End-to-End Verification & Scientific Frontiers Reference Integration.

---

## 2. Phase Breakdown & "Done When" Gates

### Phase 1: Plugin Manifest Schema & SSSS Dynamic Mounting
* [ ] Define JSON Schema `metadata.plugin.schema.json` for `plugin.json`.
* [ ] Implement `src/core/plugin-loader.mjs` to discover and validate plugins in `.agent/plugins/`.
* [ ] Update `src/core/loader.mjs` and `src/core/vault-cache.mjs` to dynamically register plugin categories while enforcing `type: memory`.
* [ ] Update `src/core/lint.mjs` to validate nodes in plugin categories against their declared schemas.
* **Done When**: Running `node src/cli/index.mjs lint` passes on a mock plugin category without schema rejection errors.

### Phase 2: CLI Plugin Management
* [ ] Add `plugin` subcommand route in `bin/total-recall.mjs`.
* [ ] Implement `src/cli/plugin/list.mjs` to list installed plugins and their capabilities.
* [ ] Implement `src/cli/plugin/install.mjs` to clone/link a plugin and register its manifest.
* [ ] Implement `src/cli/plugin/remove.mjs` to cleanly unmount categories and cancel tasks.
* **Done When**: Running `npx total-recall plugin list` outputs active plugins with valid metadata.

### Phase 3: Headscale Virtual Brain Mesh & "Follow the User" Presence
* [x] Implement non-interactive SSH execution over mesh (`execMeshCommand` in `src/core/mesh.mjs`).
* [x] Implement cluster capability audit (`total-recall mesh doctor` across runtimes & AI harnesses).
* [ ] Implement `src/core/mesh-activity.mjs` tracking local node heartbeats (TTY/GUI interaction timestamps, active surface).
* [ ] Implement `src/server/routes/mesh-presence.mjs` exposing `/api/mesh/presence` over Headscale overlay network.
* [ ] Configure Cloudflare Tunnel fallback in `src/core/mesh.mjs` to maintain control plane reachability without cloud VPS.
* [ ] Add "Follow the User" dynamic dispatch: route notifications and compiled instruction surfaces to the active device, pinning background workloads to idle compute nodes.
* **Done When**: Simulated presence shift from Node A to Node B redirects test notifications within 5 seconds.

### Phase 4: Section-Cached Evolving 500k Context Compiler & OpenWiki
* [ ] Implement `src/core/context-cache.mjs` with SHA-256 section hashing and memory cache.
* [ ] Implement `src/core/evolving-context.mjs` compiling multi-domain capability subgraphs up to 500,000 tokens into `memory-derived/evolving-context.md` using sliding window history.
* [ ] Connect OpenWiki compiler to dynamically mount plugin hubs into `openwiki/` and render via `OpenWikiPage.tsx`.
* [ ] Implement `GET /api/plugins` endpoint in `src/server/routes/plugins.mjs`.
* [ ] Update `frontend/src/App.tsx` to dynamically query `/api/plugins` and render navigation links.
* **Done When**: Visiting `localhost:3000/openwiki` renders the plugin's knowledge hub natively, and the 500k context block compiles with <50ms cache hits.

### Phase 5: Verification & Reference Plugin Integration
* [ ] Install `scientific-frontiers` as the flagship plugin.
* [ ] Verify SSSS capability nodes compile into the active context surfaces.
* [ ] Verify curiosity research tasks successfully dispatch through `POST /api/research`.
* [ ] Verify Rust daemon tasks are recognized by the Total Recall scheduler.
* [ ] Run full test suite: `npm test` and verify 0 lint warnings and 0 drift.
* **Done When**: All unit and integration tests pass cleanly with 0 drift.

# Layered Brain Architecture — Project Tracker

> **Epic**: Layered Brain Architecture (Global + Project Memory Cascade)
> **Status**: ✅ Complete
> **Start Date**: 2026-05-25
> **Completed**: 2026-05-25
> **Owner**: gregiteen

---

## ✅ Phase 1: Config Resolution

- [x] Add `globalAgentDir`, `globalBrainDir` exports to `config.mjs`
- [x] Add `detectProjectBrain(startDir)` — walks up from cwd, skips home dir
- [x] Add `getActiveBrains()` — returns `{ global, project }` layer objects
- [x] Add `resolveBrainLayer(layer, category)` — auto-detect heuristic by category
- [x] All tests pass after config changes

---

## ✅ Phase 2: Init Command

- [x] Parse `--project` flag in init arg handler
- [x] Default (no flags): create global brain at `~/.agent/skills/total-recall/`
- [x] `--project` flag: create project brain at `<cwd>/.agent/skills/total-recall/`
- [x] Auto-detect existing global brain, skip re-init
- [x] Register project in global brain's `config/project-registry.json`
- [x] Seed appropriate starter nodes per layer
- [x] Compile merged IDE shims after init
- [x] Tests pass

---

## ✅ Phase 3: Merged Vault Compilation

- [x] Add `loadMergedNodes(globalVaultDir, projectVaultDir)` to `vault.mjs`
- [x] Tag each node with `_layer: 'global' | 'project'`
- [x] Slug conflict resolution: project overrides global
- [x] Update `compileSurface()` to accept both vault dirs
- [x] Merge project-level nodes with global nodes
- [x] Tests pass

---

## ✅ Phase 4: Remember / Recall CLI

- [x] Add `--global` / `--project` flag parsing to `remember.mjs`
- [x] Default layer heuristic by category (global: invariant/preference/lore, project: fact/concept/pattern/decision)
- [x] Write to correct brain's vault dir based on layer
- [x] Trigger compile on correct brain after remember
- [x] Add `--global` / `--project` flag parsing to `recall.mjs`
- [x] Default: search both layers (merged)
- [x] Tag results with `[global]` / `[project]` prefix
- [x] Tests pass

---

## ✅ Phase 5: Research at Both Layers

- [x] Per-layer `research-queue.jsonl` via `overrideBrainDir` parameter
- [x] `--global` / `--project` flags on all research subcommands (list, add, status, show, report, cancel)
- [x] All research queue CRUD functions accept optional `brainDir` override
- [x] Tests pass

---

## ✅ Phase 6: Backup / Restore

- [x] Add `--global` / `--project` flags to `backup.mjs`
- [x] Add `--global` / `--project` flags to `restore.mjs`
- [x] Default: back up brain matching CWD context (auto-detect)
- [x] Layer parameter threaded through pushGitBackup and obsidianBackup
- [x] Tests pass

---

## ✅ Phase 7: Connect / Rebuild / Snapshot

- [x] `connect` compiles merged view from both layers (passes `globalVaultDir`)
- [x] `rebuild` uses `getBothBrains()` for merged compilation
- [x] `snapshot rollback` recompiles merged view
- [x] `init --project` passes `globalVaultDir` for merged compilation
- [x] Tests pass

---

## ✅ Phase 8: CLI Quickstart Update

- [x] Update `buildRulesBlock()` injected content to document `--global`/`--project` flags for remember
- [x] Update injected content to document `--global`/`--project` flags for recall
- [x] Example: `npx total-recall remember fact "Uses Drizzle ORM" --project`
- [x] Tests pass

---

## ✅ Phase 9: Testing & Verification

- [x] New test file: `layered-brain.spec.mjs` (11 dedicated tests)
- [x] Tests: `loadMergedNodes()` — global-only, project-only, merged, slug conflict override, empty vaults, many-node merge
- [x] Tests: `parseLayerFlag` — --global, --project, auto, empty args
- [x] Tests: `defaultLayerForCategory` — all category mappings
- [x] Full regression: all 307 tests pass across 40 test files

---

## ✅ Phase 10: Dashboard Brain Selector

- [x] Project registry in global brain's `config/project-registry.json`
- [x] REST API: `GET /api/brains` — list all known brains with frontmatter state
- [x] REST API: `GET /api/brains/:id/nodes` — nodes for a specific brain
- [x] Frontend: `BrainSelector.tsx` dropdown component in sidebar
- [x] Frontend: Layer indicators (indigo=global, emerald=project) with node counts
- [x] Global brain reads project brain metadata for state (name, path, last-compiled, node count)
- [x] Route manifest updated to 67 routes
- [x] Tests pass

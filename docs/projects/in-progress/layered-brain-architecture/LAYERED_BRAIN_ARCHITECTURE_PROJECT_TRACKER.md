# Layered Brain Architecture — Project Tracker

> **Epic**: Layered Brain Architecture (Global + Project Memory Cascade)
> **Status**: ⏳ In Progress
> **Start Date**: 2026-05-25
> **Owner**: gregiteen

---

## ✅ Phase 1: Config Resolution

- [x] Add `globalAgentDir`, `globalBrainDir` exports to `config.mjs`
- [x] Add `detectProjectBrain(startDir)` — walks up from cwd, skips home dir
- [x] Add `getActiveBrains()` — returns `{ global, project }` layer objects
- [x] Add `resolveBrainLayer(layer, category)` — auto-detect heuristic by category
- [x] All 296 tests pass after config changes

---

## ⏳ Phase 2: Init Command

- [ ] Parse `--project` flag in init arg handler
- [ ] Default (no flags): create global brain at `~/.agent/skills/total-recall/`
- [ ] `--project` flag: create project brain at `<cwd>/.agent/skills/total-recall/`
- [ ] Auto-detect existing global brain, skip re-init
- [ ] Register project in global brain's `config/project-registry.json`
- [ ] Seed appropriate starter nodes per layer
- [ ] Compile merged IDE shims after init
- [ ] Tests pass

---

## ⏳ Phase 3: Merged Vault Compilation

- [ ] Add `loadMergedNodes(globalVaultDir, projectVaultDir)` to `vault.mjs`
- [ ] Tag each node with `_layer: 'global' | 'project'`
- [ ] Slug conflict resolution: project overrides global
- [ ] Update `compileSurface()` to accept both vault dirs
- [ ] Update `buildRulesBlock()` to compile from merged nodes
- [ ] Merge project-level `rules/` with global `rules/`
- [ ] Tests pass

---

## ⏳ Phase 4: Remember / Recall CLI

- [ ] Add `--global` / `--project` flag parsing to `remember.mjs`
- [ ] Default layer heuristic by category (global: invariant/preference/correction/lore, project: fact/concept/pattern/decision)
- [ ] Write to correct brain's vault dir based on layer
- [ ] Trigger compile on correct brain after remember
- [ ] Add `--global` / `--project` flag parsing to `recall.mjs`
- [ ] Default: search both layers (merged)
- [ ] Tag results with `[global]` / `[project]` prefix
- [ ] Tests pass

---

## ⏳ Phase 5: Research at Both Layers

- [ ] Per-layer `research-queue.jsonl` (global and project)
- [ ] `--global` / `--project` flags on `research add`
- [ ] Default routing by topic type
- [ ] Daemon processes both queues
- [ ] Research results land in correct brain's `memory-inbox/`
- [ ] Tests pass

---

## ⏳ Phase 6: Backup / Restore

- [ ] Store `backup_remote` in each brain's `config/brain.json`
- [ ] Add `--global` / `--project` flags to `backup.mjs`
- [ ] Add `--global` / `--project` flags to `restore.mjs`
- [ ] Default: back up brain matching CWD context
- [ ] Tests pass

---

## ⏳ Phase 7: Connect / Uninstall

- [ ] `connect` compiles merged view from both layers
- [ ] `uninstall` defaults to project brain only
- [ ] `uninstall --global` removes global brain (with confirmation + backup)
- [ ] `uninstall --all` removes everything
- [ ] Tests pass

---

## ⏳ Phase 8: CLI Quickstart Update

- [ ] Update `buildRulesBlock()` injected content to document `--global`/`--project` flags
- [ ] Verify all IDE shims show updated flags
- [ ] Tests pass

---

## ⏳ Phase 9: Testing & Verification

- [ ] New tests: `detectProjectBrain()` with mock dirs
- [ ] New tests: `loadMergedNodes()` with slug conflicts
- [ ] New tests: `remember --global` / `--project` routing
- [ ] New tests: `recall` merged search with layer tags
- [ ] New tests: backup/restore per-layer
- [ ] Full regression: all existing tests pass
- [ ] Manual: `init` → `init --project` → `remember` → `recall` → `compile` → `backup` end-to-end

---

## ⏳ Phase 10: Dashboard Brain Selector

- [ ] Add `config/project-registry.json` to global brain
- [ ] REST API: `GET /api/brains` — list all known brains with frontmatter state
- [ ] REST API: `GET /api/brains/:id/nodes` — nodes for a specific brain
- [ ] REST API: `POST /api/brains/switch` — set active dashboard context
- [ ] Frontend: Brain selector dropdown in dashboard header
- [ ] Frontend: Show global brain + project brains side-by-side or switchable
- [ ] Global brain reads project brain frontmatter for state (name, status, last-compiled, node count)
- [ ] Tests pass

# Layered Brain Architecture — Development Plan

## Architecture

```
~/.agent/                              ← Global agent dir
  skills/
    total-recall/                      ← GLOBAL BRAIN
      SKILL.md
      memory-vault/                    ← Universal knowledge
        invariants/
        preferences/
        corrections/
        lore/
      config/
        brain.json                     ← includes backup_remote
        project-registry.json          ← tracks known project brains
      memory-inbox/
      memory-derived/
      research-queue.jsonl             ← Global research
      ...

~/my-project/                          ← Any project
  .agent/                              ← Project agent dir
    INSTRUCTIONS.md                    ← IDE shim (user-owned)
    skills/
      total-recall/                    ← PROJECT BRAIN (opt-in)
        SKILL.md
        memory-vault/                  ← Project-specific knowledge
          facts/
          concepts/
          patterns/
          decisions/
        config/
          brain.json                   ← includes backup_remote
        research-queue.jsonl           ← Project research
        ...
  GEMINI.md                            ← Compiled from merged vault
  AGENTS.md                            ← Compiled from merged vault
  ...
```

## Phase 1: Config Resolution ✅

- [x] `globalAgentDir` / `globalBrainDir` constants
- [x] `detectProjectBrain(startDir)` — walks up from cwd, skips home
- [x] `getActiveBrains()` — returns `{ global, project }`
- [x] `resolveBrainLayer(layer, category)` — auto-detect with category heuristic

## Phase 2: Init Command ✅

Modify `src/cli/init.mjs`:

1. **`npx total-recall init`** (no flags) → creates global brain at `~/.agent/skills/total-recall/`
   - Seeds universal starter nodes: invariants/operating-instructions, preferences/topic-research-sop
   - Creates config, memory-vault, memory-inbox, memory-derived dirs
   - Compiles IDE shims in CWD

2. **`npx total-recall init --project`** → creates project brain at `<cwd>/.agent/skills/total-recall/`
   - Seeds project starter nodes: decisions/, facts/ templates
   - Registers project in global brain's `config/project-registry.json`
   - Compiles merged IDE shims

3. **Auto-detect on repeat runs**: if global brain exists and no `--project`, skip global init and just compile shims

## Phase 3: Merged Vault Compilation ✅

Modify `src/core/vault.mjs` and `src/core/surface.mjs`:

1. New `loadMergedNodes(globalVaultDir, projectVaultDir)`:
   - Load all nodes from global vault
   - Load all nodes from project vault
   - Deduplicate by slug (project wins)
   - Tag each node with `_layer: 'global' | 'project'`

2. Update `compileSurface()` to accept both vault dirs
3. Update `buildRulesBlock()` to use merged nodes
4. Project-level `rules/` (invariants.md, preferences.md, corrections.md) merge with global

## Phase 4: Remember / Recall CLI ✅

Modify `src/cli/remember.mjs` and `src/cli/recall.mjs`:

1. Add `--global` / `--project` flags to arg parser
2. Default layer by category:
   - Global: invariant, preference, correction, lore
   - Project: fact, concept, pattern, anti-pattern, decision
3. `recall` searches both layers by default, results tagged with layer
4. `recall --global` / `--project` filters to single layer

## Phase 5: Research at Both Layers ✅

Modify `src/core/research.mjs` and `src/core/research-queue.mjs`:

1. Each brain has its own `research-queue.jsonl`
2. `npx total-recall research add "topic" --global/--project`
3. Daemon processes both queues
4. Results land in the appropriate brain's memory-inbox

## Phase 6: Backup / Restore ✅

Modify `src/cli/backup.mjs` and `src/cli/restore.mjs`:

1. Each brain's `config/brain.json` stores its own `backup_remote`
2. `--global` / `--project` flags on backup/restore
3. Default: backs up whichever layer matches CWD context

## Phase 7: Connect / Rebuild / Snapshot ✅

Modify `src/cli/connect.mjs` and `src/cli/uninstall.mjs`:

1. Connect compiles merged view from both layers
2. Uninstall defaults to project brain only
3. `--global` removes global brain (with confirmation)
4. `--all` removes everything

## Phase 8: CLI Quickstart Update ✅

Update the injected directives block in `surface.mjs` to document `--global`/`--project` flags.

## Phase 9: Tests ✅

1. Config: test `detectProjectBrain()`, `getActiveBrains()`, `resolveBrainLayer()`
2. Vault: test `loadMergedNodes()` with slug conflicts
3. CLI: test `--global`/`--project` flag routing
4. Surface: test merged compilation output
5. Full regression: all 296+ tests pass

## Phase 10: Dashboard Brain Selector ✅

1. Add `config/project-registry.json` to global brain
2. REST API: `GET /api/brains` — list all known brains with state
3. REST API: `GET /api/brains/:id/nodes` — nodes for a specific brain
4. REST API: `POST /api/brains/switch` — set active dashboard context
5. Frontend: Brain selector dropdown in header
6. Global brain reads project brain frontmatter for state display

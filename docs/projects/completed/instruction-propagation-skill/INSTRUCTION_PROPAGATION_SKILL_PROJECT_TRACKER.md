# Instruction Propagation & Master Agent Skill Project Tracker

- **Plane**: Projects
- **Status**: In Progress
- **Created**: 2026-05-20
- **Last Updated**: 2026-05-20
- **Rule**: Do not mark any item complete unless the implementation is verified and the file/function evidence is listed next to the item. A false completion is worse than an honest gap.

## Canonical Goal

Ensure that every single IDE rules file (symlinks and real shims) has the complete, comprehensive guide detailing what Total Recall is, how to use it, local and cloud resource mappings, SSSS v2 schema, and MCP/skills heuristics. Equip local agents with a dedicated, self-documenting master skill package under `.agent/skills/total-recall/` containing detailed specification of the entire app setup, VFS directory topologies, SSSS protocol, CLI parameter reference, troubleshooting, and automated upstream repository sync script.

---

## 🧭 WHEN TO USE IT: The Ultimate Heuristic Guide

To avoid structural hallucinations, AI agents must strictly follow these rules on when and how to use the different Total Recall systems:

### 1. When to Use the SSSS Memory Vault (MCP Tools / REST APIs)
*   **Reading Memory (`semantic_search`, `recall_node`, `list_nodes`)**: Use **semantic search** or node recall at the start of any new programming task or when exploring past decisions. It is the core mechanism to retrieve developer preferences, lessons learned, and active architectural invariants.
*   **Writing Memory (`write_node`)**: Autonomously write a new SSSS memory node whenever you receive a direct instruction correction from the developer, establish a new recurrent design pattern, or fix a tricky system bug. 
*   **Modifying Memory**: Update existing memory nodes when system structures evolve. Do NOT write speculative facts; use the Inbox/Draft system.

### 2. When to Use the Master `total-recall` Skill (`.agent/skills/total-recall/`)
*   **Diagnosing Setup Issues**: Read and trigger this skill whenever the local developer workspace experiences connection timeouts, database-free VFS sync errors, or surface-compilation conflicts.
*   **Maintaining the OS Environment**: Use this skill when modifying the system's runtime paths, updating the background research daemon agendas, or troubleshooting CLI parameter pipelines.
*   **Upstream Sync (`sync-repo.mjs`)**: Execute the sync runner (`node .agent/skills/total-recall/scripts/sync-repo.mjs`) when launching a new environment session or when standard skill and core invariant templates need to be updated from the upstream repository.

### 3. When to Use Custom Slash Commands (IDE Antigravity & Gemini)
*   **`/memory <query>` or `/recall <query>`**: Use to quickly run high-speed vector searches on the local memory vault directly from the IDE's prompt bar.
*   **`/vault compile`**: Trigger this command immediately after creating, updating, or deleting any memory node to rebuild your active system shims.

---

## [x] Phase 1: Enriching Surface System Documentation

- [x] Modify `src/core/surface.mjs` to expand `buildSystemDocs()`.
  - [x] Add the **Troubleshooting & Local Self-Healing** section detailing recipes for port conflicts, daemon restarts, PAT auth issues, and compiler blocks.
  - [x] Add **Cloud Resource & Upstream Mapping** detailing official templates, repository mappings, and community packages.
  - [x] Define a clean, decoupled **Tool Heuristics Guide** for local skills, keeping the core Total Recall system documentation completely separate from any unrelated custom skills (e.g. code-quality).
- [x] Compile and verify the enriched system documentation propagates cleanly to `INSTRUCTIONS.md` and replicates across all existing file shims without disrupting existing content.
  - Evidence: `npx total-recall compile` outputs the updated system block inside all shims.

---

## [x] Phase 2: Developing the Master `total-recall` Skill

- [x] Create the skill package directories under `.agent/skills/total-recall/` (`references/`, `scripts/`, `evals/`, `subagents/`).
  - Evidence: Directories and folders exist locally and in the scaffold.
- [x] Write `.agent/skills/total-recall/SKILL.md` with high-priority naming triggers, description, and SSSS frontmatter.
  - Evidence: [SKILL.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/SKILL.md)
- [x] Write `.agent/skills/total-recall/references/architecture-reference.md` containing a comprehensive map of the codebase, VFS, and daemon.
  - Evidence: [architecture-reference.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/references/architecture-reference.md)
- [x] Write `.agent/skills/total-recall/references/ssss-reference.md` containing detailed SSSS v2 frontmatter templates, category taxonomy, and lifecycle states.
  - Evidence: [ssss-reference.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/references/ssss-reference.md)
- [x] Write `.agent/skills/total-recall/references/cli-reference.md` mapping all CLI commands and REST endpoints.
  - Evidence: [cli-reference.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/references/cli-reference.md)
- [x] Write `.agent/skills/total-recall/references/troubleshooting.md` with step-by-step diagnostic workflows.
  - Evidence: [troubleshooting.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/references/troubleshooting.md)
- [x] Write verification evaluations (`evals/evals.json`) and subagent prompts (`subagents/total-recall-diagnostician.md`).
  - Evidence: [evals.json](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/evals/evals.json) and [total-recall-diagnostician.md](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/subagents/total-recall-diagnostician.md)

---

## [x] Phase 3: Implementing the Upstream Repository Sync Script

- [x] Create `.agent/skills/total-recall/scripts/sync-repo.mjs`.
  - [x] Add upstream fetching logic to pull standard skill files and core invariant templates.
  - [x] Implement non-destructive merge logic preserving custom user-written memory nodes.
  - [x] Wire automatic compilation (`compileSurface`) post-merge.
  - [x] Implement robust error handling for rate-limiting, offline states, and git status validation.
  - Evidence: [sync-repo.mjs](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/scripts/sync-repo.mjs)
- [x] Register sync command aliases in `total-recall` CLI router for easy execution.
  - Evidence: CLI [total-recall.mjs](file:///Users/greg/Github/total-recall/bin/total-recall.mjs) maps `sync` to [sync.mjs](file:///Users/greg/Github/total-recall/src/cli/sync.mjs).

---

## [x] Phase 4: CLI Scaffolding & Integration

- [x] Copy the complete `.agent/skills/total-recall/` package into `scaffold/.agent/skills/total-recall/`.
  - Evidence: Replicated exact files, evals, and subagents to scaffold/ folder.
- [x] Update `src/cli/init.mjs` to copy the `total-recall` skill folder during workspace bootstrapping.
  - Evidence: `skillsToSeed` in [init.mjs](file:///Users/greg/Github/total-recall/src/cli/init.mjs).
- [x] Update `bootstrapAgentDir()` in `src/cli/connect.mjs` to copy only the master `total-recall` skill folder, keeping the client workspace clean and consolidated.
  - Evidence: `skillsToCopy` in [connect.mjs](file:///Users/greg/Github/total-recall/src/cli/connect.mjs).

---

## [x] Phase 5: Verification & Automated Quality Checks

- [x] Add automated smoke test to `src/cli/connect.spec.mjs` verifying that connection correctly seeds the master `total-recall` skill folder.
- [x] Run typescript full checks: `node .agent/skills/code-quality/scripts/start-here-ts.mjs` returns `0 TS errors`.
- [x] Run linter checks: `node .agent/skills/code-quality/scripts/start-here-lint.mjs` returns `0 lint problems`.
- [x] Execute `npx total-recall compile` and verify clean execution with the newly compiled skill.

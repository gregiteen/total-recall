# Instruction Propagation & Master Agent Skill Development Plan

- **Plane**: Projects
- **Status**: In Progress
- **Created**: 2026-05-20

This plan sequences the development steps required to implement the comprehensive instruction-propagation features and the master `total-recall` skill package. Steps are ordered to build foundations first, followed by the skill assets, execution scripts, and finally integration and verification.

---

## Phase 1 — Enriching surface System Documentation

In this phase, we will expand `src/core/surface.mjs` to inject absolute comprehensive domain documentation into the Tier 1 instructions block (`INSTRUCTIONS.md` and all shims).

- **Modify `buildSystemDocs()` in `src/core/surface.mjs`**:
  - Add a **Troubleshooting & Local Self-Healing** section detailing how to fix common daemon failures (e.g. port already in use), PAT token authentication issues, VFS compilation errors, and vector search indexing lag.
  - Add a **Cloud Resource & Upstream Mapping** section detailing where official templates reside, repo references, and community registry points.
  - Enrich **Tool Selection Heuristics** with explicit warning patterns (e.g. "NEVER run raw eslint or tsc, always use the code-quality start-here wrappers").
- **Verify Injection**:
  - Run `npx total-recall compile` to ensure the new documentation compiles cleanly into `INSTRUCTIONS.md` and replicates across all existing file shims (`.cursorrules`, `CLAUDE.md`, etc.).

---

## Phase 2 — Developing the Master `total-recall` Skill

Create a dedicated skill package under `.agent/skills/total-recall/` containing the complete codebase manual to eliminate IDE agent hallucinations.

- **Create Skill Structure**:
  - Setup directories: `references/`, `scripts/`, `evals/`, `subagents/`.
- **Create `SKILL.md`**:
  - Include SSSS frontmatter, naming triggers (e.g. `total-recall`, `ssss`, `vfs`, `indexing`, `surface compilation`), name, and description.
  - Author a highly structured overview of the Sovereign OS principles, how the SSSS memory layers cooperate, and when to invoke diagnostic tools.
- **Create Reference Manuals**:
  - `references/architecture-reference.md`: Comprehensive map of the repository, including folders, CLI command routes, VFS specs, daemon structures, and background task loops.
  - `references/ssss-reference.md`: Detailed SSSS v2 frontmatter formats, category taxonomies, conflict detection rules, and memory lifecycle states.
  - `references/cli-reference.md`: Exhaustive guide to CLI commands (`doctor`, `backup`, `status`, `chat`, `friction`, `compile`) and REST API endpoints.
  - `references/troubleshooting.md`: Step-by-step diagnostic recipes for the agent to resolve failures.

---

## Phase 3 — Implementing the Upstream Repository Sync Script

Develop a lightweight, secure sync script allowing local workspaces to sync and merge their skills and core invariants with the official repo.

- **Create `scripts/sync-repo.mjs`**:
  - Fetch latest skill definitions and invariant files from the official repository (configured in `brain.json` or fallback URL `https://github.com/gregiteen/total-recall`).
  - Merge incoming rules non-destructively: preserve local user-written custom memory nodes, while updating standard core skill assets.
  - Call `compileSurface` automatically after successful sync to propagate any updated rules.
  - Add robust error handling (offline state, rate-limits, uncommitted workspace changes).

---

## Phase 4 — CLI Scaffolding & Integration

Integrate the master skill into deployment and setup pipelines so that every user installation automatically receives the skill.

- **Seed Scaffold**:
  - Duplicate the built `.agent/skills/total-recall/` skill package into `scaffold/.agent/skills/total-recall/`.
- **Integrate into `init.mjs`**:
  - Update `src/cli/init.mjs` with a new step to copy `skills/total-recall` from scaffold to the local workspace skills folder.
- **Integrate into `connect.mjs`**:
  - Update `bootstrapAgentDir()` in `src/cli/connect.mjs` to copy the `total-recall` skill folder along with the `ssss` skill folder.

---

## Phase 5 — Verification & Automated Quality Checks

Execute standard checks and add automated tests to guarantee zero regressions.

- **Integrate Smoke Test**:
  - Add test coverage in `src/cli/connect.spec.mjs` or a separate spec file verifying that `total-recall` is successfully copied during connection.
- **Run Quality Suite**:
  - Execute `node .agent/skills/code-quality/scripts/start-here-ts.mjs` and resolve any compilation errors.
  - Execute `node .agent/skills/code-quality/scripts/start-here-lint.mjs` and resolve any linter issues.
- **Verify End-to-End**:
  - Execute `npx total-recall compile` and verify the entire output system matches the updated documentation.

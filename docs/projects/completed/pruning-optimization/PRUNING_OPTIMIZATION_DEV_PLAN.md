# Pruning Optimization Development Plan

## Goal
Implement a refined, automatic storage pruner within the Dream Cycle daemon to automatically purge temporary logs, speculative drafts, and transient planning files while permanently preserving conversation threads, historical transcripts, and active research projects in progress.

## Why this matters for the OS
As an autonomous sovereign system, Total Recall must run 24/7. speculative background research iterations and transient planning artifacts (such as implementation plans, task trackers, and walkthrough metadata files) can generate significant Virtual File System (VFS) clutter. A clean brain ensures low index latency, fast semantic search, and robust operation without risk of overpruning active intelligence.

## Proposed Architecture

### 1. Active Research Project Preservation
* **Mechanism**: Prior to pruning `memory-inbox/`, read `.agent/skills/total-recall/research-queue.jsonl` dynamically.
* **Extraction**: Collect all `node_slug` values where status is `'pending'` or `'in_progress'`.
* **Guard**: When traversing `memory-inbox/pending/`, skip files corresponding to these active slugs (e.g., `<slug>.md`). This ensures active, long-running research is never cut short.

### 2. Transient Conversation Plan Purging
* **Target**: The IDE's transient app data brain folder (`~/.gemini/antigravity/brain/`).
* **Traversing**: Read all conversation subdirectories (each corresponds to a UUID thread ID).
* **Purge**: Delete all files at the root of the conversation subdirectories (like `implementation_plan.md`, `task.md`, `walkthrough.md`, and their `*.metadata.json` companions) older than 24 hours.
* **Exempt**: Strictly ignore the `.system_generated` subdirectory and any subfolders inside it, ensuring complete, permanent preservation of transcripts, message history, and thread logs.

---

## Technical Details

### `src/core/dream.mjs`
Update `autoPruneStorage` to:
1. Import `loadQueue` from `./research-queue.mjs` to fetch active research projects.
2. Construct a `Set` of active `node_slug`s.
3. Enhance `pruneDir` to accept a callback or an exclusion list to avoid unlinking protected research drafts.
4. Locate the Antigravity App Data directory (resolving `~/.gemini/antigravity`) and walk its `brain/` directory to prune transient files at the root of conversation folders while protecting `.system_generated`.

---

## Verification Plan

### Automated Tests
- Create `src/core/pruning-optimization.spec.mjs` using Vitest to assert:
  - Speculative drafts from failed or completed research are pruned.
  - Active research drafts are NOT pruned.
  - Transient planning/meta files inside conversation folders are pruned if older than 24 hours.
  - The `.system_generated` directory and its logs are preserved perfectly.
- Run tests: `npm run test`

# Development Plan: Research Project Summary Node Pruning

Step-by-step phases to execute, verify, and push changes.

---

## Phase 1: Conditional Node Sync & Cleanup
- Edit `syncResearchProjectNode()` in `src/core/research-queue.mjs` to restrict markdown generation strictly to `done` items.
- Ensure any `pending`, `in_progress`, or `failed` item automatically triggers `deleteNode()` to purge stale summaries.

## Phase 2: Self-Healing Sync Refactoring
- Edit the self-healing loader in `loadQueue()` in `src/core/research-queue.mjs`.
- Remove any automatic creation check for non-`done` status, and instead clean up files if they exist.

## Phase 3: Verification & Archival
- Run `node bin/total-recall.mjs lint --strict` to assert linter compliance.
- Run `npm test` or `npx vitest run` to verify no regressions in research queue tests.
- Archive the project folder to `completed/` when verified.

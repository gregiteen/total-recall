# Pruning Optimization Project Tracker

- `[ ]` uncompleted tasks
- `[/]` in progress tasks
- `[x]` completed tasks

## ✅ Phase 1: Research Queue Preservation
- [x] Load the active research queue from `research-queue.jsonl` in `autoPruneStorage`
- [x] Collect active `node_slug`s of pending or in_progress research projects
- [x] Enhance `pruneDir` to exempt active slugs from pruning in the `memory-inbox` directory

## ✅ Phase 2: Transient conversation Plan Purging
- [x] Resolve the location of `~/.gemini/antigravity` App Data directory
- [x] Traverse the `brain` folder within the App Data directory
- [x] Purge root-level planning files (`implementation_plan.md`, `task.md`, `walkthrough.md`, `*.metadata.json`) older than 24 hours
- [x] Guarantee absolute preservation of the `.system_generated` folder within conversation folders

## ✅ Phase 3: Testing & Verification
- [x] Write Vitest unit tests in `src/core/pruning-optimization.spec.mjs` verifying the new rules
- [x] Run the test suite and verify 100% test completion
- [x] Verify that no lints or TypeScript warnings are introduced

# Project Tracker: Dynamic CLI Agent Selection

- `[ ]` uncompleted tasks
- `[/]` in progress tasks
- `[x]` completed tasks

## ✅ Phase 1: Core Implementation
- [x] Refactor `loadRuntimeConfig()` in `src/core/runtime.mjs` to dynamically parse the `--agent` parameter from process arguments.
- [x] Implement reading the `preferred_agent` field from `brain.json` config.
- [x] Implement reading memory-preference matching from the compiled `INSTRUCTIONS.md` or `GEMINI.md` / `AGENTS.md` surfaces.
- [x] Implement dynamic priority promotion (set priority to `0` and sort) for the resolved preferred agent.

## ✅ Phase 2: Testing & Verification
- [x] Add comprehensive unit tests in `src/core/runtime.spec.mjs` or a new test file verifying all 4 priority tiers.
- [x] Run typescript compiler quality checks: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Run linter checks: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Run full Vitest conformance suite: `npx vitest run`

## ✅ Phase 3: Archival
- [x] Run strict memory validator checks: `node bin/total-recall.mjs lint --strict`
- [x] Move project to `completed/` directory

# Sovereign Policy Enforcement & Verification — Development Plan

This plan details the step-by-step implementation phases for updating rule compaction, live catalog generation, quality gates, and programmatic evals check.

## Implementation Steps

### Phase 1: Core Compiler Truncation Bypass
- Update `heuristicCompact` in `src/core/surface.mjs` to check for `invariants`, `preferences`, and `anti-patterns` categories.
- Return full body contents (multi-line layout indented by 2 spaces) rather than truncating to 180 characters.

### Phase 2: Live Index & Log Generators
- Implement `generateLiveIndex(vaultDir)` inside `src/core/okf-adapter.mjs` following OKF spec §6.
- Implement `generateLiveLog(vaultDir)` inside `src/core/okf-adapter.mjs` following OKF spec §7.
- Add live generation hook call inside `compileSurface` (`src/core/surface.mjs`).

### Phase 3: Legacy Skills Standardization
- Clean up legacy skill profiles: `cli-agents`, `research`, `ssss`, `test`, `total-recall`.
- Create empty scripts/references/evals/subagents folders and `.gitkeep` files where missing.
- Remove SSSS metadata properties (`type`, `schema_version`) from frontmatter in these skills.

### Phase 4: Quality Gate Integration
- Add Skill Optimization spec compliance checker to `scripts/code-quality-gate.mjs`.
- Add non-blocking OKF Compliance check (`lint --okf`) to `scripts/code-quality-gate.mjs`.

### Phase 5: Programmatic Evals spec test
- Create `src/core/skills-evals.spec.mjs` to programmatically assert and verify assertions in the skills' `evals.json` files.

### Phase 6: Compile & Verify
- Sync scaffolds using `node scripts/sync-scaffold.mjs`.
- Re-compile the vault using `npx total-recall compile`.
- Verify generated shims (`GEMINI.md`, `AGENTS.md`) and live catalog files (`index.md`, `log.md`).

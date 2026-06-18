# Sovereign Policy Enforcement — Project Tracker

> **Status**: In Progress
> **Date**: June 18, 2026
> **Companion Docs**:
> - [SOVEREIGN_POLICY_ENFORCEMENT_PRD.md](./SOVEREIGN_POLICY_ENFORCEMENT_PRD.md)
> - [SOVEREIGN_POLICY_ENFORCEMENT_ARCHITECTURE.md](./SOVEREIGN_POLICY_ENFORCEMENT_ARCHITECTURE.md)
> - [SOVEREIGN_POLICY_ENFORCEMENT_DEV_PLAN.md](./SOVEREIGN_POLICY_ENFORCEMENT_DEV_PLAN.md)

---

## ⏳ Phase 1: Core Compiler Truncation Bypass

- [x] Modify `heuristicCompact(node)` in `src/core/surface.mjs` to exempt invariants/preferences/anti-patterns
- [x] Format multi-line bodies with indentation to keep list items valid in Markdown

---

## ⏳ Phase 2: Live Index & Log Generators

- [x] Implement SPEC-compliant `generateLiveIndex` in `src/core/okf-adapter.mjs` (type-grouped `#` headers, `*` bullets)
- [x] Implement SPEC-compliant `generateLiveLog` in `src/core/okf-adapter.mjs` (date-grouped `## YYYY-MM-DD` headers, `*` bullets)
- [x] Update `compileSurface` in `src/core/surface.mjs` to trigger live index/log generation

---

## ⏳ Phase 3: Legacy Skills Standardization

- [x] Create scripts/evals/subagents folders and `.gitkeep` files for `cli-agents`
- [x] Remove SSSS metadata from `cli-agents/SKILL.md` frontmatter
- [x] Create scripts/references/evals/subagents folders and `.gitkeep` files for `research`
- [x] Remove SSSS metadata from `research/SKILL.md` frontmatter
- [x] Remove SSSS metadata from `ssss/SKILL.md` frontmatter
- [x] Create scripts/references/subagents folders and `.gitkeep` files for `test`
- [x] Remove SSSS metadata from `total-recall/SKILL.md` frontmatter

---

## ⏳ Phase 4: Quality Gate Integration

- [x] Integrate skill optimization check (`enforce-skill-optimization.mjs`) into `scripts/code-quality-gate.mjs`
- [x] Integrate non-blocking OKF compliance check (`lint --okf`) into `scripts/code-quality-gate.mjs`

---

## ⏳ Phase 5: Programmatic Evals Spec Test

- [x] Create programmatic evals test file `src/core/skills-evals.spec.mjs`
- [x] Add Vitest assertions mapping to skill `evals.json` criteria

---

## ⏳ Phase 6: Testing & Verification

- [x] Re-run scaffold sync script (`node scripts/sync-scaffold.mjs`)
- [x] Re-compile the vault (`npx total-recall compile` with cache bypass)
- [x] Run linting/typechecking via start-here scripts, and Vitest suite manually (replaced deleted `scripts/code-quality-gate.mjs`)
- [x] Inspect generated shims (`INSTRUCTIONS.md`, etc.) to verify full rules are rendered
- [x] Inspect generated live catalog files (`index.md`, `log.md`) to verify OKF spec compliance
- [ ] Commit all changes and verify git status is clean

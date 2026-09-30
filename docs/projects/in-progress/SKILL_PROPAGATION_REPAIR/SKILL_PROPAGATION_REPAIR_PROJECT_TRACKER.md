# SKILL_PROPAGATION_REPAIR — Project Tracker

> **Project Prefix**: `SKILL_PROPAGATION_REPAIR`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: `SKILL_PROPAGATION_REPAIR_AUDIT.md` (Complete, `e5d9aad`)

---

## ✅ Phase 0: Audit

- [x] Complete the evidence-based audit and finding register.
- [x] Capture Mac mini baseline: 360 test files passed, one failed; 2,207 tests passed, two failed in existing plugin CLI expectations.

## ✅ Phase 1: Regression cases

- [x] Add failing package and collision cases in `src/core/skills-registry.spec.mjs` for A-001 to A-003.
- [x] Add a support-file template case in `src/cli/sync-repo.spec.mjs` for A-004.
- [x] Run focused tests on the Mac mini: four new registry cases failed as expected; the scaffold case passed.

## ✅ Phase 2: Implementation

- [x] Update package hashing, timestamp selection, and install ownership metadata in `src/core/skills-registry.mjs` (A-001, A-002).
- [x] Reconcile removed managed files while preserving repository-only files (A-002).
- [x] Reject unadopted same-name collisions in deploy and sync (A-003).
- [x] Remove unreferenced `scripts/launch-active-workers.mjs` after the open-source gate identified hardcoded personal paths (A-005).
- [x] Update stale bundled-plugin filter expectations in `src/cli/plugin/plugin.spec.mjs` so the full gate tests behavior against the current catalog (A-006).
- [x] Confirm existing CLI conflict output is sufficient; no `src/cli/skill.mjs` edit needed.

## ⏳ Phase 3: Verification and handoff

- [ ] Pass focused registry, CLI, and template sync specs on the Mac mini.
- [ ] Run the full sanctioned remote quality gate, with baseline plugin failures separated from new failures.
- [ ] Rehearse source-exact package propagation and collision safety in temporary repositories.
- [ ] Update `HANDOFF.md` with verified behavior and remaining limits.
- [ ] Inspect Git diff and confirm unrelated pre-existing changes remain intact.

## Verification Log

- 2026-09-30: `npm test` on Mac mini from isolated `e5d9aad` archive — exit 1; 360/361 files and 2,207/2,209 tests passed. Failures: two `src/cli/plugin/plugin.spec.mjs` expectations that omit newly bundled plugins.
- 2026-09-30: Focused red run on Mac mini — 4 expected failures, 43 passes across registry and scaffold specs.
- 2026-09-30: Focused green run on Mac mini — 3 files, 60 tests passed, exit 0.
- 2026-09-30: First remote quality gate on isolated archive — scaffold state and SSSS registry passed; dist check lacked the ignored bundle; open-source scan found three references in an unreferenced one-off launcher; full suite retained the two baseline plugin CLI failures (2,213/2,215 tests passed).

## Continuation A-007

- [ ] Reproduce false global-source repository ownership in isolated regression on Mac mini, fix configured-global source classification while preserving actual repo boundaries, then verify CLI PM dry-run and complete-tree suite.
- [x] A-007: three isolated global-root cases fail before fix; narrow ownership fix passes complete registry spec (45/45) on Mac mini, preserving explicit scoped and true repository-owned guards.
- [ ] Coordinator: verify live CLI PM dry-run and complete changed-tree suite after A-007; propagate only authorized shared package afterward.

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-09-30T19:30:01Z | Codex /root/showcase_docs | Batched reads: local TR/test/quality skills, skills-registry ownership/spec/config, existing audit and tracker; CLI mesh help/access | A-007 already planned before edits; confirmed install-map ownership is checked before global-root classification. Resolved sanctioned host through CLI metadata. No secrets read or laptop tests | A-007 audit continuation; tool outputs |
| 2026-09-30T19:32:22Z | Codex /root/showcase_docs | Added three isolated default/configured/nested-global regressions to skills-registry.spec.mjs; transferred only spec with rsync; launched remote red fixture run through mesh exec in background | Fixtures use temporary roots and restored env/os spy; actual repository and explicit scoped protections asserted. Red run pending; no implementation change yet | Mac-mini /tmp/tr-plugin-audit.g5cyvh/a007-red.log and .exit |
| 2026-09-30T19:34:30Z | Codex /root/showcase_docs | Read remote red log/exit via mesh exec; made narrow repoForSkillPath ownership correction; transferred only registry implementation/spec; launched full registry-spec remote background run | Red: three selected regressions failed as expected, exit1. Global physical skill roots now classified before install-map/inferred ownership; isRepoScopedSkill explicit/live scoped guards unchanged. Green result pending | Mac-mini a007-red.log/.exit; a007-green.log/.exit under same isolated archive |
| 2026-09-30T19:35:47Z | Codex /root/showcase_docs | Checked initial green log/exit via mesh exec, reviewed scoped Git numstat; relaunched green with evidence outside synced archive and notified coordinator | Initial log/exit absent; cause not confirmed, so no green claimed. Retrying outside archive protects evidence against concurrent rsync --delete. Prior unrelated registry edits preserved | Mac-mini /tmp/tr-a007-green.log and .exit; read attempt exit1 |
| 2026-09-30T19:36:46Z | Codex /root/showcase_docs | Read completed remote full registry-spec result through mesh exec; reported stable implementation and verification to coordinator | 1 file /45 tests passed, exit0, 699ms; includes three new global-root regressions and existing scoping/collision guards. No deployment or complete-tree pass claimed | Mac-mini /tmp/tr-a007-green.log and .exit; targeted node Vitest command above |

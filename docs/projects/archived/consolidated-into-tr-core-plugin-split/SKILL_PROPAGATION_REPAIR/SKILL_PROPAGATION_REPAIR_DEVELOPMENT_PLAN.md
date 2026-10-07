> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.

# SKILL_PROPAGATION_REPAIR — Development Plan

> **Project Prefix**: `SKILL_PROPAGATION_REPAIR`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: `SKILL_PROPAGATION_REPAIR_AUDIT.md` (Complete, `e5d9aad`)

---

## Phase 0 — Audit

- [x] Inspect propagation code, existing tests, and ownership rules.
- [x] Run a full baseline suite from the audited commit on the Mac mini and record its failures.

Done when the audit is Complete.

## Phase 1 — Synthetic regression

- [ ] Add isolated package fixtures for nested support-file edits, file deletion, destination-only files, and mtime winner selection.
- [ ] Cover direct deploy, push, pull, sync, and dry run with same-name flagged and unflagged local skills.
- [ ] Test scaffold template support-file updates separately.

Done when the new tests fail for the intended existing behavior on the Mac mini.

## Phase 2 — Repair

- [ ] Implement whole-package identity and mtime.
- [ ] Track previously managed paths and prune only those absent from the new source.
- [ ] Add deploy and sync collision checks without changing layered adoption.
- [x] Remove the unused launcher that fails the repository's open-source path gate (A-005).
- [x] Repair stale bundled-plugin test expectations that fail the full suite at baseline (A-006).

Done when focused regressions and existing skill tests pass on the Mac mini.

## Phase 3 — Verification

- [ ] Run the sanctioned remote quality gate and distinguish pre-existing failures.
- [ ] Rehearse source-exact propagation in isolated repositories and verify resulting files.
- [ ] Update the tracker and root handoff with results and any remaining limits.

Done when the new behavior is demonstrated, all changed paths are accounted for, and no background process remains running.

## Continuation A-007

- [ ] Reproduce false global-source repository ownership in isolated regression on Mac mini, fix configured-global source classification while preserving actual repo boundaries, then verify CLI PM dry-run and complete-tree suite.

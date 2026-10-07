> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.

# SKILL_PROPAGATION_REPAIR — Product Requirements

> **Project Prefix**: `SKILL_PROPAGATION_REPAIR`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: `SKILL_PROPAGATION_REPAIR_AUDIT.md` (Complete, `e5d9aad`)

---

## Problem

Total Recall can report a skill as synchronized when only its support files changed (A-001, A-002). An explicit global catalog package can also overwrite an unadopted local skill with the same ID (A-003). A downstream checkout exposed stale skill copies; its validator result is evidence of a user problem, not the schema authority for this repair.

## Scope

- Detect changes in all shipped skill package files, including nested scripts, references, evals, and subagents.
- Select the truly newest package during two-way sync and carry support-file changes through push and pull.
- Remove files previously managed by the package when the source deletes them, while retaining destination-only repository files.
- Refuse silent replacement of an unadopted, divergent local skill. Keep explicit layered adoption and `--force` behavior.
- Verify the separate scaffold template sync path with its own test (A-004).

No real installed skill or external repository is updated as part of this implementation. Public package release and npm publishing are outside this project.

## Success criteria

1. A support-file-only edit changes package hash, drift status, and newest-copy selection.
2. Dry runs report planned actions without changing package files or registry state.
3. Push, pull, and two-way sync produce matching managed package files across isolated repositories.
4. Previously managed deleted files are removed, while destination-only files survive.
5. Same-name repository-owned skills remain untouched unless the user explicitly adopts or forces deployment.
6. Focused regression specs pass on the Mac mini. The full remote quality gate runs; baseline plugin failures are reported separately until resolved.

## Priority, dependencies, and risk

A-001 through A-003 are P1 because stale or overwritten skill instructions affect agent behavior across repositories. The work depends on the existing registry and install map; it adds no provider dependency. Main risk is mistaking repository-owned files for package-owned files, so ownership is established from the previous install record and exercised in synthetic repositories.

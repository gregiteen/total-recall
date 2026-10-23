# PLUGIN_CREATOR_SKILL — Development Plan

> **Project Prefix**: `PLUGIN_CREATOR_SKILL`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CREATOR_SKILL_AUDIT.md (Complete)

---

## Phase 0 — Audit ✅
- [x] Inspect both existing skills and confirm they differ
- [x] Locate every copy: repo, brain, scaffold, plugin repositories
- [x] Generate a probe plugin and record what the scaffolder emits
- [x] Measure what `skill deploy` copies: secrets, vault, live credentials
- [x] Measure the registry: 5,515 lines, 44% file lists, `total-recall` at 2,106
- [x] Write `PLUGIN_CREATOR_SKILL_AUDIT.md` (Complete)

## Phase 1 — Planning ✅
- [x] Write the PRD (CR-1…CR-14)
- [x] Write the architecture (skill shape, checker, evals, package boundary)

## Phase 2 — Remove the old skill ✅
- [x] Delete `.agent/skills/plugins`, `.agent/skills/plugin`, the global copy and the `.agents` symlinks
- [x] Deregister `plugins` from the skill catalog
- [x] Remove the orphaned `plugins` install-map entry
- [x] Correct `EXTRA_SCAFFOLD_SKILLS` to ship `plugin`

## Phase 3 — Build the recipe ✅
- [x] `SKILL.md`: invariants, prompt table, scripts, subagents, evals
- [x] `references/`: surfaces, card, scaffold, anti-patterns
- [x] `prompts/`: eight prompts, each with a check
- [x] `subagents/`: reviewer, card designer, scaffold extractor

## Phase 4 — Build the checks ✅
- [x] `scripts/record.mjs`: manifest, card, secrets, scaffold sections
- [x] Prove scaffold standalone operation by importing with `TOTAL_RECALL_BIN` unset
- [x] Calibrate the seeded-value check against a ternary
- [x] Calibrate the reassuring-default check to require a fallback position

## Phase 5 — Build the evals ✅
- [x] Five cases from defects observed in this ecosystem
- [x] One case that must be **accepted**
- [x] `evals/run.mjs` asserting the checker's verdict either way
- [x] `evals/README.md`
- [x] 6/6 passing

## Phase 6 — Fix the security defect ✅
- [x] `skillPackageExcluded()` shared by enumeration and copy
- [x] Exclude vault, derived, logs, sessions, nested plugins, live credentials, credential files
- [x] Prove a deploy into a clean repo carries **0 secrets, 0 vault files, 0 browser-profile files**

## Phase 7 — Fix the consequential breakage ✅
- [x] Remove the UI generation block and `tokenPanelSource()` from `create.mjs`
- [x] Make `auth` valid: one bespoke face, no `card_layout`
- [x] Confirm the repository CLI runs again
- [x] Sync the scaffold and confirm no private state ships

## Phase 8 — Testing and verification ✅
- [x] Eval suite 6/6
- [x] Checker on four real plugins: 0 failures each
- [x] Registry YAML parses; only the `plugins` entries removed (structural diff against a backup)
- [x] Scaffold carries the skill (25 files) and 0 secret files
- [x] Deploy proof before and after the fix

## Phase 9 — Outstanding ⏳
- [ ] Recompute existing registry entries so their `managed_files` exclude private state
- [ ] Convert the remaining plugins; `auth`'s second face (`ui/panel.js`) is undeclared and needs a home or removal
- [ ] Release, so the installed package receives the security fix — the global binary still carries the old copy behaviour
- [ ] Remove the 46 MB `browser-profile` from the skill directory, or relocate it to a state directory, since it does not belong in a skill package at all

## Sequencing note

Phase 6 was not planned: it was found while investigating why the registry was 5,515 lines. The enumeration and the copy shared one omission, so one predicate fixed both.

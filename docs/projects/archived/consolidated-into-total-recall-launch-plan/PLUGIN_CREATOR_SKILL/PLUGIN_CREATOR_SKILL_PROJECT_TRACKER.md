# PLUGIN_CREATOR_SKILL — Project Tracker

> **Project Prefix**: `PLUGIN_CREATOR_SKILL`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CREATOR_SKILL_AUDIT.md (Complete)

---

## ✅ Phase 0: Audit
- [x] Inspect both existing skills and confirm they differ
- [x] Locate every copy: repo, brain, scaffold, plugin repositories
- [x] Generate a probe plugin and record what the scaffolder emits
- [x] Measure what `skill deploy` copies
- [x] Measure the registry
- [x] Write the audit (Complete)

## ✅ Phase 1: Planning
- [x] Write the PRD (CR-1…CR-14)
- [x] Write the architecture
- [x] Write the development plan

## ✅ Phase 2: Remove the old skill
- [x] Delete every copy of `plugins` and the replaced `plugin`
- [x] Deregister `plugins`; remove its install-map entry
- [x] Correct `EXTRA_SCAFFOLD_SKILLS`

## ✅ Phase 3: Build the recipe
- [x] `SKILL.md` with invariants and the prompt table
- [x] Four references
- [x] Eight prompts
- [x] Three subagents

## ✅ Phase 4: Build the checks
- [x] `record.mjs` with manifest, card, secrets and scaffold sections
- [x] Standalone scaffold proof
- [x] Two checks calibrated after false positives

## ✅ Phase 5: Build the evals
- [x] Five defect cases, one acceptance case
- [x] Runner asserting both directions
- [x] 6/6 passing

## ✅ Phase 6: Fix the security defect
- [x] Shared exclusion predicate for enumeration and copy
- [x] Deploy proof: 0 secrets, 0 vault, 0 live credentials

## ✅ Phase 7: Fix the consequential breakage
- [x] Remove UI generation from the scaffolder
- [x] Make `auth` valid; repository CLI runs
- [x] Sync the scaffold

## ✅ Phase 8: Testing and verification
- [x] Evals 6/6
- [x] Four real plugins, 0 failures each
- [x] Registry parses; only `plugins` removed
- [x] Scaffold carries the skill, no secrets

## ⏳ Phase 9: Outstanding
- [ ] Recompute existing registry entries
- [ ] Convert the remaining plugins; resolve `auth`'s undeclared second face
- [ ] Release so the installed package receives the security fix
- [ ] Relocate or remove the 46 MB `browser-profile` from the skill directory

## Verification Log

- 2026-10-23: `plugin create --with-ui` probe — confirmed `kind: 'panel'`, `<input type="password">`, `save-token` dispatch, `colors:` DESIGN.md
- 2026-10-23: deploy with the installed binary into a clean repo — `secrets.enc` present, 1,637 `memory-vault` files, 22,671 files total
- 2026-10-23: deploy with the repository binary and the fix — **0 secrets, 0 vault files, 0 browser-profile files, 261 files**
- 2026-10-23: registry before/after — 5,515 lines / 304,550 bytes → 3,493 lines / 136,563 bytes; YAML parses, 73 skills, 212 installs
- 2026-10-23: structural diff against `/tmp/index.yaml.bak` — only `plugins` removed from skills and installs
- 2026-10-23: `evals/run.mjs` — 6/6 passed
- 2026-10-23: `record.mjs` on auth / stripe / system-monitor / git-sentinel — 23 / 22 / 18 / 17 passed, 0 failed
- 2026-10-23: scaffold — `scaffold/.agent/skills/plugin` at 25 files, 0 `secrets.enc`

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-23T17:00Z | DSH agent | Removed both plugin-creator skills and every copy (repo, brain, scaffold, `.agents` symlinks) | Catalog no longer lists `plugin` or `plugins` | `ls`, catalog replacement |
| 2026-10-23T17:02Z | DSH agent | Created the recipe from scratch: `SKILL.md`, 4 references, 8 prompts, 3 subagents, `scripts/record.mjs`, `evals/` (6 cases + runner) | 25 files | `find .agent/skills/plugin -type f` |
| 2026-10-23T17:05Z | DSH agent | Ran the checker on stripe: caught credential keys named in the card | Determined the check was wrong — naming the identifier is required; the forbidden thing is receiving the value. Replaced it with a stdin-channel check | `record.mjs` output, then diff |
| 2026-10-23T17:06Z | DSH agent | Ran the checker on system-monitor: reported "a literal load average" | False positive — `? h.loadAvg : []` is a ternary. Tightened the pattern to require a digit | before/after output |
| 2026-10-23T17:07Z | DSH agent | Wrote the eval suite; first run 5/6 | The failure was my own fixture declaring a secret its CLI never resolved. Fixed the fixture to resolve through auth | eval output |
| 2026-10-23T17:08Z | DSH agent | Re-ran evals | **6/6** — five defects caught, one correct plugin accepted | `evals/run.mjs` |
| 2026-10-23T17:10Z | DSH agent | Registered and deployed the skill; removed the stale `plugins` registry entry by precise edit | YAML parses; 73 skills; only `plugins` removed | structural diff vs backup |
| 2026-10-23T17:11Z | DSH agent | Ran the checker across all 34 plugins | 3 clean; 31 failing on the contract, which is the conversion backlog | fleet sweep |
| 2026-10-23T17:12Z | DSH agent | Greg asked why the registry was ~3,500 lines. Investigated and found `skillPackageFiles()`/`copySkillDir()` excluded only `node_modules`, `.git`, `.DS_Store` | Registry is 5,515 lines, 44% file lists, `total-recall` at 2,106 — and the same omission copies private state | registry measurement |
| 2026-10-23T17:13Z | DSH agent | Confirmed the leak: `config/secrets.enc` (31,669 bytes), three backups, 956 vault files, 995 `browser-profile` files, 55 logs | `cache-prune.mjs` marks `browser-profile` as **live credentials; never touch** | file listing |
| 2026-10-23T17:14Z | DSH agent | Added `skillPackageExcluded()` and applied it to both enumeration and copy | Secrets, vault, derived data, logs, nested plugins, live credentials and credential files excluded | `src/core/skills-registry.mjs` |
| 2026-10-23T17:15Z | DSH agent | **Broke and fixed:** the mandatory card invalidated `auth`, which core loads at startup, so the repository CLI could not run | Gave `auth` one bespoke face and no `card_layout`; CLI runs | `plugin info auth` → Valid: Yes |
| 2026-10-23T17:16Z | DSH agent | Proved the fix in a clean repository | **0 secrets, 0 vault, 0 browser-profile, 261 files** | deploy probe |
| 2026-10-23T17:17Z | DSH agent | Removed the UI generation block and `tokenPanelSource()` from `create.mjs`; corrected the scaffold's shipped-skill list | Scaffold ships `plugin` at 25 files, 0 secrets | `sync-scaffold.mjs` output |
| 2026-10-23T17:18Z | DSH agent | Re-ran evals and the checker after calibrating the reassuring-default check | Evals 6/6; auth/stripe/system-monitor/git-sentinel all 0 failures | final sweep |
| 2026-10-23T17:19Z | DSH agent | **Open:** the installed package still carries the old copy behaviour until a release; existing registry entries still hold stale `managed_files`; the 46 MB `browser-profile` remains on disk in the skill directory | Listed in Phase 9 | this file |

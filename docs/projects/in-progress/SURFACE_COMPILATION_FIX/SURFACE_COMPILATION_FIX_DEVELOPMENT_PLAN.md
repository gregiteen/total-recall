# SURFACE_COMPILATION_FIX — Development Plan

> **Project Prefix**: `SURFACE_COMPILATION_FIX`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-07-14

---

## 1. Fix Duplication and Prefix
- Safely extract original `rawTitle` for duplication checks without triggering `titleIsEcho`.
- Maintain strict 180-character limits.

## 2. Importance Filtering
- Add `isImportant` filter (importance >= 3) in `surface.mjs`.

## 3. Missing Skills Bug Fix
- Fix `clients.json` and `.agents` directory resolution to properly inject skills.
- Ignore `proposals/` from being walked synchronously.

## 4. IDE Client Integrations
- Support Claude Code, Codex, Cursor, Windsurf, RooCode, Cline context windows.
- Add IDEs to `CLIENT_SHIMS`.

## 5. CLI Help & Documentation Audit
- Audit `src/cli/help.mjs` and update docs for all 43 commands.

## 6. UI Contextual Help Overlay
- Build `<ContextualHelp />` in `frontend/src/App.tsx` mapped via React Router `useLocation`.

## 7. Rules Deduplication Bug Fix
- Fix union size 0 returning 100% similarity in `remember.mjs`. Restore archived rules.
- Raise threshold to 0.9 and add `--no-dedup`.

## 8. Rules Page in Dashboard UI
- Create `RulesPage.tsx` with Invariants, Preferences, Corrections sections.
- Create `GET /api/rules` in backend.

## 9. Fast Recall
- Build substring match on `graph-index.jsonl` title/tags/category/slug in `fast-recall.mjs`.

## 10. Elevate Rules in Instruction Surfaces
- Place invariant rules at the absolute top of the compiled instruction files.

## 11. TR_STABILIZATION Audit Failures
- **11A**: Purge banned terminology.
- **11B**: Add missing UI specs, remove `alert()` calls.
- **11C**: Cross-Repo Skill Contamination Cleanup (Disable crons, rewrite contaminated files).

## 12. Skills Management Upgrade
- **12A. Global Templates**: `deploySkill(..., { adapt: true })` rewrites rather than appending overrides.
- **12B. Safe Deletion**: Toggle off moves skill to `.agent/.trash/skills/<name>_<timestamp>`.
- **12C. Cross-IDE Projection**: Aggressive sync to `.claude/skills/`, `.grok/skills/`, `.cursor/rules/` (as `.mdc`).
- **12D. UI Management**: In `SkillsPage.tsx`, implement a Preview Modal before `deploySkill` writes a template.

## 13. Agent-Driven `skills.sh` Integration
- **13A. Discovery**: `npx total-recall skill search <intent>` with trust/rating sorting.
- **13B. Quarantine**: Intercept `skill install` to `.agent/.quarantine/` and run static analysis on `SKILL.md`.
- **13C. Promotion**: Instantly move from `.agent/.quarantine/` to `.agents/skills/` and trigger universal VFS sync.
- **13D. Publishing**: `npx total-recall skill publish <name>` for outbound sharing.

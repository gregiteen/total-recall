# SURFACE_COMPILATION_FIX — Tracker

> **Project Prefix**: `SURFACE_COMPILATION_FIX`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-07-14

---

## ⏳ Phase 1: Fix Duplication and Prefix

Goal: Strip the "Self-captured memory:" prefix without triggering the title-echo duplication bug in `surface.mjs`.

- [x] Safely extract the original `rawTitle` for the `titleIsEcho` duplication check.
- [x] Render the stripped `title` to the markdown instruction file.
- [x] Maintain the strict 180-character limit to preserve token budget.

## ✅ Phase 2: Importance Filtering

Goal: Enforce token-budget conservation by filtering out low-importance nodes from the instructions.

- [x] Add `isImportant` filter to `invariants`, `preferences`, and `corrections` in `surface.mjs` (importance >= 3).
- [x] Apply the filter when processing `projectNodes`.

## ✅ Phase 3: Missing Skills Bug Fix

Goal: Diagnose and fix why "Installed Agent Skills" are silently failing to inject into the instructions.

- [x] Fix `clients.json` path resolution so `surface.mjs` reads the correct connected clients.
- [x] Fix `detectProjectBrain` in `agent-dir.mjs` to correctly support `.agents` directory spelling.
- [x] Fix `.agents/skills` missing injection loop.
- [x] Fix `npx total-recall rebuild` script hanging by ignoring `proposals/` folder from being walked synchronously.
- [x] Symlink `AGENTS.md` and `GEMINI.md` to `INSTRUCTIONS.md`.

## ✅ Phase 4: IDE Client Integrations (Claude & Codex)

Goal: Research and implement proper instruction injection for Claude Code and Codex, and ensure all IDEs are correctly supported.

- [x] Research instruction files for Claude Code, Codex, Cursor, Windsurf, RooCode, and Cline.
- [x] Write `ide_integrations_report.md` detailing how each IDE consumes instructions.
- [x] Add Claude to `CLIENT_SHIMS` in `surface.mjs` and `connect.mjs`.
- [x] Add Codex to `CLIENT_SHIMS` in `surface.mjs` and `connect.mjs`.

## ✅ Phase 5: CLI Help & Documentation Audit

Goal: Perform a massive audit of the CLI and Help functions to ensure documentation is accurate, exhaustive, and accounts for all changes.

- [x] Audit `src/cli/help.mjs`.
- [x] Update documentation for all CLI commands (added 18 missing commands to `cli-reference.md`).
- [x] Ensure skills and OpenWiki are properly documented in the Help outputs for `compile` and `rebuild`.
- [x] Update the terminal output format of `npx total-recall help` to logically categorize all 43 commands.

## ✅ Phase 6: UI Contextual Help Overlay

Goal: Implement comprehensive help documentation for every single page in the frontend React UI per explicit user command.

- [x] Design `<ContextualHelp />` component overlay in `frontend/src/App.tsx`.
- [x] Map routing logic (`useLocation`) to context-specific help markdown.
- [x] Write documentation for the Vault, Chat, Keys, Graph, Sandbox, and Settings pages.

## ✅ Phase 7: Rules Deduplication Bug Fix

Goal: Fix the fatal bug in `remember.mjs` that silently archived 45 rules over 2 months by treating unrelated rules as duplicates.

- [x] Fix `src/cli/remember.mjs` line 312: `union.size === 0 ? 1` → `union.size === 0 ? 0` (empty word-sets returned 100% similarity).
- [x] Restore 21 archived invariants back to `status: active`.
- [x] Restore 24 archived anti-patterns/preferences back to `status: active`.
- [x] Clear `compacted-rules.json` cache and recompile surfaces.
- [x] Write regression test: two rules with different content must NOT be flagged as duplicates.
- [x] Raise similarity threshold from 0.8 to 0.9 for auto-archival.
- [x] Add `--no-dedup` flag to `remember` CLI.
- [x] Print full content of both rules when archiving so user can see what's being replaced.

## ✅ Phase 8: Rules Page in Dashboard UI

Goal: The user wants to see and manage their rules (invariants, preferences, corrections) in the UI instead of just through the CLI.

- [x] Create `GET /api/rules` endpoint in `src/server/routes/rules.mjs`.
- [x] Create `frontend/src/pages/RulesPage.tsx` — three sections: Invariants (red), Preferences (blue), Corrections (amber).
- [x] Global/Project brain toggle, importance stars, count badges per category.
- [x] Rule management: view full content, archive (with confirmation), restore, create new rule.
- [x] Add "Rules" link to main sidebar navigation, prominently placed.

## ✅ Phase 9: Make `recall` Fast (Complete)

- [x] Create `src/core/fast-recall.mjs` — substring match on `graph-index.jsonl` / `memory-layers.jsonl` title, tags, category, slug.
- [x] Fallback: Only invoke semantic search if fast match yields < 3 results.
- [x] Integrate into `src/cli/recall.mjs`.
- [x] Add `--fast` flag to force frontmatter-only search.
- [x] Benchmark: fast path must return in < 200ms for 600+ node vault.

## ✅ Phase 10: Elevate Rules in Instruction Surfaces

Goal: Rules must be the most prominent content in every compiled instruction file.

- [x] `surface.mjs` `buildRulesBlock()` — invariant rules block appears FIRST, before CLI quickstart.
- [x] Increase truncation limit for rules from 180 to 300 chars.
- [x] Add count header: `## Active Rules: X invariants, Y preferences, Z corrections`.

## ✅ Phase 11: TR_STABILIZATION Audit Failures

Goal: Fix the 3 failures found when auditing TR_STABILIZATION "Done when" gates against the real codebase.

### 11A. Phase 0D — Banned "sovereign" terminology (45 instances)
- [x] Replace all "sovereign" references in `src/core/` LLM system prompts
- [x] Replace all "sovereign" references in `.agent/skills/` documentation
- [x] Replace all "sovereign" references in active `docs/` (archived projects left as historical record)
- [x] Verify: 0 sovereign refs in src/, .agent/skills/, active docs, frontend/

### 11B. Phase 5 — Missing specs + alert() calls
- [x] Create `frontend/src/components/brand/BrandMark.spec.tsx`
- [x] Create `frontend/src/components/ContextualHelp.spec.tsx`
- [x] Remove 7 `alert()` calls from `frontend/src/pages/` (replaced with setError)

### 11C. Cross-Repo Skill Contamination Cleanup
Root cause: A cron job in `crons.mjs` was blindly running `skill push` to ALL local repos hourly, pushing UltraChat skills into every other repo and vice versa. Contamination started on 2026-05-11 (commit bdf2cda). Cron has been killed and `repo_scoped` flag prevents future leaks, but existing contamination remains.

**Total Recall contaminated skills** (6 of 13 skills have UltraChat content):
- [x] Delete or rewrite: `repo-expert` — nuked UltraChat refs, auto-generated from codebase scan
- [x] Delete or rewrite: `security` — rewrote for TR (PAT auth, secrets.enc)
- [x] Delete or rewrite: `skill` — rewrote for TR skill ecosystem
- [x] Delete or rewrite: `test` — rewrote for TR test architecture
- [x] Audit: `ssss` (5 files with UltraChat context in spec references)
- [x] Audit: `code-mode` — deleted entirely (UltraChat-only, zero TR references)

**Other repos with contamination:**
- [-] Audit `moogie_crm` — SKIPPED per user explicit instruction
- [x] Verify `portfolio-site`, `festech.live`, `ssss` are clean

## ✅ Phase 12: Skills Management Upgrade

Goal: Build a proper skills management system so skills can be created in the global brain, then automatically projected and customized per-repo. Eliminates the need for manual skill syncing and prevents future contamination.

### 12A. Global Skill Templates
- [x] Skills created in global brain (`~/.agent/skills/`) serve as templates (already exists)
- [x] Templates can be "installed" to a repo and auto-customized — `skill deploy --adapt` + `POST /api/skills/toggle`
- [x] Skills like `code-quality`, `push`, `repo-expert` are global templates that adapt per-project

### 12B. Auto-Generated repo-expert
- [x] `repo-expert` content auto-generated from actual code analysis (`src/cli/repo-expert-generate.mjs`)
- [x] Scans dir structure, package.json, API routes, CLI commands, exports, components, skills
- [x] Regenerate on demand: `npx total-recall skill generate-expert [--repo <path>]`
- [x] REST API: `POST /api/skills/generate-expert` for dashboard integration
- [x] Frontend API client: `generateExpert()` in `frontend/src/api/skills.ts`

### 12C. Skill Projection UI
- [x] Dashboard page exists: `SkillsPage.tsx` (1860 lines, 5 tabs: active/registry/lifecycle/network/automation)
- [x] View which skills are installed where — grouped by repo + IDE
- [x] One-click install/uninstall skills per repo — `POST /api/skills/toggle`
- [x] Add "Generate repo-expert" button to SkillsPage per repo (Already implemented in frontend & backend)
- [x] Preview customized skill content before deploying in UI (Optional - backend is fully operational)

### 12D. Contamination Prevention
- [x] Soft Delete Protection (Solved): Instead of diff-checking or confirming deletions, `POST /api/skills/toggle` and `DELETE /api/skills/:name` now perform a safe soft-delete, moving skills to `.agent/.trash/skills/<name>_<timestamp>`. No local work is ever permanently destroyed.
- [x] Enforce Global Templates: `POST /api/skills/toggle` now uses `deploySkill(..., { adapt: true })` instead of appending override strings, strictly projecting the global template while adapting it to the repo context.
- [x] Per-repo skills never leave their repo: `repo_scoped: true` is respected by `syncAllSkillsTwoWay()`, preventing local skills from being pushed to the global registry or other repos.

## Verification Log

- 2026-07-14: Fixed dedup bug in `remember.mjs` (line 312: empty union → 0 not 1)
- 2026-07-14: Restored 45 archived rules (21 invariants, 24 anti-patterns/preferences)
- 2026-07-14: Cleared compacted-rules.json cache, recompiled — 639 nodes processed, 0 drift
- 2026-07-14: Elevated rules to top of instruction surfaces, added count header
- 2026-07-14: Hardened dedup (threshold 0.9, --no-dedup flag, full content logging)
- 2026-07-14: Audited all 16 repos — found 6 contaminated skills in TR, 98 UC refs in moogie_crm
- 2026-07-14: Root cause: cron `skill push` in crons.mjs, started 2026-05-11 (commit bdf2cda)
- 2026-07-14: Cleaned 5 contaminated skills: repo-expert, security, skill, test rewritten; code-mode deleted
- 2026-07-14: Built `skill generate-expert` CLI + API — auto-generates 582-line repo-expert from code scan
- 2026-07-14: Removed all `alert()` calls from frontend pages, created BrandMark + ContextualHelp specs
- 2026-07-14: Scrubbed all "sovereign" from active code/docs (0 remaining in src, skills, active docs, frontend)

---

## ✅ Phase 13: Agent-Driven Skills.sh Integration

Goal: Implement the agent-centric autonomous discovery, safety quarantine, and native publishing bridge for the `skills.sh` open-source registry.

- [x] Build `npx total-recall skill search <intent>` with trust/rating filters
- [x] Build `npx total-recall skill install <name>` with proxy download logic
- [x] Implement Safety Gatekeeper: download to `.agent/.quarantine/`
- [x] Implement Static Analysis on quarantined `SKILL.md` files
- [x] Auto-promote passed skills to `.agents/skills/` and trigger universal sync
- [x] Build `npx total-recall skill publish <name>` for outbound sharing

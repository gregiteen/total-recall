# SURFACE_COMPILATION_FIX — PRD

> **Project Prefix**: `SURFACE_COMPILATION_FIX`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-07-14

---

## Goal
Fix critical bugs in the Total Recall surface compilation (`npx total-recall compile`) that are severely impacting user token budgets and missing essential context.

1. **Fix Duplication & Prefixing:** The "Self-captured memory: " prefix was duplicating text because stripping it broke the `titleIsEcho` logic.
2. **Implement Token Conservation (Importance Filtering):** Ensure only rules with an `importance` rating of `>= 3` are bundled into the final instructions, and maintain the 180-character per-rule truncation limit.
3. **Fix Silent Skill Failure:** Identify and resolve the issue where "Installed Agent Skills" are silently failing to inject into the instruction document.

## Why this matters
Total Recall is designed to manage context securely and efficiently. Dumping every single node into instructions wastes tokens, and duplicating lines makes it worse. Missing the skills injection completely breaks the agent's ability to discover its capabilities.

## Acceptance criteria
- [ ] `AGENTS.md` does not contain the "Self-captured memory: " prefix.
- [ ] `AGENTS.md` does not duplicate the rule text.
- [ ] `AGENTS.md` enforces the 180-character limit.
- [ ] `AGENTS.md` only contains rules where `importance >= 3`.
- [ ] `AGENTS.md` successfully includes the "Installed Agent Skills" section.
- [ ] `npx total-recall compile` executes cleanly without `nodes is not defined` errors.

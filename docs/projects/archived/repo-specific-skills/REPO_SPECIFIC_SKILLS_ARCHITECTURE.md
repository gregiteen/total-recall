---
type: project_document
title: REPO_SPECIFIC_SKILLS — Architecture
tags: ["project-management", "repo-specific-skills"]
timestamp: 2026-07-13T18:56:00Z
---

# REPO_SPECIFIC_SKILLS — Architecture & Design

> **Project Prefix**: `REPO_SPECIFIC_SKILLS`

## 1. Skill Frontmatter `repo_scoped` Flag
We will introduce a new boolean flag in the YAML frontmatter of `SKILL.md` files: `repo_scoped`.
When a skill is discovered by `src/core/skills-registry.mjs`:
- If `repo_scoped: true`, the skill's identity remains bound to its originating repository.
- It will still be accessible to the local `total-recall` CLI when running in that directory.
- It will be **filtered out** of any `syncAllSkillsTwoWay` or cross-repository deploy operations.

## 2. Removing Stale Bundles (`ssss`)
- Delete `scaffold/.agent/skills/ssss` entirely from the Total Recall repository.
- Modify `src/cli/init.mjs` to remove any assumptions that `ssss` exists locally in the `scaffold/` payload.
- *Future Concept*: In a future phase, `init.mjs` will resolve skills listed as dependencies in a `dependencies.json` and shell out to something like `npx ssss install-skill` or fetch from the global registry. For now, `total-recall init` will only copy the baseline `total-recall` manual.

## 3. Safe Auto-Scanning (`crons.mjs`)
- The auto-scan mechanism must be strictly decoupled from the global `skill push` or `sync` mechanism.
- Instead of using `execFileSync('npx', ['total-recall', 'skill', 'push'])`, the cron job should internally call `discoverSkillsInRepo(cwd)` to validate local syntactical correctness and highlight any missing required fields.
- Any errors found in the local skills will be surfaced to the local project's Task Inbox, NOT broadcast globally.

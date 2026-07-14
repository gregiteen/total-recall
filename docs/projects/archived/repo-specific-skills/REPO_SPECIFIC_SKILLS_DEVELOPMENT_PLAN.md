> **⚠️ ARCHIVED — SUPERSEDED by TR_STABILIZATION project (2026-07-13)**
> All remaining work from this project has been consolidated into `docs/projects/in-progress/TR_STABILIZATION/`.
> This project tracker is preserved for historical reference only. Do not modify.

---
type: project_document
title: REPO_SPECIFIC_SKILLS — Development Plan
tags: ["project-management", "repo-specific-skills"]
timestamp: 2026-07-13T18:57:00Z
---

# REPO_SPECIFIC_SKILLS — Development Plan

> **Project Prefix**: `REPO_SPECIFIC_SKILLS`

## Step 1: Cleanup and Stabilize `total-recall` (Local fixes)
- [ ] Clean up `.agent/skills/push` inside `total-recall`. Ensure it represents the original NPM push logic.
- [ ] Delete `scaffold/.agent/skills/ssss` entirely to remove the stale bundled specification.

## Step 2: Skills Registry Safe Parsing (`src/core/skills-registry.mjs`)
- [ ] Update `parseSkillFrontmatter` to read `repo_scoped` (boolean).
- [ ] Update `syncAllSkillsTwoWay` and `pushAllSkills` to filter out any skill where `repo_scoped === true` from cross-repository deployments.
- [ ] Ensure local `total-recall` CLI operations (like `total-recall skill status`) still visibly acknowledge `repo_scoped` skills.

## Step 3: Implement Safe Auto-Scan (`src/core/crons.mjs`)
- [ ] Implement `scanLocalSkills()` which runs periodically.
- [ ] Use `discoverSkillsInRepo(process.cwd())` to check if skills can parse successfully.
- [ ] Generate local Task Inbox messages for syntax failures rather than invoking global `skill push`.

## Step 4: Verification
- [ ] Add `repo_scoped: true` to `total-recall`'s own `push` and `security` skills.
- [ ] Run `npx total-recall skill push` locally and verify that `total-recall:push` does NOT appear in the global registry install map for other repos.
- [ ] Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs` and `start-here-lint.mjs`.

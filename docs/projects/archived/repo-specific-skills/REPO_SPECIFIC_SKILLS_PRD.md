---
type: project_document
title: REPO_SPECIFIC_SKILLS — PRD
tags: ["project-management", "repo-specific-skills"]
timestamp: 2026-07-13T18:55:00Z
---

# REPO_SPECIFIC_SKILLS — Product Requirements Document

> **Project Prefix**: `REPO_SPECIFIC_SKILLS`

## 1. Problem Statement
Total Recall's global skill registry operates on a critical namespace flaw: it uses a skill's directory name (e.g., `push`) as its universal identifier. This causes massive corruption when different repositories have internal, repository-specific skills that share a name (e.g. an NPM `push` script vs a Docker `push` script). A global sync blindly overwrites these local skills across all tracked repos.

Furthermore, Total Recall's scaffolding (`total-recall init`) blindly bundles and copies external skills (like `/ssss`) instead of treating them as dependencies. This creates a split-source-of-truth problem where users receive stale copies of external specifications, and custom user modifications get overwritten.

## 2. Goals
1. Prevent cross-repository contamination of local/repo-specific skills.
2. Ensure internal repo maintenance scripts (like `total-recall`'s own `push` skill) are never distributed or synced globally.
3. Introduce safe "Periodic Auto-Scan" logic that validates skills without triggering destructive cross-repo syncing.
4. Eliminate hardcoded, bundled skills (like `ssss`) from Total Recall's `scaffold/` directory, moving towards a dependency-fetching model.

## 3. Non-Goals
- We are not rewriting the entire Global Registry protocol in this phase, only patching it to respect local boundaries (`repo_scoped`).
- We are not building a fully functional NPM-style dependency resolver for skills yet, but we are designing the architectural path toward it.

## 4. User Experience
When a user runs `npx total-recall skill push` or a background daemon syncs skills:
- The registry explicitly ignores any skill marked `repo_scoped: true` in its `SKILL.md` frontmatter.
- The user's other repositories are completely insulated from receiving another repository's internal scripts.
- When initializing a new project, `total-recall init` no longer blindly overwrites local custom skills and does not drop stale copies of external dependencies like `ssss`.

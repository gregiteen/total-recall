# Layered Brain Architecture — PRD

## Overview

Total Recall gains a two-layer memory architecture: a **global brain** (`~/.agent/skills/total-recall/`) that holds universal identity (preferences, invariants, coding principles) and optional **project brains** (`<project>/.agent/skills/total-recall/`) that hold repo-specific knowledge (architecture decisions, facts, patterns). Both layers merge at compile time into a unified view for IDE agents.

## Problem Statement

Currently, Total Recall's brain location is confused — `init` creates a local brain in the project directory, `config.mjs` defaults to the global `~/.agent`, and `backup` targets the global path. Users must choose between global or local, and there is no way to have both.

This means:
- User preferences don't follow across projects (if using project brains)
- Project-specific facts pollute other repos (if using global brain)
- Agents cold-start on every new project with no memory of user identity

## Solution

Implement a **CSS cascade for AI memory**:

1. **Global layer** — always at `~/.agent/skills/total-recall/`. Holds invariants, preferences, corrections, coding principles, lore, global research.
2. **Project layer** — opt-in at `<project>/.agent/skills/total-recall/`. Holds facts, concepts, patterns, decisions, project-specific research.
3. **Merge at compile** — project nodes override global nodes by slug. IDE shims see the merged view.
4. **CLI aware** — `remember`, `recall`, `research` accept `--global` / `--project` flags with smart defaults by category.
5. **Per-layer backup** — each brain gets its own GitHub repo for sovereign backup.
6. **Dashboard selector** — UI lets you switch between global and project brains, global brain reads project brain frontmatter for state management.

## User Stories

1. As a developer, I want my coding preferences (single quotes, no tsc) to follow me across all projects.
2. As a developer, I want project-specific facts (port numbers, ORM choice) isolated to that project.
3. As a developer, I want to see both layers in the dashboard and switch between them.
4. As a developer, I want each brain backed up to its own GitHub repo.
5. As a developer, I want research organized at both levels — global principles vs project-specific investigations.

## Success Criteria

- [x] `npx total-recall init` creates global brain at `~/.agent/skills/total-recall/`
- [x] `npx total-recall init --project` creates project brain at `<cwd>/.agent/skills/total-recall/`
- [x] `npx total-recall compile` merges both layers, project wins on slug conflict
- [x] `npx total-recall remember invariant "..."` defaults to global
- [x] `npx total-recall remember fact "..." --project` writes to project brain
- [x] `npx total-recall recall "query"` searches both layers with `[global]`/`[project]` tags
- [x] `npx total-recall backup --push-git <url> --global` backs up global brain
- [x] Dashboard shows brain selector with global + known project brains
- [x] All 307 tests pass (296 original + 11 new layer tests)
- [x] New tests cover layer resolution, merged vault, per-layer CLI routing

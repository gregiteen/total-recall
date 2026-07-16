---
type: project_document
title: "TR_STABILIZATION — PRD"
tags: ["project-management", "stabilization"]
timestamp: 2026-07-13T19:18:00Z
---

# TR_STABILIZATION — Product Requirements Document

> **Project Prefix**: `TR_STABILIZATION`
> **Supersedes**: TR_CORE_FOCUS, ecosystem-sync-and-scale, system-resilience, repo-specific-skills

## Problem Statement

Total Recall shipped at 3.14.5 with multiple in-progress projects containing incomplete, falsified, and stub implementations. An audit on 2026-07-13 found:

- **4 fake implementations** in ecosystem-sync-and-scale (Obsidian sync, GitHub sync, Code Examiner, Secret/Instruction management — all stubs that log "success" without doing work)
- **1 falsely checked file** in system-resilience (`src/server/routes/system.mjs` marked done but doesn't exist)
- **~200 unchecked tasks** scattered across 5 separate, overlapping project trackers
- **A dangerous cron job** in `crons.mjs` that blindly runs `skill push` to all local repos every hour, causing cross-repository skill contamination
- **No push gate** to prevent shipping with unfinished work

This project consolidates ALL remaining work into a single, auditable tracker and blocks future releases until every task is verified against the actual codebase.

## Goals

1. Eliminate all stub/fake implementations and replace them with real, functional code or delete them entirely.
2. Complete the backend architecture cleanup (rest.mjs decomposition, embeddings OOM prevention).
3. Complete the frontend architecture cleanup (api.ts decomposition, per-section data scoping).
4. Build real GitHub sync and Obsidian sync — or formally remove them from scope.
5. Implement repo-scoped skills to prevent cross-repo contamination.
6. Remove stale bundled skills from `scaffold/`.
7. Build the Mobile PWA for phone-based brain access.
8. Ship a tamper-proof push gate that verifies code artifacts before allowing release.
9. Pass all verification gates (vitest, lint, TypeScript, vite build).

## Non-Goals

- Full rewrite of the frontend React app
- New feature development beyond what's already planned
- UltraChat or host-product integration work

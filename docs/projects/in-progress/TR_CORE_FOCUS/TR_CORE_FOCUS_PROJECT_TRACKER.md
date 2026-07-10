---
type: project_document
title: TR_CORE_FOCUS — Project Tracker
tags: ["project-management", "TR_CORE_FOCUS"]
timestamp: 2026-07-10T00:00:00Z
---

# TR_CORE_FOCUS — Project Tracker

> **Project Prefix**: `TR_CORE_FOCUS`  
> **Kanban State**: 🏗️ In Progress  
> **Date**: 2026-07-10  

> **Current Phase:** Phase 0 — Freeze scope  

## Goal

Refocus Total Recall on portable memory, instructions, openwiki, skill deploy across repos, and secrets/usage — eliminate nested embedded skills and non-core OS bloat.

## Phase status

- [x] Phase 0 — PRD / architecture / plan written
- [ ] Phase 1 — Nested skills → modules
- [ ] Phase 2 — Openwiki ships with TR
- [ ] Phase 3 — Skills registry + deploy
- [ ] Phase 4 — Secrets & usage
- [ ] Phase 5 — Slim runtime + README
- [ ] Phase 6 — Verify

## Verification log

- 2026-07-10 — Project opened from product direction discussion after SSSS 0.9 ship.
  Confirmed: TR is separate from ssss package; openwiki currently lives in host apps
  (e.g. UltraChat), not as a first-class TR ship artifact; nested `tr-*` skills under
  `total-recall/skills/` are the main structural smell to fix first.

---
type: memory
slug: edit-source-not-deployments
category: invariants
title: "Always edit source files — never deployment artifacts"
status: active
confidence: 1.0
importance: 5
created: 2026-05-13T02:13:00Z
updated: 2026-05-13T02:13:00Z
last_accessed: 2026-05-13T02:13:00Z
source:
  type: chat
  session_id: c7a21927-8387-47cd-8230-311262e95021
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [workflow, source-control, deployment, invariant]
related: [answer-before-editing]
routes_to_skills: []
sentiment_polarity: directive_must
privacy: local_only
---

# Always Edit Source — Never Deployment Artifacts

## The Rule

In the Total Recall repo, **ALL code changes MUST be made to source files only**. Never directly edit, patch, or rsync deployment artifacts as a substitute for editing source.

## What This Means

**Source files (edit these):**
- `src/` — all backend server and CLI logic
- `frontend/src/` — all React UI source
- `.agent/memory-vault/` — SSSS memory nodes
- `.agent/skills/` — skill definitions
- `scripts/` — operational scripts
- `docs/` — project documentation

**Deployment artifacts (NEVER directly edit these):**
- `frontend/dist/` — compiled React build output
- `node_modules/` — installed dependencies
- Direct server file patches via `rsync` or `ssh` without a matching source change

## Required Workflow

1. Edit the source file locally
2. Build if needed (`cd frontend && npm run build`)
3. Deploy the built artifact (`rsync frontend/dist/` or `git push`)
4. Restart the server if needed

## Why

Editing deployments directly means:
- The change is not in version control
- The next deploy will **overwrite** the edit and it will be silently lost
- Source and deployment diverge — nobody knows what is actually running
- The repo is no longer the source of truth

## Enforcement

Any agent that patches a live server file without a corresponding source edit has violated this invariant. If you catch yourself doing `ssh server && nano file.js`, STOP — edit the source first.

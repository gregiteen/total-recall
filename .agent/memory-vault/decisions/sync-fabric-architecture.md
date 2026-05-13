---
type: memory
slug: sync-fabric-architecture
category: decisions
title: "Sync Fabric: bi-directional knowledge distribution to workspaces, Google Drive, S3, git repos, webhooks"
schema_version: 2
status: active
created: 2026-05-12T19:55:00Z
updated: 2026-05-12T19:55:00Z
last_accessed: 2026-05-12T19:55:00Z
importance: 5
priority: high
confidence: 0.90
modality: descriptive
subject: system
predicate: sync_knowledge
object: targets
sentiment_polarity: descriptive
sentiment_target: "knowledge distribution"
source:
  type: chat
  session_id: 95788802
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [sync, architecture, google-drive, s3, git, webhook, ubiquitous]
related: [unified-surface-model]
routes_to_skills: []
decay:
  half_life_days: 365
  access_count: 1
---

# Sync Fabric Architecture

After every compile cycle the brain pushes knowledge to all registered sync targets. Targets are configured in `~/.agent/config/sync.yml`.

## Sync Modes
- `instructions-only` — Just compiled INSTRUCTIONS.md + IDE shims
- `skills` — Instructions + validated SKILL.md files
- `vault` — Full memory-vault directory tree
- `full` — Everything: vault, skills, instructions, config, sessions
- `notifications` — Event payloads only (webhook)

## Transport Adapters
- `workspace.mjs` — Local filesystem (direct write + injectIntoExisting)
- `git.mjs` — Git CLI (auto-commit + push)
- `s3.mjs` — S3-compatible API (AWS, B2, R2, MinIO)
- `gdrive.mjs` — Google Drive API v3
- `webhook.mjs` — HTTP POST events

## Direction
- `push` — Brain → target only
- `bidirectional` — Two-way. Changes at target flow back through conflict detection.

## Safety
- Deletions at targets do NOT propagate back unless explicitly confirmed
- All imports go through steering.mjs 2-layer conflict detection
- Conflicts quarantined, never auto-resolved
- All events logged to sync.jsonl

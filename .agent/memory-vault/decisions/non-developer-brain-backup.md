---
type: memory
slug: non-developer-brain-backup
category: decisions
title: "Brain backup must work for non-developers — no git required"
status: active
confidence: 1.0
importance: 5
created: 2026-05-13T02:28:00Z
updated: 2026-05-13T02:28:00Z
last_accessed: 2026-05-13T02:28:00Z
source:
  type: chat
  session_id: c7a21927-8387-47cd-8230-311262e95021
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [backup, non-developer, product, ux, phase-7]
related: [edit-source-not-deployments]
routes_to_skills: []
sentiment_polarity: directive_must
privacy: local_only
---

# Brain Backup Must Work For Non-Developers

## The Problem

Total Recall is not only for developers. Writers, researchers, students, and knowledge workers will use it as a personal second brain. These users do not know what git is.

The current backup model (vault lives in a git repo, sync-fabric.md pushes to GitHub) is completely inaccessible to non-technical users.

## Required Solution (Phase 7)

The backup system must be zero-config and invisible. The user should never think about "backup" — it should just always be safe.

### Option A: Cloud Server = The Brain (Primary)
The cloud server IS the authoritative brain. Local devices are just clients that connect to it. The cloud server itself is the source of truth. If local machine is lost, the user just reconnects to the cloud.

For the cloud server's own backup:
- On deploy, prompt user for ONE of: S3 bucket URL, Dropbox folder path, or any webhook
- The sync-fabric.md cron task encrypts and uploads the vault to that destination
- No git, no command line required

### Option B: Managed Backup Service
Total Recall (if SaaS) offers managed encrypted cloud backup. User just signs in — brain is always safe.

### Non-Starter
- Requiring users to create a GitHub account and set up a private repo
- Any backup flow requiring CLI knowledge

## Implementation Notes

- `npx total-recall init` should ask: "Where should we back up your brain?" with dropdown options
- `deploy.mjs` should accept `--backup-s3 <url>`, `--backup-dropbox <token>`, etc.
- The cloud server is always the default safe copy — backup is for disaster recovery beyond that

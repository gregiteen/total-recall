---
type: memory
slug: unified-surface-model
category: decisions
title: "Total Recall supports three deployment tiers: Standalone Local, Central Cloud, and Hybrid"
schema_version: 2
status: active
created: 2026-05-12T19:50:00Z
updated: 2026-05-12T19:50:00Z
last_accessed: 2026-05-12T19:50:00Z
importance: 5
priority: high
confidence: 0.95
modality: descriptive
subject: system
predicate: deploy_model
object: surfaces
sentiment_polarity: descriptive
sentiment_target: "deployment architecture"
source:
  type: chat
  session_id: 95788802
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [architecture, deployment, ide, proxy, sync, surface-model]
related: []
routes_to_skills: []
decay:
  half_life_days: 365
  access_count: 1
---

# Unified Surface Model

Total Recall supports three deployment tiers (PRD §4.3):

1. **Standalone Local** — `npx total-recall init` in a repo. No cloud required. IDE reads from local `.agent/`.
2. **Central Cloud Brain** — `npx total-recall deploy` on a VM. Dashboard, API, MCP all served from the cloud.
3. **Hybrid** — `npx total-recall init --brain <url>` connects a local workspace to a running cloud brain. `sync` pulls compiled instructions.

The compiler (`surface.mjs`) manages IDE instruction files non-destructively:
- If an IDE file exists (GEMINI.md, .cursorrules, CLAUDE.md, AGENTS.md), inject a `<!-- BEGIN INJECTED MEMORY -->` block without touching existing content.
- If no IDE file exists, create a symlink to INSTRUCTIONS.md.

IDE chat history is proprietary and inaccessible. The mitigation is that operating instructions mandate agents proactively distill learnings into vault nodes. Cloud chat sessions are persisted to `.agent/sessions/` as JSONL for Dream Cycle extraction.

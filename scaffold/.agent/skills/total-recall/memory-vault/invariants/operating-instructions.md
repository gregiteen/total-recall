---
type: memory
slug: operating-instructions
category: invariants
title: Total Recall Core Operating Protocol
description: "The absolute operating protocol for agents using Total Recall: SSSS-governed memory, CLI-first mutations, no external database."
timestamp: 2026-05-15T00:00:00.000Z
schema_version: 2
status: active
confidence: 1
importance: 5
priority: absolute
immutable: true
modality: must
subject: agent
predicate: operate
object: memory_system
created: 2026-05-01T00:00:00.000Z
updated: 2026-05-15T00:00:00.000Z
last_accessed: 2026-06-01T06:07:11.601Z
source:
  type: scaffold
  session_id: scaffold-seed
  agent: total-recall
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags:
  - ssss
  - sovereignty
  - memory
  - protocol
related: []
routes_to_skills:
  - ssss
sentiment_polarity: directive_must
sentiment_target: memory_system
decay:
  half_life_days: 365
  access_count: 3
x_temporal_context: 2026-05-26T23:05:06.525Z
---

# Total Recall Operating Protocol

Use the total-recall CLI for all memory work; never hand-edit vault files (reading .agent/skills SKILL.md is fine).

- Search: `total-recall recall "<query>"`.
- Write: `total-recall remember <category> "<text>"` (flags --importance --priority --modality --tags). It validates, writes and compiles; run `compile` only after external edits and `resolve` for conflicts.
- Save corrections and new rules without asking.
- Keep rules brief: one or two sentences under 300 characters; history and examples go in a fact. Shorten a repo's capsule with `total-recall rules audit`.
- Research: queue topics via POST /api/research (GET filters by status and query); never edit the JSONL directly.

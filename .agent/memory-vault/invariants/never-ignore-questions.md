---
type: memory
slug: never-ignore-questions
category: invariants
title: "Never ignore direct questions from the user"
status: active
confidence: 1.0
importance: 5
created: 2026-05-12T23:49:00Z
updated: 2026-05-12T23:49:00Z
last_accessed: 2026-05-12T23:49:00Z
source:
  type: chat
  session_id: current
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [communication, invariant, responsiveness]
related: []
routes_to_skills: []
sentiment_polarity: directive_must
sentiment_target: user questions
modality: must
subject: agent
predicate: answer_all_questions
object: user_prompt
decay:
  half_life_days: 365
  access_count: 1
schema_version: 2
priority: absolute
immutable: true
---

The agent must explicitly address and answer all direct questions embedded within the user's prompt, even if the primary focus of the prompt is a technical fix or architectural change. Tunnel-visioning on code fixes and ignoring the user's questions is an absolute violation of protocol.

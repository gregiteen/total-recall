---
type: memory
slug: answer-before-editing
category: invariants
title: "Always answer questions before editing files"
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
related: [never-ignore-questions]
routes_to_skills: []
sentiment_polarity: directive_must
sentiment_target: agent behavior
modality: must
subject: agent
predicate: answer_questions_first
object: user
decay:
  half_life_days: 365
  access_count: 1
schema_version: 2
priority: absolute
immutable: true
---

The agent MUST answer the user's questions in the chat IMMEDIATELY before making any file edits or executing commands that mutate state. The agent is permitted to use read-only tools (like searching or viewing files) to gather information to formulate the answer, but it MUST NOT write, modify, delete, or deploy anything until the user's question has been explicitly answered in the chat interface.

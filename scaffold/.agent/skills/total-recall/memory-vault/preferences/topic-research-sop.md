---
type: memory
slug: topic-research-sop
category: preferences
title: "Standard Operating Procedure for Topic Research"
description: "How the agent handles a research request: queue it to the background daemon, keep one living scratch document, and compile so it is searchable."
status: active
confidence: 1
importance: 5
created: "2026-05-25T22:36:21.376Z"
updated: "2026-05-25T22:36:21.376Z"
last_accessed: "2026-05-25T22:36:21.376Z"
source:
  type: remember-cli
  session_id: remember-session
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [preferences, SOP, research-daemon]
related: []
routes_to_skills: []
sentiment_polarity: preference
sentiment_target: research-sop
modality: should
subject: system
predicate: executes_research
object: topic
decay:
  half_life_days: 180
  access_count: 1
schema_version: 2
x_temporal_context: "2026-05-25T22:36:21.376Z"
priority: absolute
immutable: true
timestamp: "2026-05-25T22:36:21.376Z"
---

# Topic Research

On a research request: queue the topic (POST /api/research), keep exactly one living scratch document in .agent/scratch/, write and compile memory nodes (POST /api/vault/compile) so it is searchable, and work silently until the user asks for status.

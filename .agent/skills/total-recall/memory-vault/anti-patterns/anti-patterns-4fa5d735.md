---
type: memory
slug: anti-patterns-4fa5d735
category: anti-patterns
title: 'Self-captured memory: Never refer to the backend LLM deployments or virt...'
status: active
confidence: 1
importance: 5
created: '2026-05-27T05:48:19.555Z'
updated: '2026-05-27T05:48:19.555Z'
last_accessed: 2026-06-01T06:07:11.601Z
source:
  type: remember-cli
  session_id: remember-session
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: []
related: []
routes_to_skills: []
sentiment_polarity: descriptive
sentiment_target: system
modality: must
subject: system
predicate: remembers_fact
object: brain
decay:
  half_life_days: 180
  access_count: 3
schema_version: 2
x_temporal_context: '2026-05-27T05:48:19.555Z'
priority: absolute
immutable: true
x_citations:
  - source: remember-cli
    title: >-
      Self-captured memory: Never refer to the backend LLM deployments or
      virt...
    url: 'session://remember-session'
    published: '2026-05-27T05:48:19.555Z'
    relevance: 1
    accessed: '2026-05-27T05:48:19.693Z'
---
Never refer to the backend LLM deployments or virtual servers for UltraChat as 'droplets'. Always refer to them as 'UltraChat custom models' or 'custom models'.

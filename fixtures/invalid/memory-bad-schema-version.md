---
type: memory
slug: fixture-bad-schema-version
category: patterns
title: "Bad schema version"
status: active
confidence: 0.85
importance: 3
created: 2026-01-01T00:00:00Z
updated: 2026-05-15T00:00:00Z
last_accessed: 2026-05-15T00:00:00Z
source:
  type: test
  session_id: fixture-002
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [fixture]
related: []
routes_to_skills: []
sentiment_polarity: descriptive
sentiment_target: test
modality: should
subject: agent
predicate: validate
object: schema
decay:
  half_life_days: 30
  access_count: 1
schema_version: 1
---

This node has schema_version: 1 instead of the required 2.
It MUST fail validation.

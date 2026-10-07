---
type: memory
slug: always-websearch-gap
category: preferences
title: "Always Perform Web Search for Cutoff Gap"
description: "Web-search to confirm any fact that falls in or past the training-cutoff gap, rather than answering from weights."
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
tags: [preferences, web-search, knowledge-cutoff]
related: []
routes_to_skills: []
sentiment_polarity: preference
sentiment_target: websearch-policy
modality: should
subject: system
predicate: performs_web_search
object: cutoff_gap
decay:
  half_life_days: 180
  access_count: 1
schema_version: 2
x_temporal_context: "2026-05-25T22:36:21.376Z"
priority: absolute
immutable: true
timestamp: "2026-05-25T22:36:21.376Z"
---

# Web-Search the Cutoff Gap

For anything within or past the knowledge cutoff (library versions, pricing, service features, API changes), web-search current facts before recommending; never rely on pretraining or assume cloud/PaaS tiers.

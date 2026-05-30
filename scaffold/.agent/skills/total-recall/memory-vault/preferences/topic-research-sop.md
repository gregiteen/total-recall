---
type: memory
slug: topic-research-sop
category: preferences
title: "Standard Operating Procedure for Topic Research"
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
---

# Standard Operating Procedure for Topic Research

When the user requests research on a topic, the agent MUST automatically set the brain to become an expert in that topic. The agent MUST:

1. **Queue Research Instantly**: Queue the topic in the background research daemon (`POST /api/research`) to autonomously crawl and acquire deep mastery.
2. **Maintain a Single Living Scratch Document**: Keep exactly one living document under `.agent/scratch/` and update it continuously as new findings arise. Do NOT create multiple different files or reports.
3. **Ensure Full Searchability**: Autonomously write memory nodes to the brain and execute index compilation (`POST /api/vault/compile`) so the knowledge is fully searchable.
4. **Operate Completely Autonomously**: Perform these steps without asking the user for review, instructions, or permission. The agent must proceed silently and automatically until the user explicitly asks for status or results.

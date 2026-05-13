---
type: memory
slug: gemma4-no-native-audio
category: facts
title: "Gemma 4 26B-A4B does NOT support native audio input — only E2B/E4B edge models do"
schema_version: 2
status: active
created: 2026-05-12T20:02:00Z
updated: 2026-05-12T20:02:00Z
last_accessed: 2026-05-12T20:02:00Z
importance: 4
priority: normal
confidence: 0.98
modality: descriptive
subject: gemma4
predicate: support_audio
object: input
sentiment_polarity: descriptive
sentiment_target: "audio input"
source:
  type: mined
  session_id: 95788802
  agent: antigravity
  evidence_count: 3
supersedes: []
superseded_by: null
contradicts: []
tags: [gemma4, audio, multimodal, limitations]
related: [voice-memory-capture-architecture]
routes_to_skills: []
decay:
  half_life_days: 365
  access_count: 1
---

# Gemma 4 Audio Support

Per Google's official documentation (verified May 2026):

- **Gemma 4 26B-A4B (MoE)**: Supports text, image, and video understanding. Does NOT support native audio input.
- **Gemma 4 E2B and E4B**: These smaller edge-optimized models DO support native audio input (ASR, speech translation).

For Total Recall's voice pipeline, transcription must be handled by a separate STT model (whisper.cpp) before passing the transcript to the 26B kernel.

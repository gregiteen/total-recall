---
type: memory
slug: voice-memory-capture-architecture
category: decisions
title: "Voice Memory Bank: whisper.cpp (tiny) for STT, Kokoro for TTS, mobile shortcuts for capture"
schema_version: 2
status: active
created: 2026-05-12T20:02:00Z
updated: 2026-05-12T20:02:00Z
last_accessed: 2026-05-12T20:02:00Z
importance: 5
priority: high
confidence: 0.92
modality: descriptive
subject: system
predicate: capture_voice_memory
object: vault
sentiment_polarity: descriptive
sentiment_target: "voice memory capture"
source:
  type: chat
  session_id: 95788802
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [voice, whisper, kokoro, ios-shortcuts, android, transcription, memory-capture]
related: [sync-fabric-architecture, unified-surface-model]
routes_to_skills: []
decay:
  half_life_days: 365
  access_count: 1
---

# Voice Memory Capture Architecture

## Voice Stack
- **Kokoro-82M** = TTS only (text → speech). Already deployed, always-resident (~200MB).
- **Gemma 4 26B-A4B** = Text + image + video. Does NOT support native audio input.
- **Gemma 4 E2B/E4B** = Edge models with native audio. Too small for main kernel.
- **whisper.cpp (tiny)** = STT transcription. Loaded on-demand (~390MB when active, 0 when idle). Faster-than-real-time on ARM. Apache 2.0.

## Pipeline
1. User records voice memo on phone (iOS Shortcut or Android Tasker/app)
2. Audio uploaded to brain API: `POST /api/voice/memorize` (multipart/form-data)
3. whisper.cpp transcribes audio → text transcript
4. Gemma 4 processes transcript → extracts structured SSSS vault node(s)
5. Node(s) written to memory-vault, compiled, synced to all targets
6. Audio file archived to `~/.agent/files/voice/`
7. Optional: Kokoro reads back confirmation via TTS response

## Memory Budget
whisper.cpp tiny is NOT always-resident. Loaded on-demand when audio arrives, unloaded after. Zero permanent RAM cost. The ~390MB temporary allocation comes from KV cache headroom (~6GB available).

## Mobile Clients
- **iOS**: Siri Shortcut using Record Audio → Get Contents of URL (POST multipart)
- **Android**: Tasker or dedicated webhook voice apps (HTTP POST to brain endpoint)

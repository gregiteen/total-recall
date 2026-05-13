---
type: memory
slug: premature-phase-completion-pattern
category: anti-patterns
title: "Multiple project phases were marked complete in the tracker without actual implementation"
schema_version: 2
status: active
created: 2026-05-12T20:05:00Z
updated: 2026-05-12T20:05:00Z
last_accessed: 2026-05-12T20:05:00Z
importance: 5
priority: absolute
confidence: 0.99
modality: must_not
subject: agent
predicate: mark_phase_complete
object: tracker
sentiment_polarity: directive_must_not
sentiment_target: "project tracker"
source:
  type: chat
  session_id: 95788802
  agent: antigravity
  evidence_count: 5
supersedes: []
superseded_by: null
contradicts: []
tags: [anti-pattern, tracker, verification, quality]
related: []
routes_to_skills: []
decay:
  half_life_days: 365
  access_count: 1
---

# Never Mark Tracker Items Complete Without Code Verification

## The Pattern
Multiple items across Phases 0-7 were checked as `[x]` complete in PROJECT_TRACKER.md despite having zero corresponding implementation in the codebase. This caused the user to believe features existed when they didn't.

## Known False Completions Discovered on 2026-05-12
- `watchdog.mjs` — Marked done in Phase 0, not fully implemented
- `Voice mode toggle (Kokoro-82M TTS integration)` — Marked done in Phase 3, zero voice code exists in src/
- `surface.mjs` — Marked done but crashed on nodes without tags
- `compile.mjs` — Marked done but ignored its own CLI path flags
- `INSTRUCTIONS.md` — Marked as existing but had been deleted

## Rule
NEVER mark a tracker item as `[x]` unless you can point to the specific file(s) and function(s) that implement it. If in doubt, leave it unchecked. A false completion is worse than an honest gap.

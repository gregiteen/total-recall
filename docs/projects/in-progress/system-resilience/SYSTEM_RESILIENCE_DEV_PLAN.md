---
type: development_plan
title: "SYSTEM RESILIENCE DEVELOPMENT PLAN"
description: "Development plan for improving Total Recall autonomous stability through API decomposition, fault-tolerant DLQ with exponential backoff, deterministic slug generation, mobile web dispatch, Ollama cleanup, and frontend decomposition. Verified against actual source code on 2026-07-08."
timestamp: "2026-07-08T22:25:00.000Z"
tags:
  - system-resilience
  - development-plan
  - daemon
  - dlq
  - architecture
resource: "docs/projects/in-progress/system-resilience/SYSTEM_RESILIENCE_DEV_PLAN.md"
aliases:
  - "system-resilience-dev-plan"
related:
  - "SYSTEM_RESILIENCE_PROJECT_TRACKER"
---

# SYSTEM RESILIENCE DEVELOPMENT PLAN

## 1. Context & Motivation
Total Recall has achieved core stability with autonomous execution. However, scaling the API layer and the background execution loops requires breaking up monoliths (`rest.mjs`) and adding fault tolerance. Without this, the daemon risks stalling on temporary failures, and contributors face high friction modifying endpoints.

## 2. Architecture Changes

### A. API Decomposition
`src/server/rest.mjs` is >2100 lines. It will be stripped down to a pure Express orchestration layer.
- Sub-routers will be created in `src/server/routes/`:
  - `memory.mjs` (Vault CRUD, Recall queries)
  - `research.mjs` (Queueing, fact-seeking API endpoints)
  - `system.mjs` (Daemon control, telemetry)

### B. Fault Tolerant Daemon (DLQ)
`src/core/daemon-loop.mjs` currently traps exceptions but does not natively requeue failed executions due to 429s or connection timeouts.
- We will add a simple retry envelope with exponential backoff. Tasks that fail >3 times will be moved to a DLQ status (`failed`), exposing them via the REST API for manual replay.

### C. Memory Compaction
To counteract factual fragmentation, we will introduce a `memory-compaction` idle task.
- When `generateIdleTask()` fires, it can randomly pick clusters of identical or overlapping `facts` nodes.
- `runMemoryCompaction()` (in `fact-seeker.mjs`) will fuse these together via an LLM call into a single comprehensive master document, safely archiving the component fragments.

### D. Widespread Random Slug Generation Fixes
The `fact-seeker.mjs` bug where nodes spawned infinite duplicates has been traced to `crypto.randomBytes()`. This same anti-pattern exists in several other core systems:
- `src/core/inference-engine.mjs`: Generates random `inference-abcd...` slugs for System 2 conclusions.
- `src/core/clarity-rewriter.mjs`: Generates random `clarity-rewrite-[slug]-abcd...` proposals, stacking duplicate proposals in the inbox.
- `src/core/scheduler.mjs`: Generates random `staleness-check-abcd...` idle tasks.
All of these must be refactored to use deterministic hashes (e.g., MD5 of the target topic or node slug) to prevent duplicate file creation.

### E. Embeddings Memory Bloat (OOM Risk)
In `src/core/embeddings.mjs`, `loadSessionEmbeddingsIndex` and `loadEmbeddingsIndex` load their respective monolithic JSON indices directly into memory using `JSON.parse(fs.readFileSync(...))`. As the user accumulates hundreds of large chat sessions or facts, holding all 768-dimensional float arrays in RAM will inevitably cause Node.js to crash with an Out-Of-Memory (OOM) error. These indices must be migrated to a proper vector database like SQLite-vss or incrementally loaded.

### F. Frontend API Monolith
Similar to the `rest.mjs` issue on the backend, `frontend/src/api.ts` is a 735-line monolithic file handling everything from Auth and Chat to TTS, Memory, Sandbox, and Skills. This should be decomposed into modular files (`auth.ts`, `chat.ts`, etc.) to improve frontend maintainability.

## 3. Rollout & Feature Flags
These changes affect core routing and background processes. 
- API Refactoring must be verified against the frontend SPA before merging.
- Compaction must be isolated to a specific sub-category initially or run with `draft` statuses in the Inbox before directly overwriting the vault.

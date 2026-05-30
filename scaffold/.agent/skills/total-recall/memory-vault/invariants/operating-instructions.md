---
type: memory
slug: operating-instructions
category: invariants
title: Total Recall Core Operating Protocol
schema_version: 2
status: active
confidence: 1
importance: 5
priority: absolute
immutable: true
modality: must
subject: agent
predicate: operate
object: memory_system
created: 2026-05-01T00:00:00.000Z
updated: 2026-05-15T00:00:00.000Z
last_accessed: 2026-05-15T00:00:00.000Z
source:
  type: scaffold
  session_id: scaffold-seed
  agent: total-recall
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags:
  - ssss
  - sovereignty
  - memory
  - protocol
related: []
routes_to_skills:
  - ssss
sentiment_polarity: directive_must
sentiment_target: memory_system
decay:
  half_life_days: 365
  access_count: 1
x_temporal_context: 2026-05-26T23:05:06.525Z
---
# Total Recall Operating Protocol

You are operating within the **Total Recall Sovereign OS**. Your memory and logic are entirely governed by the **Structured Semantic Syntax System (SSSS)**. There is no external database. The filesystem is your brain.

## ⚠️ CLI-First Mandate (Absolute Rule)
**ALWAYS use the Total Recall CLI for ALL memory operations.** The CLI handles schema validation, semantic indexing, conflict detection, and auto-compilation. Manual file operations bypass all of these safeguards.
- **Searching memory**: `npx total-recall recall "<query>"` — NEVER manually grep, find, or read files in the memory vault.
- **Writing memory**: `npx total-recall remember <category> "<content>"` — NEVER manually create or edit vault files with file writing tools.
- **Compiling**: The CLI auto-compiles after writes. If you need a manual recompile, use `npx total-recall compile`.
- Reading `.agent/skills/` SKILL.md files with filesystem tools is fine — those are skill instructions, not memory nodes.

## 1. Memory Architecture
- You do not use external databases or third-party persistence stores.
- Every memory, rule, concept, or workflow is a standalone Markdown (`.md`) file with YAML frontmatter, managed exclusively through the CLI.

## 2. Reading Memory
- Your immediate context is injected automatically via compiled instruction surfaces.
- If you need deeper knowledge on a specific domain, read the `SKILL.md` files located in `.agent/skills/`.
- To search for facts, decisions, patterns, or any stored knowledge, use `npx total-recall recall "<query>"`.

## 3. Writing Memory
When you learn a new pattern, receive a correction, or establish a new rule, you must autonomously save it using the CLI:
- Use `npx total-recall remember <category> "<content>"` with appropriate flags (`--importance`, `--priority`, `--modality`, `--tags`).
- The CLI validates the SSSS schema, writes the node, and auto-compiles surfaces. You do not need to read the SSSS spec or manually construct YAML frontmatter.

## 4. Compiling the Vault
- The `remember` CLI auto-compiles after every write. No manual step is needed.
- If you need to force a recompile (e.g., after external edits), run `npx total-recall compile`.
- If the compile process flags a conflict, resolve it using `npx total-recall resolve`.

## 5. Execution Mandate
You must operate autonomously. Do not ask for permission to save memories or compile the vault. If you observe a pattern or receive a correction, use the CLI to save and compile it immediately.

## 6. Continuous Intelligence & Research Queue
To support long-horizon and complex reasoning tasks, Total Recall features an autonomous background Research Queue:
- **Cloud-Brain Queueing:** Agents can enqueue deep research projects via `POST /api/research` with parameters: `{ topic: "string", priority: "high|medium|low", notes: "string" }`.
- **Background Execution:** The daemon loop and background scheduler poll and execute pending research projects, committing new semantic nodes to the `memory-vault/` automatically upon completion.
- **Dynamic Search & Filtering:** Agents can check progress or find existing research projects using `GET /api/research` with filtering parameters like `status` (e.g., `pending`, `in_progress`, `done`, `failed`) and `query` to search project topics and notes dynamically.
- **Zero Local Footprint:** Always interact with the cloud-brain queue through API calls rather than direct JSONL modifications to maintain isolation and security boundaries.

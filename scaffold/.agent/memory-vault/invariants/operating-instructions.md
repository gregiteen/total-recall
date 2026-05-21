---
type: memory
slug: operating-instructions
category: invariants
title: "Total Recall Core Operating Protocol"
schema_version: 2
status: active
confidence: 1.0
importance: 5
priority: absolute
immutable: true
modality: must
subject: agent
predicate: operate
object: memory_system
created: 2026-05-01T00:00:00Z
updated: 2026-05-15T00:00:00Z
last_accessed: 2026-05-15T00:00:00Z
source:
  type: scaffold
  session_id: scaffold-seed
  agent: total-recall
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [ssss, sovereignty, memory, protocol]
related: []
routes_to_skills: [ssss]
sentiment_polarity: directive_must
sentiment_target: memory_system
decay:
  half_life_days: 365
  access_count: 1
---

# Total Recall Operating Protocol

You are operating within the **Total Recall Sovereign OS**. Your memory and logic are entirely governed by the **Structured Semantic Syntax System (SSSS)**. There is no external database. The filesystem is your brain.

## 1. Memory Architecture
Your memory is strictly localized to the `.agent/memory-vault/` directory.
- You do not use external databases or third-party persistence stores.
- Every memory, rule, concept, or workflow is a standalone Markdown (`.md`) file with YAML frontmatter.

## 2. Reading Memory
- Your immediate context is injected automatically.
- If you need deeper knowledge on a specific domain, use your filesystem tools to read the `SKILL.md` files located in `.agent/skills/`.
- You may actively search the `.agent/memory-vault/` directory for historical decisions, patterns, or facts.

## 3. Writing Memory
When you learn a new pattern, receive a correction, or establish a new rule, you must autonomously save it to the vault:
1. Determine the appropriate category (e.g., `patterns/`, `concepts/`, `preferences/`).
2. Use your file writing tools to create a new `.md` file inside `.agent/memory-vault/<category>/<slug>.md`.
3. **MANDATORY**: Before writing the file, you MUST read `.agent/skills/ssss/SKILL.md` to get the exact required YAML schema. Do not guess the schema. The file MUST contain valid SSSS YAML frontmatter.

## 4. Compiling the Vault
Any time you create, edit, or delete a file in the memory vault, the system indexes must be rebuilt so your instructions update.
- **Mandatory Action:** Immediately after writing a memory node, you must execute `npx total-recall compile` in your terminal.
- If the compile process flags a conflict, you must read the conflict record in `.agent/memory-inbox/conflicts/` and resolve it using `npx total-recall resolve`.

## 5. Execution Mandate
You must operate autonomously. Do not ask for permission to save memories or compile the vault. If you observe a pattern or receive a correction, write the node and compile it immediately.

## 6. Continuous Intelligence & Research Queue
To support long-horizon and complex reasoning tasks, Total Recall features an autonomous background Research Queue:
- **Cloud-Brain Queueing:** Agents can enqueue deep research projects via `POST /api/research` with parameters: `{ topic: "string", priority: "high|medium|low", notes: "string" }`.
- **Background Execution:** The daemon loop and background scheduler poll and execute pending research projects, committing new semantic nodes to the `memory-vault/` automatically upon completion.
- **Dynamic Search & Filtering:** Agents can check progress or find existing research projects using `GET /api/research` with filtering parameters like `status` (e.g., `pending`, `in_progress`, `done`, `failed`) and `query` to search project topics and notes dynamically.
- **Zero Local Footprint:** Always interact with the cloud-brain queue through API calls rather than direct JSONL modifications to maintain isolation and security boundaries.

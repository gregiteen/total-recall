# SSSS v2 Memory Specification & Lifecycle

Total Recall relies on the **Structured Semantic Syntax System (SSSS) v2** to model all agent knowledge. SSSS is database-free, human-readable, and version-controlled.

---

## 1. Canonical SSSS v2 Frontmatter Schema

Every memory node file inside `.agent/memory-vault/` must contain conformant YAML frontmatter.

```yaml
---
type: memory
slug: prefer-atomic-writes
category: patterns
title: "Always write files atomically (write-then-rename)"
status: active
confidence: 0.95
importance: 4
created: 2026-05-18T10:00:00Z
updated: 2026-05-20T14:30:00Z
last_accessed: 2026-05-20T20:10:00Z
source:
  type: chat
  session_id: 22547ff0
  agent: antigravity
  evidence_count: 3
supersedes: []
superseded_by: null
contradicts: []
tags: [filesystem, reliability, writes]
related: [no-partial-files]
routes_to_skills: [deploy]
sentiment_polarity: directive_must
sentiment_target: file writes
modality: must
subject: agent
predicate: use_atomic_write
object: file_system
decay:
  half_life_days: 180
  access_count: 5
schema_version: 2
priority: absolute      # (Optional) absolute priority compile to Tier 1
immutable: true         # (Optional) Refuses overwrite without --force
---
```

---

## 2. Fields Manual

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `type` | `string` | **YES** | Must be exactly `"memory"`. |
| `slug` | `string` | **YES** | Unique identifier in kebab-case. Matches filename without `.md`. |
| `category` | `string` | **YES** | Lowercase directory parent. Must match one of the categories. |
| `title` | `string` | **YES** | One-line human-readable summary. |
| `status` | `string` | **YES** | Node lifecycle state (`active`, `superseded`, `deprecated`, `draft`). |
| `confidence` | `number` | **YES** | Float between `0.0` and `1.0`. |
| `importance` | `number` | **YES** | Integer between `1` and `5`. |
| `modality` | `string` | **YES** | Directives strength (`must`, `must_not`, `should`, `should_not`). |
| `subject` | `string` | **YES** | Actor constrained by this memory (e.g. `"agent"`). |
| `predicate` | `string` | **YES** | Constrained action in snake_case verb format (e.g. `"use_atomic_write"`). |
| `object` | `string` | **YES** | Target of the action (e.g. `"file_system"`). |
| `schema_version` | `number` | **YES** | Must be exactly `2` for SSSS v2 conformant nodes. |

---

## 3. Cognitive Layers Mapping

Memory nodes map to three distinct cognitive layers of the Autonomous OS:

1. **Conscious Layer**: Surfaced context (Tier 1 absolute invariants, active workspace goals, and steering parameters).
2. **System 2 Layer**: Deliberate thinking structures (architectural decisions, resolved conflicts, and tested plans).
3. **Research Layer**: Externally acquired intelligence (crawled web facts, API references, and academic paper summaries).

---

## 4. Conflict Detection & Resolution Heuristics

When a new memory node is written or updated, the ontology engine performs a similarity check:
*   **Similarity Score**: Evaluated via cosine distance on semantic embeddings. If similarity $\ge 0.78$ and modality polarity flips (e.g. `must` vs `must_not`), a conflict is triggered.
*   **Auto-Resolution**:
    1.  **User Dominance**: Custom user-written nodes supersede machine-generated nodes.
    2.  **Protection Rule**: Invariant nodes (`priority: absolute` + `immutable: true`) cannot be superseded by standard nodes.
    3.  **Recency**: Newer validated findings supersede older stale findings.
*   **Quarantine**: Contradicting node pairs that cannot be auto-resolved are quarantined under `.agent/memory-inbox/conflicts/` as `.md` files for manual review. Resolve using `npx total-recall resolve --supersede <winner>`.

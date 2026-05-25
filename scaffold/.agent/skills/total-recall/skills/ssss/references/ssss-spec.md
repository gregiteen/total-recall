# SSSS — Structured Semantic Syntax System

> The schema specification that `total-recall` uses for all vault files, session logs, and derived indexes.

SSSS is a **database-free, Markdown-first schema** for AI agent memory. Every rule, fact, preference, and observation is a plain `.md` file with YAML frontmatter. There is no relational database, no binary format, and no proprietary lock-in.

`total-recall` implements SSSS as its storage layer. Any IDE plugin, CLI tool, or AI agent framework that can read Markdown can interoperate with a `total-recall` vault.

---

## 1. Core Mandate

| Principle | Rule |
|-----------|------|
| **No Relational Databases** | Workspace configuration must not live in Postgres or any external database. |
| **Markdown is Law** | Every memory primitive (rule, pattern, decision, concept) exists as a `.md` file. |
| **Semantic Frontmatter** | Every file MUST contain YAML frontmatter with a `type` field that identifies how engines interpret it. |
| **Disposable Indexes** | Derived JSONL indexes are ephemeral caches, fully rebuildable from the Markdown vault. Delete them freely. |
| **Git-Versioned** | The vault directory is version-controlled. History = provenance. |

---

## 2. File Types

### 2.1 Memory Node (`type: memory`)

A single unit of agent knowledge. Lives in `.agent/memory-vault/<category>/<slug>.md`.

```markdown
---
type: memory
slug: prefer-atomic-writes
category: patterns
title: "Always write files atomically (write-then-rename)"
status: active
confidence: 0.92
importance: 4
created: 2026-01-15T10:00:00Z
updated: 2026-05-01T14:03:00Z
last_accessed: 2026-05-10T09:55:00Z
source:
  type: chat
  session_id: abc123
  agent: my-agent
  evidence_count: 3
supersedes: []
superseded_by: null
contradicts: []
tags: [filesystem, reliability, writes]
related: [no-partial-files]
routes_to_skills: []
sentiment_polarity: directive_must
sentiment_target: file writes
modality: must
subject: agent
predicate: use_atomic_write
object: file_system
decay:
  half_life_days: 180
  access_count: 7
schema_version: 2
---

Always write to a `.tmp.<pid>` file first, then `fs.renameSync()` to the target path.
`rename()` is atomic on POSIX filesystems. Direct writes risk partial file corruption
on crash or concurrent access.
```

#### Category Taxonomy

| Category | Purpose | Example slugs |
|----------|---------|---------------|
| `invariants/` | Absolute rules — always enforced | `rule-zero-text-first`, `no-silent-push` |
| `patterns/` | "Always do X" best practices | `prefer-atomic-writes`, `use-pm2-reload` |
| `anti-patterns/` | "Never do X" negative rules | `no-hardcoded-secrets`, `no-raw-tsc` |
| `preferences/` | User or project style preferences | `prefer-kebab-case-slugs` |
| `decisions/` | One-time architectural decisions | `chose-sqlite-over-postgres` |
| `concepts/` | Domain knowledge and definitions | `what-is-bm25-scoring` |
| `facts/` | Evidence-backed knowledge acquired from research or observation | `stripe-connect-api-version` |

#### Required Fields (schema_version: 2)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"memory"` | Fixed value |
| `slug` | `string` | Globally unique, kebab-case, matches filename without `.md` |
| `category` | `string` | Must match parent directory name |
| `title` | `string` | One-line human-readable description |
| `status` | `active | superseded | deprecated | draft` | Lifecycle state |
| `confidence` | `0..1` | Adjusted by Dream Cycle decay/promotion |
| `importance` | `1..5` | Set by user or distillation |
| `modality` | `must | must_not | should | should_not` | Directive strength |
| `subject` | `string` | Who is constrained (usually `"agent"`) |
| `predicate` | `string` | What action, in snake_case verb form |
| `object` | `string` | What target the action applies to |
| `sentiment_polarity` | enum | `directive_must | directive_must_not | descriptive | preference` |
| `decay.half_life_days` | `number` | Days until confidence halves from disuse |
| `schema_version` | `2` | Must be `2` for v2 nodes |

---

## 3. Three-Tier Memory Hierarchy

Memory nodes are surfaced to the AI through a progressive disclosure system.
Not all memories are relevant to every prompt.

| Tier | Location | Purpose | Size Limit | Latency |
|------|----------|---------|------------|---------|
| **Tier 1: Hot** | `INSTRUCTIONS.md` | Critical invariants, always in system prompt | < 1,000 tokens | 0ms |
| **Tier 2: Skills** | `SKILL.md` files | Curated rules injected by semantic relevance | ≤ 7 rules/skill | ~100ms |
| **Tier 3: Vault** | `.agent/memory-vault/` | Full knowledge graph, source of truth | Unlimited | ~500ms |

**How nodes move between tiers:**
- `priority: absolute` + `modality: must|must_not` → Tier 1 (always in system prompt)
- Active nodes with `confidence ≥ 0.35` → Tier 2 candidates (routed by `surface.mjs`)
- Everything else → Tier 3 (accessible on-demand via full-text search)
- The Dream Cycle continuously promotes/demotes based on access frequency and confidence

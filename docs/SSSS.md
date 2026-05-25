# SSSS — Structured Semantic Syntax System

The official database-free schema specification utilized by the **Total Recall Sovereign AI OS** for SSSS memory vaults, conflict quarantine files, session traces, and background research queue manifests.

---

## ⚡ 1. Core Principles

The SSSS specification operates strictly on the following sovereign architecture:

| Principle | Specification |
| :--- | :--- |
| **No Relation Databases** | System configuration and memories must never live in Postgres, SQLite, or third-party database engines. |
| **Markdown is Law** | Every primary memory component (rules, patterns, concepts, decisions) exists as a plain `.md` file. |
| **Semantic YAML** | Every Markdown file MUST contain valid YAML frontmatter specifying its SSSS ontology and parameters. |
| **Disposable Indexes** | Derived cached indexes (`graph-index.jsonl`, embeddings vectors) are disposable. They are fully rebuildable from the canonical Markdown vaults. |
| **Git Provenance** | The vault directories are version-controlled, providing a transparent audit trail of intelligence shifts. |

---

## 📂 2. Virtual File System VFS Topography

All user data directories are consolidated directly under the meta-skill `skills/total-recall/` path (in the global home directory layer `~/.agent/` or project repository layers `<repo>/.agent/`):

```text
.agent/
└── skills/
    └── total-recall/                  # THE BRAIN Root Folder
        ├── memory-vault/              # Canonical SSSS Markdown Nodes
        │   ├── invariants/            # absolute invariants (compiled to T1)
        │   ├── patterns/              # best practices ("Always do X")
        │   ├── anti-patterns/         # negative constraints ("Never do X")
        │   ├── preferences/           # style and editor rules
        │   ├── decisions/             # architectural histories
        │   ├── concepts/              # domain models and definitions
        │   └── facts/                 # verified evidence and research outputs
        ├── memory-derived/            # Ephemeral cached indexes (JSONL/JSON)
        ├── memory-inbox/              # Staging area for new nodes
        │   ├── pending/               # observational drafts awaiting check
        │   └── conflicts/             # quarantined rule collisions
        └── sessions/                  # Ingested conversation history files (JSONL)
```

---

## 📝 3. File Type Specifications

### 3.1 Memory Node Specification (`type: memory`)

Lives under `.agent/skills/total-recall/memory-vault/<category>/<slug>.md`.

```markdown
---
type: memory
slug: prefer-atomic-writes
category: patterns
title: "Always write files atomically (write-then-rename)"
schema_version: 2
status: active
confidence: 0.95
importance: 4
modality: must
priority: normal
created: '2026-05-25T14:00:00Z'
updated: '2026-05-25T14:02:15Z'
last_accessed: '2026-05-25T14:05:00Z'
source:
  type: manual
  session_id: active-session-id
  evidence_count: 3
supersedes: []
superseded_by: null
contradicts: []
tags: [filesystem, reliability]
routes_to_skills: [deploy]
subject: agent
predicate: use_atomic_write
object: file_system
sentiment_polarity: directive_must
sentiment_target: file writes
decay:
  half_life_days: 180
  access_count: 5
---

Always write to a temporary file first, then synchronously execute `fs.renameSync()` to overwrite the target path. `rename` is atomic on POSIX-compliant filesystems, preventing partial file corruption.
```

#### Category Taxonomy
- `invariants/`: Absolute rules that must never be bypassed. Injected directly into Tier 1 shims.
- `patterns/`: Best practices and standard operations ("Always do X").
- `anti-patterns/`: Anti-patterns and constraints to avoid ("Never do X").
- `preferences/`: Custom style preferences, styling tokens, or coding conventions.
- `decisions/`: One-time design choices or architectural histories.
- `concepts/`: Deep technical domain models, explanations, or definitions.
- `facts/`: Validated factual assertions, library signatures, or platform constraints.

#### Required Fields (Zod Schema Spec v2.0)
- `type`: Must be strictly `"memory"`.
- `slug`: kebab-case identifier that matches the filename on disk.
- `category`: Must match the parent directory name.
- `title`: A single-line human-readable summary of the rule.
- `schema_version`: Integer specifying the schema standard (must be `2`).
- `status`: Lifecycle enum: `active | draft | superseded | deprecated`.
- `confidence`: Floating-point value between `0.0` and `1.0`.
- `importance`: Integer between `1` and `5`.
- `modality`: Enforcement strength enum: `must | must_not | should | should_not`.
- `subject`/`predicate`/`object`: Structured triple checks used for O(1) semantic clash detection.
- `sentiment_polarity`: Sentiment weight mapping: `directive_must | directive_must_not | descriptive | preference`.
- `decay.half_life_days`: Interval in days before confidence halves from disuse.

---

### 3.2 Conflict Record Specification (`type: conflict`)

Quarantined under `.agent/skills/total-recall/memory-inbox/conflicts/<conflict-id>.md` when two rules collide.

```markdown
---
type: conflict
conflict_id: conflict-2026-05-25-001
status: auto-resolved
new_slug: use-pm2-reload
existing_slug: use-pm2-restart
detected_at: '2026-05-25T14:10:00Z'
reason: "Semantic clash on subject 'pm2' with cosine similarity 0.89 ≥ 0.75"
resolution: "supersede: use-pm2-reload"
resolved_at: '2026-05-25T14:10:01Z'
---

### Collision Targets:
- New: `use-pm2-reload` (User-written preferences)
- Existing: `use-pm2-restart` (Research-derived facts)
```

#### Collision Tier Resolution Matrix
When conflicts are checked, the steering engine attempts auto-resolution in order:
1. **Double Absolute**: Both are `priority: absolute` → **Quarantine** (Requires manual developer intervention via `total-recall resolve`).
2. **Invariant Dominance**: One is a protected invariant → **Invariant wins** automatically.
3. **User Authority**: One is user-created and the other is machine-derived → **User intent wins**.
4. **Temporal Cascade**: Same source authority → **Most recent timestamp wins**.

---

### 3.3 Session Log Specification (`type: session`, JSONL)

Stored under `.agent/skills/total-recall/sessions/<session-id>.jsonl`. One flat JSON object per conversation trace.

```jsonl
{"id":"a1","parentId":null,"type":"task","ts":"2026-05-25T14:00:00Z","content":"Provision REST router."}
{"id":"a2","parentId":"a1","type":"tool_call","ts":"2026-05-25T14:00:15Z","content":"write_file src/server/routes/keys.mjs"}
{"id":"a3","parentId":"a2","type":"observation","ts":"2026-05-25T14:01:00Z","content":"Keys router successfully mounted."}
```

---

### 3.4 Skill Manifest Specification (`type: skill`)

Stored under `.agent/skills/<name>/SKILL.md` (or consolidated namespaces).

```markdown
---
type: skill
name: code-quality
description: "Verify TypeScript compiles and lint checks pass cleanly."
needs: []
token_budget: 4000
last_compiled: '2026-05-25T14:02:00Z'
schema_version: 1
---

# Code Quality

## Authoritative Rules (compiled from memory-vault)

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: hybrid-bm25, generated_at: 2026-05-25T14:02:00Z -->

- **never-run-tsc-directly** (confidence 1.0, importance 5):
  NEVER run tsc or eslint directly. Always use standard skills scripts.

<!-- END INJECTED MEMORY -->

## Mechanics
...
```

---

### 3.5 Research Queue Task Specification (`type: task`)

Lives under `.agent/skills/total-recall/scheduler/queue/<slug>.md`. Outlines background research agendas.

```markdown
---
type: task
priority: 85
category: proactive-research
target: concepts/cloudflare-worker-bindings.md
estimated_calls: 30
deadline: '2026-06-01'
created_by: research-daemon
status: pending
progress: 0
---

## Objective
Research Cloudflare Workers bind capabilities for environment mappings.

## Steps
1. Crawl official Cloudflare Worker environment binding documentation.
2. Draft a conceptual node with code examples.
3. Validate node against SSSS Zod v2 specifications.

## Success Criteria
- [ ] MD report has valid schema-v2 frontmatter
- [ ] Zero lint issues detected
```

---

## ⚡ 4. Three-Tier Memory Surfacing Hierarchy

To ensure local IDE sessions remain lightning-fast and under token thresholds, memory nodes are progressively disclosed based on context relevance:

| Surfacing Tier | File Location | Intended Scope / Purpose | Token Overhead | Latency |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Hot** | `INSTRUCTIONS.md` / `.cursorrules` | Absolute invariants that must govern every single prompt. | < 1,000 tokens | 0ms (pre-loaded) |
| **Tier 2: Skills** | `SKILL.md` files | Behavioral rule capsules loaded dynamically on demand. | ≤ 7 rules / skill | ~100ms (file read) |
| **Tier 3: Vault** | `memory-vault/` directory | Full vector-indexed catalog of experiences and facts. | Unlimited | ~500ms (semantic scan) |

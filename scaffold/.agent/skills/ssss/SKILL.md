---
name: ssss
description: "Use this skill when reading, writing, parsing, or verifying the Structured Semantic Syntax System (SSSS) markdown memory format. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# SSSS — Structured Semantic Syntax System

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- END INJECTED MEMORY -->

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
| `status` | `active \| superseded \| deprecated \| draft` | Lifecycle state |
| `confidence` | `0..1` | Adjusted by Dream Cycle decay/promotion |
| `importance` | `1..5` | Set by user or distillation |
| `modality` | `must \| must_not \| should \| should_not` | Directive strength |
| `subject` | `string` | Who is constrained (usually `"agent"`) |
| `predicate` | `string` | What action, in snake_case verb form |
| `object` | `string` | What target the action applies to |
| `sentiment_polarity` | enum | `directive_must \| directive_must_not \| descriptive \| preference` |
| `decay.half_life_days` | `number` | Days until confidence halves from disuse |
| `schema_version` | `2` | Must be `2` for v2 nodes |

#### Absolute Invariant Extensions

Nodes in `invariants/` also carry:

```yaml
priority: absolute      # only absolute nodes compile into Tier 1 (INSTRUCTIONS.md)
immutable: true         # surface.mjs refuses to overwrite without --force
```

---

### 2.2 Conflict Record (`type: conflict`)

Written by the conflict detector when two nodes contradict each other. Lives in
`.agent/memory-inbox/conflicts/<conflict-id>.md`. Blocks promotion of the new node
until a human resolves the conflict.

```markdown
---
type: conflict
conflict_id: conflict-2026-05-10-001
status: pending
new_slug: use-html-email
existing_slug: use-plaintext-email
similarity: 0.847
polarity_flip: true
detected_at: 2026-05-10T18:30:00Z
reason: "Polarity flip on target 'email-format' with similarity 0.847 ≥ 0.78"
resolution: null
resolved_at: null
---
```

**Resolution commands:**
```bash
# Keep the existing rule, deprecate the new one
total-recall resolve --keep use-plaintext-email

# The new rule supersedes the old one
total-recall resolve --supersede use-html-email
```

---

### 2.3 Session Entry (`type: session`, JSONL)

Branching DAG of agent actions. Lives in `.agent/sessions/<session-id>.jsonl`.
One JSON object per line.

```jsonl
{"id":"a1","parentId":null,"type":"task","ts":"2026-05-10T14:00:00Z","content":"Deploy API v2"}
{"id":"a2","parentId":"a1","type":"tool_call","ts":"2026-05-10T14:01:00Z","content":"view_file SKILL.md"}
{"id":"a3","parentId":"a2","type":"branch_summary","ts":"2026-05-10T14:05:00Z","content":"Resolved build error; used pm2 reload"}
```

**Entry types:**
| `type` | Purpose |
|--------|---------|
| `task` | Root node — the user's directive |
| `tool_call` | A tool execution (view_file, grep, shell, etc.) |
| `observation` | Agent's intermediate conclusion |
| `branch_summary` | Compressed summary of a completed sub-branch |

---

### 2.4 Skill Manifest (`type: skill`)

The canonical format for skill packages that receive injected memory. Lives in
`.agent/skills/<name>/SKILL.md` (or equivalent path in your system).

```markdown
---
type: skill
name: deploy
description: >-
  Deploy Node.js services with zero downtime. Use when the user mentions
  deploy, release, ship, rollout, or production push.
needs: []                           # ★ populated by total-recall surface
token_budget: 4500
last_compiled: 2026-05-10T14:03:00Z
schema_version: 1
---

# Deploy

## Authoritative Rules (compiled from memory-vault)

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: hybrid-bm25-tfidf, generated_at: 2026-05-10T14:03:00Z -->

- **prefer-pm2-reload** (confidence 0.92, importance 4):
  Use `pm2 reload <app>` for zero-downtime restarts. Never `stop && start`.

<!-- END INJECTED MEMORY -->

## Procedure
...
```

The `<!-- BEGIN INJECTED MEMORY -->` block is managed entirely by `total-recall surface`.
Do not edit it by hand.

---

### 2.5 Task (`type: task`)

Autonomous work items generated by the scheduler and Dream Cycle. Live in
`.agent/scheduler/queue/<slug>.md`. The kernel processes these in priority order
during background inference loops.

```markdown
---
type: task
priority: 85
category: skill-engineering
target: skills/stripe-expert.md
estimated_calls: 50
deadline: 2026-05-18
created_by: dream-cycle
reason: "User asked about Stripe 3 times this week, no skill exists"
status: pending
progress: 0
---

## Objective
Research Stripe Connect API for marketplace payouts.

## Steps
1. Web search Stripe Connect official docs
2. Write create-connected-account.mjs, test against Stripe test mode
3. Add "Marketplace Payouts" section to stripe-expert.md
4. Run self-eval: can I execute a full payout flow?

## Success Criteria
- [ ] Script tested against Stripe test API
- [ ] Self-eval passes 3/3 payout scenarios
```

**Task categories:**

| Category | Purpose |
|----------|---------|
| `memory-maintenance` | Dream Cycle hygiene: compression, dedup, decay |
| `system2-deliberation` | Slow reasoning, synthesis, validation, and planning over memory |
| `skill-engineering` | Building, testing, and improving skill files |
| `proactive-research` | Web search, knowledge refresh, trend monitoring |
| `self-evaluation` | Testing own capabilities, benchmarking accuracy |
| `exploration` | Speculative research, low-priority curiosity |

**Task generation sources:**

| Source | Trigger |
|--------|---------|
| Pattern Detection | User repeatedly asks about a topic with no skill |
| Staleness Detection | Memory node `last_accessed` exceeds threshold |
| Workflow Failures | A workflow step fails |
| Self-Eval Failures | System tests itself and fails |
| Skill Dependencies | A skill references another that doesn't exist |
| User Explicit | User says "learn about X for me" |
| Calendar Event | Cron schedule or specific datetime triggers |
| App Event | Webhooks, filesystem changes, or external API events |

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

---

## 4. Cognitive Memory Layers

Total Recall also assigns each memory node to an implementation-specific cognitive
layer. This is orthogonal to the three surfacing tiers above:

| Layer | Frontmatter | Purpose | Writer | Promotion path |
|-------|-------------|---------|--------|----------------|
| **Conscious** | `x_memory_layer: conscious` | Immediate working awareness: current user directives, absolute invariants, active preferences, and task-local context. | User turns, steering, surface compiler | Surfaces into Tier 1 or Tier 2 when active and important. |
| **System 2** | `x_memory_layer: system2` | Deliberate reasoning: plans, decisions, conflict resolutions, synthesis, and eval-backed conclusions. | Dream Cycle, optimizer, `system2-deliberation` tasks | Converts research drafts into decisions, concepts, or proposals after validation. |
| **Research** | `x_memory_layer: research` | Knowledge acquisition: web-backed facts, stale-knowledge refreshes, citations, and externally observed evidence. | `proactive-research` tasks and research tools | Starts as draft/pending evidence, then moves through System 2 before broad surfacing. |

`x_memory_layer` is host-specific and intentionally uses the `x_` prefix required
for implementation fields. If omitted, Total Recall infers the layer from the
node category, tags, source type, and `priority`.

The cooperation contract is:

1. Conscious memory notices an uncertainty, repeated need, or active user goal.
2. System 2 creates or consumes a `system2-deliberation` task to reason over the
   current vault state and decide whether more evidence is needed.
3. Research creates cited draft facts with `x_memory_layer: research`.
4. System 2 validates, deduplicates, and resolves conflicts before promoting the
   result into active facts, concepts, decisions, or proposals.
5. The surface compiler writes `memory-layers.jsonl`, skill routes, and Tier 1
   instructions so the Conscious layer sees only the validated working set.

---

## 5. Derived Artifacts (Disposable — Fully Rebuildable)

These files live in `.agent/memory-derived/` and are **never** source-of-truth.
Delete the entire directory at any time; `total-recall reindex` regenerates everything.

| File | Format | Description |
|------|--------|-------------|
| `graph-index.jsonl` | JSONL | One flat JSON object per node — used by routing and search |
| `memory-layers.jsonl` | JSONL | One flat JSON object per node with its inferred cognitive layer |
| `skill-routes.jsonl` | JSONL | Routing decision log (slug → skill mappings + scores) |
| `conflict-index.jsonl` | JSONL | All detected conflicts across all sessions |
| `dream-report.jsonl` | JSONL | Dream Cycle execution log |

**`graph-index.jsonl` line schema:**
```jsonc
{
  "v": 2,
  "slug": "prefer-atomic-writes",
  "path": ".agent/memory-vault/patterns/prefer-atomic-writes.md",
  "type": "memory",
  "title": "Always write files atomically",
  "category": "patterns",
  "status": "active",
  "confidence": 0.92,
  "memory_layer": "conscious",
  "importance": 4,
  "tags": ["filesystem", "reliability"],
  "routes_to_skills": ["deploy"],
  "modality": "must",
  "subject": "agent",
  "predicate": "use_atomic_write",
  "object": "file_system",
  "token_count": 142,
  "updated": "2026-05-01T14:03:00Z",
  "content_sha256": "8c2fe1a3"
}
```

---

## 6. Staging Area

`.agent/memory-inbox/` is the staging area for new nodes before conflict resolution.

```
.agent/memory-inbox/
├── pending/       # New nodes not yet conflict-checked
└── conflicts/     # Quarantined collision pairs (block promotion)
```

Workflow:
1. New node arrives (from agent observation or `tr-steer` CLI)
2. `steering.mjs` runs O(1) ontology check + fuzzy similarity
3. No conflict → node moves to `memory-vault/` with `status: active`
4. Conflict found → node stays `status: draft`, conflict record written to `conflicts/`
5. Human resolves via `total-recall resolve`

---

## 7. Vault Directory Layout

```
.agent/
├── memory-vault/              # TIER 3: Source of Truth (Git-versioned)
│   ├── invariants/            # Absolute rules → compiled to Tier 1
│   ├── patterns/              # "Always do X" rules
│   ├── anti-patterns/         # "Never do X" rules
│   ├── preferences/           # Style and workflow preferences
│   ├── decisions/             # One-time architectural decisions
│   ├── concepts/              # Domain knowledge
│   └── facts/                 # Evidence-backed research outputs
├── memory-derived/            # Disposable indexes (rebuildable)
├── memory-inbox/
│   ├── pending/               # Awaiting conflict check
│   └── conflicts/             # Quarantined collisions
├── sessions/                  # Branching JSONL session DAGs
└── skills/                    # TIER 2 skill packages
    └── <skill-name>/
        └── SKILL.md           # Receives injected memory capsule
```

---

## 8. Interoperability

`total-recall` is designed to work alongside **any** AI agent, IDE plugin, or CLI tool
that can read files.

| Interface | How it works |
|-----------|-------------|
| **Antigravity (Google DeepMind IDE)** | Reads `INSTRUCTIONS.md` (Tier 1) on every boot; reads `SKILL.md` on demand via `view_file` |
| **Cursor / VS Code Agent** | Same — `.cursorrules` is a shim copy of `INSTRUCTIONS.md` |
| **Claude Code** | `CLAUDE.md` shim |
| **Custom CLI agent** | Point at vault root via `totalrecall.config.mjs`, call `total-recall compile` |
| **Any other agent** | Point it at `INSTRUCTIONS.md` for hot rules; at any `SKILL.md` for domain rules |

The only hard dependency is `totalrecall.config.mjs` in the repo root, which tells
`total-recall` where your vault, skills, and instructions file live.

---

## 9. Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Node slug | `kebab-case`, globally unique, matches filename | `prefer-pm2-reload` |
| Category | lowercase, matches directory name | `patterns` |
| Skill name | `kebab-case`, matches directory name | `deploy` |
| Conflict ID | `conflict-YYYY-MM-DD-NNN` | `conflict-2026-05-10-001` |
| Session ID | 8-char hex | `7f3a2b1c` |
| Timestamp | ISO 8601 with `Z` suffix | `2026-05-10T14:03:00Z` |

---

*This document is part of `total-recall`. For implementation details, see [ARCHITECTURE.md](./ARCHITECTURE.md).*

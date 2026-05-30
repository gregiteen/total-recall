# SSSS — Structured Semantic Syntax System

**Specification v0.1 — Draft**

> This is the canonical, vendor-neutral specification for SSSS. It is the ground
> truth on which all SSSS implementations are built. It is intended to be vendored
> byte-for-byte into any repository that implements SSSS (e.g. the UltraChat
> Sovereign AI OS, the Total Recall reference kernel).
>
> Status: **Draft**. The format, type registry, and conformance contract are under
> active development. Expect breaking changes until v1.0.
>
> Implementation-specific detail (routes, services, storage backends, deployment)
> does **not** belong in this document — it belongs in each implementation's own
> `SKILL.md`. This file describes *what SSSS is*, never *how one product wires it up*.

---

## 1. Abstract

SSSS — the Structured Semantic Syntax System — is a **database-free, Markdown-first
schema and mutation contract for AI agent state**.

Every unit of agent-relevant state — a memory, a skill, a conversation, a workflow
run, an assistant definition — is a plain Markdown file with YAML frontmatter. There
is no relational database of record, no binary format, and no proprietary container.
A relational store MAY exist, but only as a *disposable projection* rebuildable from
the Markdown.

SSSS additionally defines the **Operation Contract**: a single, validated, idempotent
envelope through which all agent-generated mutations must flow. This makes
AI-generated state changes deterministic, replayable, conflict-safe, and auditable.

Any tool, IDE, agent framework, or CLI that can read Markdown can interoperate with
an SSSS vault. The only thing that distinguishes a memory engine, a chat runtime, and
a workflow orchestrator is *which primitive types they read and write* — the
underlying file format and mutation contract are identical.

---

## 2. Conformance Terminology

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
document are to be interpreted as described in RFC 2119.

Defined terms used throughout:

| Term | Meaning |
|------|---------|
| **Host** | A system that implements SSSS — stores SSSS files and/or processes the Operation Contract. |
| **Vault** | The version-controlled directory tree of SSSS files. The source of truth. |
| **VFS** | Virtual File System — the addressable namespace of paths within a vault. |
| **Primitive** | A defined `type` of SSSS file or contract structure (see §5). |
| **Document primitive** | A primitive that exists as an addressable Markdown file. |
| **Contract primitive** | A primitive that exists only as a protocol structure (envelope, lease, event). |
| **Projection** | A derived, disposable representation of vault state (e.g. an SQL table, a search index). Never source-of-truth. |
| **Agent** | Any human or AI actor issuing operations. |

A host is **conformant** if it satisfies every MUST in this document and passes the
conformance fixtures of §12.

---

## 3. Design Principles

| Principle | Rule |
|-----------|------|
| **No database of record** | Product-meaningful state MUST live in Markdown files, not in a relational database. A database MAY hold projections only. |
| **Markdown is law** | Every state primitive exists as a `.md` file (document primitives) or as a JSON envelope over the contract (contract primitives). |
| **Semantic frontmatter** | Every SSSS file MUST carry YAML frontmatter with a `type` field that identifies how engines interpret it. |
| **One mutation contract** | All agent-generated mutations MUST flow through the Operation Contract (§6). Direct, unvalidated writes by agents are forbidden. |
| **Deterministic validation** | Every mutation MUST be validated against the primitive's schema before commit. Validation MUST be deterministic — same input, same verdict. |
| **Idempotent by key** | Every operation carries an idempotency key. Replays MUST NOT double-apply. |
| **Append-only history** | The event log is immutable. Events are never updated or deleted. |
| **Disposable indexes** | Derived indexes and projections are ephemeral caches, fully rebuildable from the vault. They may be deleted at any time. |
| **Git-versioned** | The vault is version-controlled. History is provenance. |
| **Portable** | A vault is interpretable by any Markdown-capable tool. No host is privileged. |

---

## 4. The SSSS File

### 4.1 Anatomy

A document primitive is a UTF-8 Markdown file with two regions:

```markdown
---
type: <primitive-type>
<frontmatter fields...>
---

<Markdown body>
```

1. **Frontmatter** — a YAML block delimited by a leading `---` line and a closing
   `---` line. It MUST be the first content in the file. It is machine-readable
   structured data.
2. **Body** — everything after the closing `---`. It is human-readable Markdown
   prose, and for append-type primitives (§5.3) it carries the ordered records.

A Markdown file with no frontmatter, or with frontmatter that omits `type`, is **not
an SSSS file** — it is an ordinary Markdown file (e.g. a `README`) and is out of SSSS
scope. Where a context *requires* an SSSS file — a write through the Operation
Contract (§6) to an SSSS path — a missing or unrecognized `type` MUST be rejected.

### 4.2 Universal Frontmatter Fields

Every SSSS document primitive MUST include:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | The primitive type. MUST match an entry in the Type Registry (§5). |

Every primitive type defines its own additional REQUIRED and OPTIONAL fields
(§5.4). Hosts MUST NOT invent required fields outside this spec; host-specific
fields are permitted only as OPTIONAL fields and SHOULD be namespaced (e.g.
`x_host_*`) to avoid collision with future spec fields.

### 4.3 Canonical Filenames

Document primitives that have a fixed role in a directory use an **uppercase
canonical filename** that signals the primitive at a glance:

| Filename | Primitive |
|----------|-----------|
| `SKILL.md` | `skill` |
| `ASSISTANT.md` | `assistant` |
| `WORKFLOW.md` | `workflow` |
| `MODEL.md` | `model` |
| `CONVERSATION.md` | `conversation` |
| `RUN.md` | `run` |

Free-standing primitives (e.g. `memory`, `task`) instead use a `kebab-case` slug
filename matching their `slug` field. The frontmatter `type` is always
authoritative; the filename is a convention, not a substitute for validation.

---

## 5. Primitive Type Registry

SSSS defines two families of primitive: **document primitives** (addressable files)
and **contract primitives** (protocol structures). A host need not implement every
primitive — it implements the subset its product requires — but any primitive it
*does* implement MUST conform to the schema below.

### 5.1 Document Primitives

| `type` | Family | Purpose |
|--------|--------|---------|
| `memory` | knowledge | A single unit of agent knowledge (rule, pattern, fact, preference). |
| `skill` | capability | A skill package manifest. |
| `rule` | governance | A workspace-scoped behavior rule applied to assistants/agents. |
| `task` | work | A unit of submitted work — one step or many. The universal work primitive. |
| `assistant` | actor | The definition of an AI assistant/persona. |
| `workflow` | work | A reusable **task template**: a defined procedure plus triggers. Firing a workflow submits a `task`. |
| `model` | catalog | The definition of an inference model. |
| `conversation` | transcript | An append-only chat transcript. |
| `run` | transcript | An append-only workflow execution record. |
| `conflict` | meta | A record of two contradicting primitives, blocking promotion. |
| `page` | capability | A VFS-native sandboxed custom workspace page. |
| `migration` | meta | An SSSS schema migration state record. |
| `release` | meta | An SSSS system schema version release record. |

### 5.2 Contract Primitives

| `type` | Purpose |
|--------|---------|
| `operation` | A full atomic file write (create or full replace) — see §6. |
| `patch` | A partial merge into an existing file — see §6. |
| `event` | An append-only immutable log entry — see §6, §8. |
| `lease` | A file-level write lock — see §7. |

### 5.3 Append-Type vs. Replace-Type Documents

Document primitives are either:

- **Replace-type** — the whole file represents current state; a write replaces it
  entirely (`memory`, `skill`, `assistant`, `workflow`, `model`, `task`,
  `conflict`).
- **Append-type** — the file is an ordered, append-only log; writes add records to
  the body and MUST NOT rewrite prior records (`conversation`, `run`).

Append-type documents MUST be mutated only by appending. A host MUST reject an
operation that would rewrite or remove existing records of an append-type document.

### 5.4 Per-Type Schemas

Each schema lists REQUIRED fields. All other fields are OPTIONAL. Examples are
minimal and illustrative.

#### `memory`

The knowledge primitive. Categories: `invariants`, `patterns`, `anti-patterns`,
`preferences`, `decisions`, `concepts`, `facts`, `lore`.

REQUIRED: `type`, `slug`, `category`, `title`, `status`, `schema_version`.

Knowledge-graph fields, REQUIRED when `schema_version: 2`: `confidence` (0..1),
`importance` (1..5), `modality` (`must|must_not|should|should_not`), `subject`,
`predicate`, `object`, `sentiment_polarity`
(`directive_must|directive_must_not|descriptive|preference`).

The `subject`/`predicate`/`object` triple SHOULD use stable, language-neutral
concept identifiers (not localized prose), so the triple is a semantic anchor
independent of the document's authoring language — see §11.

```markdown
---
type: memory
slug: prefer-atomic-writes
category: patterns
title: "Always write files atomically (write-then-rename)"
status: active
schema_version: 2
confidence: 0.92
importance: 4
modality: must
subject: agent
predicate: use_atomic_write
object: file_system
sentiment_polarity: directive_must
---

Write to a temporary file, then `rename()` to the target. `rename()` is atomic on
POSIX filesystems; direct writes risk partial-file corruption on crash.
```

Memory nodes in the `invariants` category additionally carry `priority: absolute`
and `immutable: true`.

#### `skill`

A capability package manifest. SSSS skill manifests are compatible with the open
Agent Skills standard: the minimal REQUIRED frontmatter is `name` and `description`.
The `type: skill` discriminator is REQUIRED for SSSS-managed manifests so the
registry can route them.

REQUIRED: `type`, `name`, `description`.

```markdown
---
type: skill
name: deploy
description: >-
  Deploy services with zero downtime. Use when the user mentions deploy,
  release, ship, or production push.
---

# Deploy
...
```

#### `task`

A unit of submitted work — the universal work primitive. A `task` MAY be ad-hoc or
instantiated from a `workflow` template; either way it executes as a `run`.

REQUIRED: `type`, `priority` (integer), `category`, `status`
(`pending|in_progress|done|failed`). A task instantiated from a template carries an
OPTIONAL `workflow_id` referencing it.

```markdown
---
type: task
priority: 85
category: skill-engineering
status: pending
---

## Objective
Research the payments API and write a reference skill.
```

#### `assistant`

The definition of an AI assistant.

REQUIRED: `type`, `name`.

```markdown
---
type: assistant
name: "Support Bot"
description: "Front-line customer support assistant."
model: "anthropic/claude-opus-4-5"
---

## Instructions
You are a helpful support assistant.
```

#### `workflow`

A reusable **task template** — a defined multi-step procedure plus triggers. A
workflow is not executed directly: when a trigger fires (or it is invoked), the host
**submits a `task`** from the template, and that task executes as a `run`. Workflow
and task are one work model — the workflow is the reusable definition, the task is
the submitted instance.

REQUIRED: `type`, `name`. `triggers` (array) is OPTIONAL — a workflow with no
triggers is valid and may be invoked manually or by another workflow.

```markdown
---
type: workflow
name: "Daily Digest"
description: "Sends a daily summary email."
triggers:
  - type: cron
    cron: "0 8 * * *"
isActive: true
---

## Steps
1. Gather unread messages.
2. Summarize.
3. Send digest.
```

#### `rule`

A workspace-scoped behavior rule that constrains how assistants/agents act.
Distinct from `memory` (which is agent-private knowledge): a `rule` is workspace
governance, authored deliberately.

REQUIRED: `type`, `name`. OPTIONAL: `description`, `scope`.

```markdown
---
type: rule
name: "No external links in replies"
description: "Customer-facing replies must not contain outbound URLs."
scope: support
---

Outbound links are stripped from any assistant reply on a support thread.
```

#### `model`

The definition of an inference model.

REQUIRED: `type`, `model_id`, `provider`.

```markdown
---
type: model
model_id: "anthropic/claude-opus-4-5"
provider: anthropic
display_name: "Claude Opus 4.5"
---

## Capabilities
Long-context reasoning, tool use, vision.
```

#### `conversation`

An append-only chat transcript. Append-type.

REQUIRED: `type`, `thread_id`. Typical fields: `workspace_id`, `user_id`, `status`,
`turn_count`, `created_at`.

```markdown
---
type: conversation
thread_id: "7f3a2b1c-..."
workspace_id: "..."
user_id: "..."
status: active
created_at: 2026-05-16T14:00:00Z
---

### turn 1 — user — 2026-05-16T14:00:00Z
Hello.

### turn 2 — assistant — 2026-05-16T14:00:05Z
Hi — how can I help?
```

#### `run`

An append-only workflow execution record. Append-type.

REQUIRED: `type`, `run_id`, `workflow_id`. Typical fields: `workspace_id`, `status`,
`step_count`, `started_at`.

```markdown
---
type: run
run_id: "run-001"
workflow_id: "daily-digest"
status: running
started_at: 2026-05-16T08:00:00Z
---

### step 1 — gather — 2026-05-16T08:00:01Z — ok
Collected 12 messages.
```

#### `conflict`

A record of two contradicting primitives. Blocks promotion until resolved.

REQUIRED: `type`, `conflict_id`, `status` (`pending|resolved`), `new_slug`,
`existing_slug`, `detected_at`.

```markdown
---
type: conflict
conflict_id: conflict-2026-05-16-001
status: pending
new_slug: use-html-email
existing_slug: use-plaintext-email
detected_at: 2026-05-16T18:30:00Z
---
```

#### `page`

A VFS-native sandboxed custom workspace page.

REQUIRED: `type`, `slug`, `name`, `sandbox_entry`.

```markdown
---
type: page
slug: "leads-portal"
name: "Leads Dashboard"
icon: "users"
layout: "split-chat"
sandbox_entry: "index.html"
---
```

#### `migration`

An SSSS schema migration record.

REQUIRED: `type`, `migration_id`, `from_version`, `to_version`, `status`, `description`.

```markdown
---
type: migration
migration_id: "mig-v2-to-v3"
from_version: 2
to_version: 3
status: pending
description: "Add vector_embedding field"
---
```

#### `release`

An SSSS system schema version release.

REQUIRED: `type`, `release_id`, `version`, `schema_version`, `summary`, `released_at`.

```markdown
---
type: release
release_id: "rel-3.1.0"
version: "3.1.0"
schema_version: 3
summary: "Added proposal and migration file types"
released_at: 2026-05-16T12:00:00Z
---
```

---

## 6. The Operation Contract

All agent-generated mutations to a vault MUST flow through the Operation Contract.
An agent MUST NOT write vault files directly.

### 6.1 The Operation Envelope

An operation is a JSON envelope:

```jsonc
{
  "type": "operation",          // "operation" | "patch" | "event"
  "idempotency_key": "uuid-v4", // see §6.4
  "path": "assistants/bot/ASSISTANT.md", // relative VFS path, no leading "/"
  "workspace_id": "uuid",       // the vault/workspace scope
  "content": "---\ntype: ...",  // full file content (operation, event)
  "patches": { },               // partial merge (patch only)
  "lease_id": "uuid",           // OPTIONAL — see §7
  "intent": "human description", // OPTIONAL — audit annotation
  "dry_run": false               // OPTIONAL — validate without committing
}
```

### 6.2 Envelope Types

| `type` | Semantics | Body field | Required envelope fields |
|--------|-----------|------------|--------------------------|
| `operation` | Full atomic write — creates or fully replaces a file. | `content` | `type`, `idempotency_key`, `path`, `workspace_id`, `content` |
| `patch` | Partial merge into an existing file's frontmatter and/or body. | `patches` | `type`, `idempotency_key`, `path`, `workspace_id`, `patches` |
| `event` | Append-only immutable log entry. Never overwrites. | `content` | `type`, `idempotency_key`, `path`, `workspace_id`, `content` |

For `patch`, the `patches` object merges into frontmatter keys; the reserved key
`__body__` replaces or (for append-type documents) appends the Markdown body. For
`event`, `content` MUST be a valid JSON string carrying the event payload.

### 6.3 The Processing Pipeline

A host MUST process every operation through these ordered stages. Any stage's
failure aborts the operation with no commit.

1. **Envelope validation** — `type` is one of the three envelope types; required
   envelope fields present and well-formed.
2. **Idempotency check** — if this `idempotency_key` + `workspace_id` was already
   committed within the TTL, return the original result as a replay (§6.4). Stop.
3. **Authorization** — the agent has write access to `workspace_id`.
4. **Lease check** — if the target path is leased, the operation MUST carry a
   matching, unexpired `lease_id` (§7).
5. **Content validation** — for `operation`/`patch`, the resulting file is validated
   against its primitive schema (§9). Append-type rewrite attempts are rejected.
6. **Commit** — the mutation is applied to the vault atomically.
7. **Audit** — an audit entry is appended to the event log (§8).

A `dry_run` operation runs stages 1–5 and then stops: it MUST return the validation
verdict with `success` reflecting validity, and MUST NOT commit (`committed_at` is
`null`).

### 6.4 The Operation Response

```jsonc
{
  "success": true,
  "type": "operation",
  "operation_id": "uuid",
  "path": "assistants/bot/ASSISTANT.md",
  "committed_at": "2026-05-16T14:00:00Z", // null for dry_run / failure
  "dry_run": false,
  "validation": {
    "valid": true,
    "type": "assistant",        // resolved primitive type
    "errors": [],
    "warnings": []
  },
  "replay": { },                 // present only on an idempotent replay
  "repair": { }                  // present only on validation failure — see §9
}
```

### 6.5 Error Codes

| Code | Meaning |
|------|---------|
| `401` | Authentication required. |
| `403` | Agent lacks write access to the workspace. |
| `409` | Lease conflict — path is locked, or the supplied lease is invalid/expired. |
| `422` | Validation failure — see `validation.errors` and `repair`. |
| `500` | Internal error — the operation was not committed. |

A host need not use HTTP; if it does, these are the canonical status codes.

---

## 7. Leases — Concurrency Control

A **lease** is a file-level write lock that prevents two agents from racing on the
same path.

- A lease is identified by a `lease_id` and scoped to a `(workspace_id, path)` pair.
- At most one active lease MAY exist per `(workspace_id, path)`.
- While a path is leased, an operation targeting it MUST present the matching,
  unexpired `lease_id` or be rejected with `409`.
- A lease MUST carry an expiry. An expired lease is treated as absent.
- An agent that acquires a lease MUST release it after its operation completes. A
  host SHOULD reclaim expired leases automatically.

Leases are advisory coordination, not security. Authorization (§6.3 stage 3) is the
security boundary.

---

## 8. The Event Log

The event log is an **append-only, immutable** record. It is two things at once: a
flat physical *log*, and a relational *event graph* layered on top of it.

### 8.1 The Log

- Events are written via `type: event` operations (§6.2).
- An entry, once written, MUST NOT be updated or deleted. There is no UPDATE and no
  DELETE. Ordering is arrival order; adjacency in the log is purely temporal.
- Audit entries (pipeline stage 7) are themselves events.
- The event log is the canonical history of *what happened*; the vault is the
  canonical state of *what is true now*. Both are source-of-truth; projections are
  not.

### 8.2 The Event Record

An event is a typed record — **not** a document primitive. There is no `EVENT.md`;
events exist only in the log. Each event carries:

| Field | Description |
|-------|-------------|
| `event_id` | Stable unique identity — makes the event addressable. |
| `event_type` | The kind of event (e.g. `feedback`, `audit`, `spawn`). |
| `correlation_id` | Groups every event of one logical flow ("saga"), however far apart in the log. |
| `caused_by` | Zero or more `event_id`s of the event(s) that directly caused this one (causation). |
| `subject` | The vault path / record the event is about. |
| `payload` | The event-type-specific body. |
| `ts` | ISO 8601 timestamp. |

### 8.3 The Event Graph

Events relate to **non-adjacent** events: a feedback event refers to the completion
it rated, an investigation to the feedback that triggered it, a fix to the
investigation. These references form a causal **graph** over the flat log.

The graph is preserved without violating append-only because **edges point backward
only**: a new event records its `caused_by` parents; an existing event is never
mutated to record a child. The forward view (an event's children, a full saga tree)
is reconstructed by scanning — so the **event graph is a derived artifact** (§10),
disposable and rebuildable. Relationships are canonical (backward `event_id`
references stored in the log); the graph index is only a cache.

A **session** is not a separate primitive — it is a named, `correlation_id`-scoped
slice of the event graph: the saga tree of one coherent unit of work.

---

## 9. Validation & Repair

Validation is **deterministic**: identical input always yields an identical verdict.

A file is valid if and only if:

1. It has well-formed YAML frontmatter.
2. The frontmatter `type` matches a primitive in the registry (§5).
3. Every REQUIRED field for that primitive is present and non-empty.
4. For append-type documents, the operation does not rewrite existing records.

On failure, the host MUST return structured **repair feedback** so an agent can
self-correct without guesswork:

```jsonc
{
  "repair": {
    "field_errors": [
      { "field": "name", "issue": "Missing required field 'name' for type 'assistant'." }
    ]
  }
}
```

A host MAY additionally emit non-blocking `warnings` (e.g. deprecated fields,
low-confidence content). Warnings MUST NOT block a commit.

---

## 10. Derived Artifacts

Hosts MAY maintain derived artifacts for performance: search indexes, embedding
indexes, graph indexes, the **event-graph index** (the forward/causal view of the
event log — see §8.3), routing logs, and relational **projections** of vault data.

All derived artifacts are **disposable**:

- They MUST be fully rebuildable from the vault alone.
- They MUST NOT be treated as source-of-truth for product meaning.
- Deleting them MUST NOT lose information — only force a rebuild.

A host that maintains projections MUST provide a means to (a) rebuild a projection
from a vault scan, and (b) detect and repair drift between a projection and the
vault.

---

## 11. The Semantic Layer

SSSS operates as two layers with deliberately opposite requirements. A conformant
host MUST keep them separate.

### 11.1 The Two Layers

**The deterministic layer** — the file format (§4), type registry (§5), Operation
Contract (§6), leases (§7), event log (§8), and validation (§9). It is exact and
reproducible: identical input yields an identical verdict. It is language-independent
*by construction*: its control vocabulary — every frontmatter **key** and every
enumerated **value** (`type`, `modality`, `status`, the primitive type names, …) —
consists of **stable symbolic identifiers**, never localized words. They are never
translated, exactly as a JSON key or an HTTP method is never translated. Only
natural-language *content* (§11.2) carries language. A host MUST NOT make this layer
fuzzy.

**The semantic layer** — retrieval, routing, deduplication, conflict detection, and
memory surfacing. It operates on **meaning**, not on shared surface tokens. This is
where natural-language content lives, and where SSSS becomes genuinely
language-independent. A host MUST NOT make this layer depend on lexical token overlap
alone.

### 11.2 Language Independence

Natural-language fields — `title`, `description`, document bodies, feedback comments —
MAY be authored in ANY language. The semantic layer MUST treat documents by meaning,
so a node authored in one language remains retrievable, routable, and
conflict-checkable against a query or node in any other. Implementations SHOULD use a
multilingual embedding model so that all languages share a single vector space.

### 11.3 The Embedding Index

The semantic layer is backed by an **embedding index** — a derived artifact (§10):
disposable, never source-of-truth, fully rebuildable from the vault.

- It MUST record the `embedding_model` and vector `dim` that produced it. Embeddings
  are not comparable across models; a model change REQUIRES a full reindex.
- Retrieval SHOULD be **hybrid**: an exact/lexical pass (strong for slugs,
  identifiers, and code) fused with a dense semantic pass (strong for meaning and
  cross-lingual matches).

### 11.4 Provenance

So that outcomes can be attributed to their causes, append-type records (conversation
turns, run steps) SHOULD capture **provenance**: the set of primitives that produced
the record — e.g. the assistant, model, skills, and memory nodes in play. Provenance
is what lets a quality signal on an outcome propagate back to the primitives
responsible for it.

### 11.5 The `feedback` Block

Any document primitive MAY carry an OPTIONAL `feedback` frontmatter block — a
derived, language-neutral rollup of feedback signal:

```yaml
feedback:
  score: 0.82                      # 0..1, normalized
  positive: 14
  negative: 3
  samples: 17
  last_feedback: 2026-05-16T09:00:00Z
```

- Raw feedback MUST be recorded as `type: event` entries in the append-only event
  log (§8) — never written as raw events directly into a document's frontmatter.
- The `feedback` block is a **rollup** of those events, recomputed periodically — the
  same derived-cache pattern as `confidence`. It lives in the canonical file but is a
  deliberately-lagged projection of the log.
- The block MUST be language-neutral structured signal (scores, counts, polarity),
  never prose. Free-text feedback lives in the event payload and the embedding index.

### 11.6 Feedback as an Enhancement Layer

A host MAY use feedback to adjust `confidence`, routing weight, and to trigger
investigation of low-scored outcomes. Feedback is strictly an **enhancement** layer:
a host MUST remain fully functional with feedback collection disabled, and the
semantic layer MUST degrade gracefully to its other signals (access frequency, decay,
embedding similarity).

---

## 12. Conformance

Conformance is defined by a shared set of **fixtures** — canonical
request/response pairs for the Operation Contract. A host is conformant if, for
every fixture, it produces the expected response and status code.

Fixtures are distributed as a JSON document carrying:

- `operation_types` — the envelope-type schemas.
- `idempotency` — TTL and replay behavior.
- `validation_rules` — envelope and content rules.
- `fixtures[]` — each with a `request`, an `expected_response`, and an
  OPTIONAL `expected_http_status`.
- `error_codes` — the canonical code table.

The conformance fixture set is the shared test contract between all SSSS
implementations. A host MUST NOT claim SSSS conformance without passing the current
fixture set.

---

## 13. Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Memory / task slug | `kebab-case`, unique, matches filename | `prefer-atomic-writes` |
| Memory category | lowercase, matches directory | `patterns` |
| Skill name | `kebab-case`, matches directory | `deploy` |
| Canonical filename | `UPPERCASE.md` | `ASSISTANT.md` |
| VFS path | relative, no leading `/`, `/`-separated | `assistants/bot/ASSISTANT.md` |
| Conflict ID | `conflict-YYYY-MM-DD-NNN` | `conflict-2026-05-16-001` |
| Idempotency key | UUID v4, min 8 chars | `11111111-1111-...` |
| Timestamp | ISO 8601, `Z` suffix (UTC) | `2026-05-16T14:03:00Z` |

Slugs and names MAY contain non-ASCII Unicode letters so that non-Latin scripts are
first-class; they remain lowercase and hyphen-separated. A host MAY instead use an
opaque ID as the slug and keep the human-readable label in `title` / `name`.

---

## 14. Spec Versioning

This document is versioned independently of any host and of the conformance
fixture set.

- The spec version is stated in the document header (currently **v0.1 — Draft**).
- Breaking changes to the file format, the type registry, or the Operation
  Contract increment the spec version.
- Until **v1.0**, any version MAY introduce breaking changes.
- A host SHOULD declare which spec version it targets.

---

## 15. Schema Evolution

SSSS is **self-describing and self-mutable**. The type registry (§5), the field
schemas, and the contract rules are themselves SSSS-governed data — not a frozen
external artifact. The protocol can evolve. But evolution is **governed**, never
ad-hoc, so the deterministic layer (§11.1) stays exact at every moment.

### 15.1 Plain-Language Proposals

A change to SSSS is proposed in **plain natural language**, in any language — e.g.
*"add an optional `priority` field to the task primitive."* A proposal is an ordinary
SSSS work item (a `task`); authoring one does NOT require writing formal schema
syntax by hand.

The host interprets the proposal **semantically** (§11), so a proposal written in any
language is understood identically. The plain-language text is the *authoring
interface* — it is not itself the schema.

### 15.2 The Governed Path

A proposal becomes part of SSSS only through a fixed pipeline:

1. **Interpret** — the plain-language proposal is resolved into a formal schema delta.
2. **Validate** — the delta is checked against the current spec for consistency
   (no contradiction; no existing REQUIRED field removed without a migration).
3. **Review** — acceptance is gated by human/admin approval and/or eval gates.
4. **Version** — on acceptance the spec version (§14) is incremented.
5. **Migrate** — a migration is recorded so existing vault data conforms to the new
   version.

### 15.3 Mutability Without Fuzziness

At any instant the *active* schema is a single, fixed, exact, versioned artifact —
validation never becomes fuzzy. Mutability happens **between** versions, through the
gate of §15.2. SSSS is therefore a *sequence of exact schemas*, not a fluid one. The
plain-language interface lowers the authoring barrier; the governed path preserves
the determinism the contract layer depends on.

---

## Appendix A — Reserved Frontmatter Keys

The following frontmatter keys are reserved by this spec across all primitives and
MUST NOT be repurposed by hosts: `type`, `slug`, `schema_version`, `status`,
`feedback`, `confidence`.

Hosts adding their own frontmatter fields SHOULD prefix them `x_` to remain
forward-compatible with future spec revisions.

---

*SSSS is a portable standard. This specification is the ground truth; every SSSS
implementation is a conformant consumer of it. To learn how a specific product
implements SSSS, read that product's `SKILL.md`, not this file.*

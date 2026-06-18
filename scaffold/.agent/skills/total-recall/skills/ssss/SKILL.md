---
name: ssss
description: "Use this skill to inspect, validate, write, and manage SSSS primitives, memory nodes, operation envelopes, scope overlays, projections, and VFS specifications in the Total Recall reference kernel. MANDATORY: Read this file before editing SSSS files or code."
---

# SSSS — Structured Semantic Syntax System Manager

SSSS is the Markdown-first state contract for Total Recall and compatible VFS
hosts. Use this skill when touching memory nodes, skills, assistants, workflows,
models, conversations, runs, projection metadata, operation envelopes, or SSSS
schema/reference files.

## Ground Truth

The vendor-neutral contract is `references/ssss-spec.md`. If this skill conflicts
with the spec, correct this skill unless the implementation has intentionally
advanced beyond the vendored spec and the difference is documented here.

Current local implementation entry points:

- `src/core/schema.mjs` — implemented SSSS primitive registry (`SSSS_SCHEMAS`).
- `src/core/operation-validator.mjs` — §6 operation pipeline.
- `src/core/validated-write.mjs` — memory write adapter for the operation
  pipeline.
- `src/core/total-recall-memory-validator.mjs` — schema v2 memory validator.
- `src/core/vault-cache.mjs` — cached vault reads and watcher invalidation.
- `src/core/vector-store.mjs` and `src/core/semantic-index.mjs` — canonical
  search/index path.

## Current Contract

All agent-generated mutations must flow through the SSSS operation pipeline:

```text
processOperation(envelope, vaultRoot, options)
  -> envelope validation
  -> idempotency check
  -> authorization
  -> lease validation
  -> deterministic schema validation
  -> atomic commit
  -> audit event
```

Use `writeNodeValidated()` for Total Recall memory writes. Do not call raw
`writeNode()` or write files directly when an agent is mutating an SSSS vault.

Total Recall currently implements these envelope types in
`processOperation()`:

- `operation` — full file create/replace.
- `patch` — partial frontmatter/body merge.
- `event` — append-only JSON event payload.

The UltraChat host also models a `delete` envelope. Do not claim or use `delete`
inside the Total Recall kernel until `src/core/schema.mjs` and
`src/core/operation-validator.mjs` implement and test it. For memory removal, use
the CLI/API forget/archive flow.

Use `dry_run: true` for preflight validation when constructing writes from model
output.

## Canonical State

The vault is source-of-truth. Derived files, embeddings, search indexes,
instruction shims, UI caches, and projection manifests are disposable and must be
rebuildable from Markdown vault state plus append-only events.

Total Recall is database-free. Do not look for Postgres or SQLite as the record of
truth. The internal vector store is a derived index, not canonical state.

## Scope Layers

Total Recall memory has layered vault scope:

- `global` — machine/user-level brain shared across registered projects.
- `project` — repository-local brain and session context.

Host applications can add product runtime scopes such as `system`, `account`, and
`workspace`. The UltraChat implementation proved the rule that shared system
skills must be inherited through an overlay, not copied into every workspace.
When authoring portable SSSS guidance, preserve this separation:

- system/platform primitives are hidden shared defaults;
- account-local primitives must not leak into workspace runtimes unless forked or
  explicitly installed;
- workspace primitives can shadow shared system defaults;
- legacy copied system artifacts should be treated as derived cleanup targets only
  when metadata proves they are seeded copies.

Do not flatten these layers into one directory or one effective identity in docs,
validators, or examples.

## Primitive Registry

`src/core/schema.mjs` is the implementation registry. `references/ssss-spec.md`
is the vendor-neutral baseline. When adding or changing a primitive:

1. Update `SSSS_SCHEMAS` and the relevant Zod schema.
2. Update the spec or this skill if the primitive is standard or host-specific
   respectively.
3. Add/adjust fixtures or tests for the required fields and invalid cases.
4. Confirm projection behavior is declared as source, projection, or external
   state.

The current implementation includes the core spec primitives plus host/product
extensions such as `personalization_profile`, `account_assistant`,
`account_memory`, `account_workflow`, `workspace_transfer`, CRM/CMS/commerce
types, telephony types, and workspace/package types. Treat those as implemented
host extensions unless the spec explicitly standardizes them.

## Memory Nodes

Memory files under `.agent/memory-vault/**` are `type: memory` and must satisfy
SSSS schema v2. Required schema v2 knowledge-graph fields are:

- `confidence`
- `importance`
- `modality`
- `subject`
- `predicate`
- `object`
- `sentiment_polarity`
- `sentiment_target`

Invariants additionally use `priority: absolute` and `immutable: true`.

### OKF Compatibility Note
SSSS v0.2 is a strict superset of the Open Knowledge Format (OKF v0.1 Draft). SSSS memory nodes are fully OKF-compatible, as they are Markdown files containing a YAML frontmatter block with a `type` field (which maps to SSSS `category` via the OKF adapter). To bridge the format seamlessly, SSSS v0.2 extends `MemoryNodeSchema` with two optional OKF-standard fields: `description` and `resource` (supporting non-HTTP URIs such as `gs://` or `s3://`).

Memory validation is owned by `TotalRecallMemoryValidator`, not by generic loose
frontmatter checks. No memory path may be committed with zero validation.

## Reads And Writes

- Use `vault-cache.mjs` `getNodes()` for vault reads. Do not call `loadNodes()`
  directly in new code.
- Use `writeNodeValidated()` or `processOperation()` for writes.
- Invalidate the vault cache after successful writes.
- Keep append-type documents append-only. `conversation` and `run` may append
  body records but must not rewrite prior records.
- Events are immutable. Do not update or delete event records.
- Leases must be time-bound, actor-owned, operation-linked, and recoverable.

## Projections And Indexes

Projection manifests must mark derived artifacts as disposable and record enough
provenance to detect drift. A projection must have a rebuild path from vault state
and events or be documented as external non-projection state.

The canonical search/index stack is the Total Recall semantic index/vector store.
Do not introduce a second embedding or indexing path for SSSS memory unless the
spec and tests are updated together.

## Validation

Validate an individual SSSS Markdown file with:

```bash
node .agent/skills/ssss/scripts/validate-schema.mjs <path-to-node.md>
```

Run focused kernel tests after changing the operation contract, schema registry,
validator, or vault cache:

```bash
npx vitest run \
  src/core/schema.spec.mjs \
  src/core/operation-validator.spec.mjs \
  src/core/total-recall-memory-validator.spec.mjs \
  src/core/vault-cache.spec.mjs
```

## Do Not

- Do not write agent mutations directly to vault files.
- Do not make derived indexes or projections canonical.
- Do not bypass deterministic validation for model-generated changes.
- Do not collapse `global`/`project` or `system`/`account`/`workspace` scope
  boundaries.
- Do not represent copied seeded skills as canonical system primitives.
- Do not claim Total Recall supports `delete` envelopes until the implementation
  supports them.
- Do not add host-specific required fields to the vendor-neutral spec unless they
  are being standardized.

## References

| For | Read |
| --- | --- |
| SSSS standard | `references/ssss-spec.md` |
| Implemented schemas | `src/core/schema.mjs` |
| Operation pipeline | `src/core/operation-validator.mjs` |
| Validated memory writes | `src/core/validated-write.mjs` |
| Memory validator | `src/core/total-recall-memory-validator.mjs` |
| Vault cache | `src/core/vault-cache.mjs` |
| Total Recall SSSS v2 reference | `.agent/skills/total-recall/references/ssss-reference.md` |

# Total Recall Cognitive Memory Layers

This document defines Total Recall's implementation-specific memory layering on
top of the vendor-neutral SSSS spec. It does not change canonical SSSS protocol
law. Layer metadata uses `x_memory_layer` because host-specific fields must use
the `x_` namespace.

## Layer Contract

| Layer | `x_memory_layer` | Responsibility | Canonical inputs | Canonical outputs |
|-------|------------------|----------------|------------------|-------------------|
| Conscious | `conscious` | Maintain the small working set that should affect immediate behavior. | Active user directives, Tier 1 invariants, current task context, high-confidence preferences. | Tier 1 instructions, skill capsules, active task focus. |
| System 2 | `system2` | Perform slow reasoning over memory before conclusions become broadly active. | Conflicts, draft evidence, stale memories, failed workflows, open plans. | Decisions, concepts, proposals, conflict resolutions, promotion/rejection judgments. |
| Research | `research` | Acquire and preserve externally sourced evidence with provenance. | Web search, documentation fetches, source inspections, refresh tasks. | Draft facts in the inbox, cited research reports, stale-knowledge refresh material. |

## Cooperation Flow

1. Conscious identifies a need: an uncertainty, repeated topic, current task
   pressure, or violated invariant.
2. System 2 deliberates over the current vault and either resolves the question
   from existing memory or opens a research task.
3. Research acquires evidence and writes draft `memory` nodes tagged with
   `x_memory_layer: research`.
4. System 2 validates research drafts, checks conflicts, deduplicates, and
   converts durable conclusions into `facts`, `concepts`, `decisions`, or
   `proposal` files.
5. The surface compiler rebuilds disposable indexes, routes active memories to
   skills, and promotes only the validated working set into Conscious context.

## Frontmatter Guidance

Use `x_memory_layer` when a node's role is known:

```yaml
x_memory_layer: conscious
```

When omitted, Total Recall infers a layer:

| Signal | Inferred layer |
|--------|----------------|
| `priority: absolute`, `invariants`, `patterns`, `anti-patterns`, `preferences` | `conscious` |
| `decisions`, `concepts`, `proposals`, `system2`/`deliberation` tags | `system2` |
| `facts`, `source.type: web-search`, `research`/`knowledge-acquisition` tags | `research` |

Research-layer nodes should normally begin as `status: draft` in the inbox.
System 2 is responsible for promoting them after evidence review and conflict
checks. Conscious memory should stay small; it is not a dumping ground for raw
facts.

## Derived Index

`total-recall compile` writes `.agent/memory-derived/memory-layers.jsonl`. Each
line records a node's inferred layer and enough metadata for tools to inspect the
current cognitive split without reading the full vault:

```json
{"v":1,"slug":"prefer-atomic-writes","layer":"conscious","category":"patterns","status":"active","confidence":0.92,"importance":4}
```

The index is disposable. The vault remains the source of truth.

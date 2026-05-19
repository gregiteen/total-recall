# SSSS Schema v2 — Quick Reference

> Source: Total Recall PRD §6 and ssss/SKILL.md

## Memory Node Required Fields

```yaml
type: memory
slug: kebab-case-name          # matches filename without .md
category: patterns             # matches parent directory
title: "Human-readable title"
schema_version: 2
status: active                 # active | superseded | deprecated | draft
confidence: 0.92               # 0.00 – 1.00
importance: 3                  # 1 – 5
modality: must                 # must | must_not | should | should_not | descriptive | preference
subject: agent                 # who is constrained
predicate: use_atomic_write    # what action (snake_case verb)
object: file_system            # what target
sentiment_polarity: directive_must
x_memory_layer: conscious        # optional: conscious | system2 | research
```

`x_memory_layer` is Total Recall implementation metadata, not vendor-neutral
protocol law. Use it when the node's cognitive role is explicit; otherwise the
surface compiler infers the layer from category, tags, source, and priority.

## Category Taxonomy

| Category | Directory | Purpose |
|:---|:---|:---|
| `invariants` | `memory-vault/invariants/` | Absolute rules (priority: absolute) |
| `patterns` | `memory-vault/patterns/` | "Always do X" |
| `anti-patterns` | `memory-vault/anti-patterns/` | "Never do X" |
| `preferences` | `memory-vault/preferences/` | User style preferences |
| `decisions` | `memory-vault/decisions/` | One-time architectural choices |
| `concepts` | `memory-vault/concepts/` | Domain knowledge |
| `facts` | `memory-vault/facts/` | Factual assertions |
| `lore` | `memory-vault/lore/` | Backstory and context |

## Type Boundaries (DO NOT MIX)

| Field | Memory Nodes | Dev Skills |
|:---|:---|:---|
| `type` | ✅ | ❌ |
| `slug` | ✅ | ❌ |
| `category` | ✅ | ❌ |
| `importance` | ✅ | ❌ |
| `modality` | ✅ | ❌ |
| `name` | ❌ | ✅ |
| `description` | ❌ | ✅ |

Memory nodes use SSSS frontmatter. Dev skills use only `name` + `description`. Never cross the streams.

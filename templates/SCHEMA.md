# Wiki Node Schema

> Canonical format reference for all wiki nodes in `.agent/memory-wiki/`.
> CLI agents (Archivist, Synthesizer, Fact-Checker) MUST read this before creating or updating nodes.

## File Naming

- One concept per file. Atomic notes.
- Filenames: `kebab-case.md` (e.g., `no-templates.md`, `rule-zero-absolute.md`)
- Location: `.agent/memory-wiki/{category}/` where category matches the `type` field

## YAML Frontmatter (Required)

```yaml
---
type: preference           # REQUIRED: preference | pattern | anti-pattern | concept | decision | project
confidence: high           # REQUIRED: high | medium | low — decays over time (see Decay Rules)
sentiment: negative        # REQUIRED: positive | negative | neutral | corrective
sentiment_intensity: 9     # REQUIRED: 1-10 — how strongly the user felt
last_verified: 2026-05-01  # Date last confirmed accurate by agent or fact-checker
created: 2026-05-01        # Date first created
access_count: 0            # Bumped every time this node is returned by search
provenance:                # REQUIRED: at least one source link
  - "episode:2026-05-01/session-c4cd19a3"
  - "learning:2946"
related:                   # Optional: bidirectional backlinks
  - "[[zero-shot-generation]]"
  - "[[branding-as-context]]"
supersedes: null           # slug of node this one replaces (null if none)
superseded_by: null        # slug of node that replaced this one (null if none)
---
```

## Required Fields

| Field | Values | Notes |
|---|---|---|
| `type` | preference, pattern, anti-pattern, concept, decision, project | Determines category directory |
| `confidence` | high, medium, low | Auto-decays (see below) |
| `sentiment` | positive, negative, neutral, corrective | Emotional valence of the knowledge |
| `sentiment_intensity` | 1-10 | Signal strength — higher = more load-bearing |
| `provenance` | array of source references | NOTHING is unsourced |

## Markdown Body

```markdown
# Node Title

> [!CAUTION]
> Use for anti-patterns (negative sentiment, intensity ≥ 7).
> Describes what MUST NOT be done and why.

> [!TIP]
> Use for praised behaviors (positive sentiment).
> Describes what SHOULD be done more often.

> [!IMPORTANT]
> Use for corrective facts.
> Describes knowledge corrections the user provided.

> [!NOTE]
> Use for background context (neutral sentiment).
> Informational notes without strong valence.

## Applies To
- Where this knowledge is relevant

## Evidence
> "Verbatim user quotes go here in blockquotes"
> — User, YYYY-MM-DD (🔴 intensity: N)

- [YYYY-MM-DD] Source reference and what happened

## Related
- [[linked-node-slug]] — Brief description of relationship
```

## Semantic Markdown Formatting Rules

Markdown formatting IS the semantic layer. LLMs parse these as meaning:

| Format | Meaning | When to Use |
|---|---|---|
| `> [!CAUTION]` | Anti-pattern / danger | Negative sentiment, intensity ≥ 7 |
| `> [!TIP]` | Praised behavior / do more | Positive sentiment |
| `> [!IMPORTANT]` | Corrective fact | Knowledge corrections |
| `> [!NOTE]` | Background context | Neutral informational |
| `> blockquotes` | Verbatim user words | Provenance — exact quotes |
| **Bold** | Key terms | Anchor recall in search |
| ~~Strikethrough~~ | Superseded knowledge | Old facts (visible history) |
| 🔴🟡🟢 | Confidence traffic light | Visual scanning in INDEX |
| `code blocks` | Technical examples | Commands, schemas, patterns |

## Confidence Decay Rules (Type-Differentiated)

| Type | high → medium | medium → low | Notes |
|---|---|---|---|
| preference | 90 days | 180 days | User tastes are durable |
| anti-pattern | 60 days | 120 days | Can become irrelevant after refactoring |
| pattern / concept | 30 days | 90 days | Evolve with the codebase |
| decision | 45 days | 120 days | Moderately stable |
| project | 14 days | 45 days | Context ages fastest |

**Access resets the decay clock.** If a node is returned by search, `last_verified` is updated and confidence stays at its current level.

## Validation Rules (wiki-lint.mjs)

- **ERROR** (blocks pipeline): Missing `type` or `provenance` fields
- **WARN** (logged but passes): Missing `sentiment`, `sentiment_intensity`, or `confidence`
- **INFO**: Orphaned nodes (no backlinks), thin nodes (< 50 words body)

## Example: Complete Node

```markdown
---
type: anti-pattern
confidence: high
sentiment: negative
sentiment_intensity: 9
last_verified: 2026-05-01
created: 2026-05-01
access_count: 3
provenance:
  - "episode:2026-05-01/session-c4cd19a3"
related:
  - "[[zero-shot-generation]]"
  - "[[branding-as-context]]"
supersedes: null
superseded_by: null
---

# No Templates

> [!CAUTION]
> The user explicitly rejects template-based design. All generation must be
> zero-shot, dynamically created by AI from the DESIGN.md tokens.

## Applies To
- Site generation in the Sandbox
- Slide deck generation
- Email campaign content
- Any external asset creation

## Evidence
> "I DON'T THINK CLAUDE DESIGN USES TEMPLATES RIGHT?
> NOTHING IS TEMPLATED ANYMORE PLEASE USE MODERN SENSIBILITIES"
> — User, 2026-05-01 (🔴 intensity: 9, ALL CAPS)

- [2026-05-01] Critical directive during branding architecture session

## Related
- [[zero-shot-generation]] — The paradigm this preference enforces
- [[branding-as-context]] — The module where this applies most
```

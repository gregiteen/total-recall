# Memory Node Schema v2

All memory files in `.agent/memory-vault/**/*.md` MUST contain this exact frontmatter block:

```yaml
---
type: memory
slug: your-descriptive-slug-lowercase-with-hyphens
category: facts      # invariants | preferences | patterns | decisions | concepts | facts | lore
schema_version: 2
status: active       # active | draft | superseded | deprecated
importance: 3        # 1-5 (1=trivial, 5=critical invariant)
priority: normal     # normal | high | absolute (absolute routes to Tier 1 INSTRUCTIONS)
modality: descriptive # must | must_not | should | should_not | descriptive | preference
---
```

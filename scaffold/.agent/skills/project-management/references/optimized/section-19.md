### 2. Triage Mode

Use when the user reports bugs, confusion, errors, screenshots, logs, or anxiety about the project.

Classify each item by severity, area, whether it blocks the repo's core workflow, and next action:

- `P0-critical`: blocks the core workflow, data safety, or production operation.
- `P1-high`: seriously damages the core workflow but has a workaround.
- `P2-medium`: annoying or incomplete, but usage can continue.
- `P3-low`: polish, copy, visual cleanup.

Blocker test (repo-specific overlay defines the concrete workflow this refers to):

> Would this prevent the product from being safely used, correctly built, or reliably deployed?

```md
## Triage

### P0 / Blocker
- [Item] → [Issue/action]

### P1
- [Item] → [Issue/action]

### P2/P3
- [Item] → Backlog unless already in current scope

## Next move
[One concrete step]
```


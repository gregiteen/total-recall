---
name: automations
description: "Run scheduled plugin tasks and inspect automation sources, triggers, observed outcomes and coverage across the mesh."
version: 1.2.0
repo_scoped: false
---

# Automations

Run scheduled plugin tasks and inspect automation sources, triggers, observed outcomes and coverage across the mesh.

## When to Use

Use the `automations` Total Recall plugin (`total-recall automations`) instead of ad-hoc scripts or raw commands whenever working on automations tasks.

## Commands

```bash
total-recall automations --help
total-recall automations list  # List automations and source coverage across known nodes
total-recall automations status  # Report observed automation states and source coverage
total-recall automations show  # Inspect one automation by its stable id
total-recall automations dream  # Run dream, including decay, for every brain on this node
total-recall automations cancel  # Cancel one pending local durable task through its owner
```

## Owned Raw Commands

This plugin owns: `(crontab\s+-l\b|launchctl\s+list\b)`.

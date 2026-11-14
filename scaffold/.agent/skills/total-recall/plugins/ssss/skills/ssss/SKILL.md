---
name: ssss
description: "Canonical SSSS distribution, scaffolding and validation for Total Recall installations."
version: 0.2.0
repo_scoped: false
---

# SSSS

Canonical SSSS distribution, scaffolding and validation for Total Recall installations.

## When to Use

Use the `ssss` Total Recall plugin (`total-recall ssss`) instead of ad-hoc scripts or raw commands whenever working on ssss tasks.

## Commands

```bash
total-recall ssss --help
total-recall ssss status  # Inspect the installed engine, skill and full scaffold
total-recall ssss repair  # Restore missing or previously repinned managed SSSS installation files
total-recall ssss validate  # Validate a document against the effective SSSS registry
total-recall ssss registry  # Verify the effective registry against a lock file
total-recall ssss scaffold  # Create a complete canonical SSSS project
total-recall ssss conformance  # Run the canonical reference engine conformance suite
```

## Owned Raw Commands

This plugin owns: `npx\s+(--yes\s+)?@gregiteen/ssss-cli\s+new\b`.

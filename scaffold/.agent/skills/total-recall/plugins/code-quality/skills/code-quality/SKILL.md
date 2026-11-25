---
name: code-quality
description: "Fail-closed deterministic code-quality gates, lint rules, and test compliance reporting."
version: 0.4.0
repo_scoped: false
---

# Code Quality Gates

Fail-closed deterministic code-quality gates, lint rules, and test compliance reporting.

## When to Use

Use the `code-quality` Total Recall plugin (`total-recall code-quality`) instead of ad-hoc scripts or raw commands whenever working on code quality gates tasks.

## Commands

```bash
total-recall code-quality --help
total-recall code-quality report  # Read the latest gate report or --review-diagnostics, with --json for machine output. Never starts a check
total-recall code-quality run  # Run the selected repository's configured fast or full gates once and persist the report
total-recall code-quality snapshot  # Copy the exact source under test (git file lists of this repo and linked plugin repos, secrets refused) to the test node, with a SHA-256 manifest
total-recall code-quality gate  # List, add or remove this repository's gates (validated, recorded in the project vault)
total-recall code-quality config  # Get, set, validate, check, rebuild or import the repo-layer config
total-recall code-quality detect  # Propose gates from the repository (--apply to record them)
total-recall code-quality init  # Create the repo-layer config from defaults, detection and prompts
total-recall code-quality ensure  # Set up gates where a repository has none (--all for active projects); never replaces a list
total-recall code-quality coverage  # Which registered repositories have gates, and how old their reports are
total-recall code-quality plugin-check  # Validate the plugin in this repository; exits 1 on a problem
total-recall code-quality gate-status  # One line: does this repository have gates, and did the last run pass
```

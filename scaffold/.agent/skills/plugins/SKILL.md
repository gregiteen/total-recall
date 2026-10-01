---
name: plugins
description: Create, validate, install or share Total Recall plugins.
repo_scoped: false
---

<!-- total-recall:skill-router:v1 -->

# Plugins

Use the plugin workspace and current `plugin.json`/extension contracts. Keep optional capabilities in plugins rather than portable memory core. Every claimed command, schedule, UI/API action or memory extension needs a real handler and validation.

Read implementation or installation references for that operation. Verify scopes, invalid input, canonical SSSS writes, failure reporting and actual execution. Sharing requires explicit authorization; public bundles exclude credentials, private vault content and runtime state. Read sharing procedures only when sharing is requested.

Before an operation, read its [task references](references/optimized/index.md), including prerequisites and constraints. If the applicable procedure is unclear, read the preserved original instead of guessing. Commands assume the skill root.

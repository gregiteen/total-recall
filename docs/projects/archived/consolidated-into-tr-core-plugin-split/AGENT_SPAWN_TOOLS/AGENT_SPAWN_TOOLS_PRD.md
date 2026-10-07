---
type: project_document
title: AGENT_SPAWN_TOOLS — PRD
description: Requirements for workflow-capable agent spawns, remote cwd, headless Claude auth and bounded agent-home logs.
timestamp: 2026-10-06T04:10:00Z
tags: [project-management, meta-harness]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# AGENT_SPAWN_TOOLS — PRD

1. `total-recall agent spawn claude "<task>"` runs with Claude Code's built-in tools (search, fetch, shell, edit) by default.
2. Callers choose the tool set: `--tools <list|none|default>` (alias `--allow-tools`), `--no-tools`; `spawnAgent(…, { tools })` in code.
3. `--cwd <dir>` sets the working directory, locally or on the `--node` target.
4. Claude Code authenticates headlessly with `CLAUDE_CODE_OAUTH_TOKEN` from the secret store when the environment lacks it.
5. Logs under the agent home are size-capped without unlinking open files.
6. Specs cover each requirement and fail on the old behaviour.
7. Release through the push skill with gates on the Mac mini.
8. Mac mini: daemon log trimmed; master password removed from LaunchAgents; master rotated fleet-wide.

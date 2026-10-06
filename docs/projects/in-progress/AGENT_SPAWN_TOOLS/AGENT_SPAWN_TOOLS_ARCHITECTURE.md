---
type: project_document
title: AGENT_SPAWN_TOOLS — Architecture
description: Flag builder, auth env resolution, remote spawn command and agent-home log policy.
timestamp: 2026-10-06T04:10:00Z
tags: [project-management, meta-harness]
---

# AGENT_SPAWN_TOOLS — Architecture

- `meta-harness.mjs`: harness specs declare `toolsFlag`, `settingSourcesFlag` and `authSecrets`. `buildHarnessArgs(spec, { tools, settingSources })` inserts the flags before a trailing prompt flag (`-p`). `resolveHarnessEnv(spec, env, { readSecret })` fills declared auth secrets from the global store. `shellQuote` POSIX-quotes remote arguments.
- `agent-manager.mjs`: `spawnAgent` validates the selection, resolves `cwd` (`~` = this node's home), builds args and env, and records `tools` in the registry. `buildRemoteSpawnCommand` recreates the spawn on another node with every value quoted.
- `cli/agent.mjs`: `parseSpawnArgs` consumes option values with their flags and rejects unknown options.
- `cache-prune.mjs`: `AGENT_HOME_POLICIES` (size cap 25 MB keeping 5 MB for `logs/*.log`; 14-day age for `logs/system-*.jsonl`) run against `agentHomeFor(brainDir)` for conventionally placed brains, under the same protected-path rules.
- `auto-pull.sh` appends to `server.log` so in-place truncation never leaves a sparse file.

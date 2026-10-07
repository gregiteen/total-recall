---
type: project_document
title: AGENT_SPAWN_TOOLS — Development Plan
description: Ordered steps for the spawn/auth/log fix, release and Mac mini remediation.
timestamp: 2026-10-06T04:10:00Z
tags: [project-management, meta-harness]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# AGENT_SPAWN_TOOLS — Development Plan

1. Flag builder, auth env and quoting in `meta-harness.mjs`; specs.
2. `spawnAgent` cwd/tools/auth and remote command; specs with a stand-in binary and mocked mesh.
3. CLI parser; specs.
4. Agent-home log policy and auto-pull append; specs.
5. Changelog and version; full gates and suite on the Mac mini; native isolated boot; dist check; publish dry run; publish; registry confirmation.
6. Mac mini: trim `daemon.log`; master rotation across laptop, Mac mini and droplet with one coordinated replacement; Mac mini LaunchAgents read the Keychain; restart affected services; verify.

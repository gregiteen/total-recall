---
type: project_document
title: SHARED_STARTUP_RUNTIME — Development_Plan
description: CLI-first shared startup health and bounded local repair.
timestamp: 2026-09-30
tags: [project-management, startup, runtime]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# SHARED_STARTUP_RUNTIME — Development_Plan

> **Project Prefix**: `SHARED_STARTUP_RUNTIME`
> **Kanban State**: In Progress
> **Date**: 2026-09-30

> **Based on audit**: SHARED_STARTUP_RUNTIME_AUDIT.md (Complete, working-tree baseline)

1. Synthetic negative tests for missing tools/config, foreign PID, unrelated HTTP200, failed commands and post-start readiness. 2. Implement generic CLI and brief integration. 3. Populate global start package and corrective source instructions. 4. Root runs focused/full background gates on Mac mini and safe configured-host smoke. 5. Root propagates reviewed shared package; no release.

## Reviewed startup boundaries — 2026-09-30

Local readiness requires canonical script identity and PID ownership of the configured TCP listener. An offline health probe cannot authorize starting a live, unknown, or foreign process. Essential VFS and skill existence must be true. Remote daemon status comes from the configured remote health response and carries remote provenance. Instructions access is checked separately, with configured tokens kept within their configured origin; successful instructions access does not independently prove current-project registration because the existing route can fall back to shared content.

The globally registered `startup-check` composable command loads the registered start package helper, then resolves native support or exactly one matching verified package entry from known registered repository roots; an explicit `TR_STARTUP_CLI` override resolves ambiguity. It shares the native implementation and requires no publication, personal path, new persistence, or package download. Root owns registration and propagation. Declared app commands invoke their exact validated current-repository module; builtin name collisions are rejected. SSSS discovery checks the current repository launcher, local dependency bin, and PATH.

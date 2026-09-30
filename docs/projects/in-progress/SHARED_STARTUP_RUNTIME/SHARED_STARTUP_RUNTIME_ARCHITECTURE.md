---
type: project_document
title: SHARED_STARTUP_RUNTIME — Architecture
description: CLI-first shared startup health and bounded local repair.
timestamp: 2026-09-30
tags: [project-management, startup, runtime]
---

# SHARED_STARTUP_RUNTIME — Architecture

> **Project Prefix**: `SHARED_STARTUP_RUNTIME`
> **Kanban State**: In Progress
> **Date**: 2026-09-30

> **Based on audit**: SHARED_STARTUP_RUNTIME_AUDIT.md (Complete, working-tree baseline)

startup builtin → core startup health module → existing config/PID identity/health + bounded CLI/process-manager argv. brief imports read-only status. Global start wrapper calls ensure then brief; repo-owned start continues its product logic. No new persistent state; existing SSSS operation interfaces remain canonical.

## Reviewed startup boundaries — 2026-09-30

Local readiness requires canonical script identity and PID ownership of the configured TCP listener. An offline health probe cannot authorize starting a live, unknown, or foreign process. Essential VFS and skill existence must be true. Remote daemon status comes from the configured remote health response and carries remote provenance. Instructions access is checked separately, with configured tokens kept within their configured origin; successful instructions access does not independently prove current-project registration because the existing route can fall back to shared content.

The globally registered `startup-check` composable command loads the registered start package helper, then resolves native support or exactly one matching verified package entry from known registered repository roots; an explicit `TR_STARTUP_CLI` override resolves ambiguity. It shares the native implementation and requires no publication, personal path, new persistence, or package download. Root owns registration and propagation. Declared app commands invoke their exact validated current-repository module; builtin name collisions are rejected. SSSS discovery checks the current repository launcher, local dependency bin, and PATH.

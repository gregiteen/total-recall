---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Development Plan
description: Phased order for extension points and feature moves.
timestamp: 2026-09-26T00:00:00Z
tags: [project-management, development-plan, total-recall, plugins]
---

# TR_CORE_PLUGIN_SPLIT — Development Plan

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

Starts after CAPABILITY_DEPLOYMENT_PLUGINS Phase 2B (schema config + generated CLI), which it reuses.

## Phase 0B — Repo-per-plugin infrastructure

Repos are `gregiteen/tr-plugin-<id>`, MIT licensed. Add `default-plugins.lock.json` and the lock-driven install on `init`/`upgrade` with an artifact cache, plus a plugin repo template (manifest, CI running the plugin specs against a pinned core, release workflow emitting a bundle and digest). Move the three bundled plugins (`code-quality`, `git-sentinel`, `system-monitor`) to their own repos as the first proof.
**Done when:** a clean `init` installs those three from their repos by digest, and `plugins/` holds nothing they need.

## Phase 1 — Extension points

Add `routes`, `tools`, `ui`, `hooks`, and `config` to the manifest and loader, each proven by moving one low-coupling feature: **tts** proves routes, **collab** routes + websocket, **obsidian** hooks, **usage** ui + routes.
**Done when:** S1 passes and the four features run from their own repos, installed by digest.

## Phase 2 — Low-coupling features

meta-harness, notifications, repo-expert generation, github/repo sync, friction/post-mortem.
**Done when:** each passes its specs from the plugin and can be disabled cleanly (S2, S3).

## Phase 3 — Medium coupling

source ingesters, OKF/OpenWiki, sandbox/code mode, secrets rotation/provider sync (the secrets store stays core).
**Done when:** as Phase 2, plus the secret grant audit for rotation.

## Phase 4 — Research and mesh

Research (15 outside importers) and mesh (16). Introduce core events for the daemon and dream-cycle calls first, then move.
**Done when:** the daemon 24 h walkthrough passes with both enabled and both disabled (S6).

## Phase 5 — Release

Package-size report (S4), white-label gate (S5), full suite on the Mac Mini, upgrade test from the last release, and docs. Release via the push skill.

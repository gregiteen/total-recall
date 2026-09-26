---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Project Tracker
description: Checklist for splitting standard Total Recall features into plugins, each in its own repository.
timestamp: 2026-09-26T00:00:00Z
tags: [project-management, tracker, total-recall, plugins]
---

# TR_CORE_PLUGIN_SPLIT — Project Tracker

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

Depends on: CAPABILITY_DEPLOYMENT_PLUGINS Phase 2B (schema config, generated CLI, design-token UI).

## ✅ Phase 0: Scope

Goal: Record what can move, in what order, with evidence.

- [x] [AUDIT](TR_CORE_PLUGIN_SPLIT_AUDIT.md): feature inventory, import coupling, missing extension points, white-label status (M)
- [x] [PRD](TR_CORE_PLUGIN_SPLIT_PRD.md), [ARCHITECTURE](TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md), [DEVELOPMENT_PLAN](TR_CORE_PLUGIN_SPLIT_DEVELOPMENT_PLAN.md) (M)
- [ ] User review of the core boundary and move order (S)

## ⏳ Phase 0B: Repo per plugin

Goal: Every plugin lives in its own repository; the core ships none.

- [x] GitHub owner and naming: `gregiteen/tr-plugin-<id>` (user decision, 2026-09-25) (S)
- [x] License for plugin repos: MIT, matching the core (user decision, 2026-09-25) (S)
- [ ] Plugin repo template: manifest, specs, CI against a pinned core, release workflow emitting `tr-plugin-bundle/1` + digest (M)
- [ ] `default-plugins.lock.json` + lock-driven install on `init`/`upgrade` via `plugin-store.mjs`; artifact cache for offline reinstall; digest mismatch refuses (M)
- [ ] Move bundled `code-quality`, `git-sentinel`, `system-monitor` to their own repos; remove them from `plugins/` (M)
- [ ] Remove `plugins/` from `package.json` `files` once empty (S)

## ⏳ Phase 1: Extension points

Goal: Plugins can do what built-in features do.

- [ ] `metadata.plugin.schema.json` + `plugin-loader.mjs`: `routes`, `tools`, `ui`, `hooks`, `config` (M)
- [ ] `src/server/rest.mjs`: mount plugin routes under `/api/<plugin-id>/`, scoped auth, route manifest entries (M)
- [ ] `src/server/tools.mjs`: register namespaced plugin tools, run via `plugin-runner` (M)
- [ ] Core event bus for `vault.written`, `session.ended`, `dream.cycle`, `daemon.tick`; time-limited, failure-isolated hooks (M)
- [ ] Dashboard: plugin page/panel slots + generated settings form (L)
- [ ] Move **tts** (routes), **collab** (routes + ws), **obsidian** (hooks), **usage** (ui + routes), each into its own repo (M each)

## ⏳ Phase 2: Low-coupling features

Goal: Move the easy features, each into its own repository.

- [ ] meta-harness / agent manager (M)
- [ ] notifications / emergency alerts (M)
- [ ] repo-expert generation (S)
- [ ] github / repo sync (M)
- [ ] friction / post-mortem / session watcher (M)

## ⏳ Phase 3: Medium coupling

Goal: Move features wired into several subsystems.

- [ ] source ingesters (M)
- [ ] OKF / OpenWiki ingest + export (M)
- [ ] sandbox / code mode (M)
- [ ] secrets rotation, provider sync, remote deploy (the store stays core); audited secret grant (L)

## ⏳ Phase 4: Research and mesh

Goal: Move the most coupled features without destabilizing the daemon.

- [ ] Replace research's direct calls from daemon-loop, dream, and post-mortem with core events (M)
- [ ] Move research (System 2) (L)
- [ ] Replace mesh's direct calls from agent-manager, daemon-loop, meta-harness, embeddings, and plugin-peers with core services/events (L)
- [ ] Move mesh / headscale / network (L)

## ⏳ Phase 5: Verification and release

Goal: Same features, smaller core, proven stable.

- [/] White-label grep gate for the core and every plugin repo; fix `src/server/tools.mjs:816,833` examples (S) — core gate (TR-OSS-002, TR-SHIP-004) and examples done 2026-09-25; plugin repos pending
- [ ] Upgrade test from the last release: moved features keep working, vault untouched (M)
- [ ] Core package-size report before/after (S)
- [ ] Full suite on the Mac Mini (M)
- [ ] 24 h daemon walkthrough with all default plugins enabled, then all disabled (M)
- [ ] Docs, repo-expert, and plugin authoring skill updated; release via the push skill (M)

## Verification Log

- 2026-09-25: Coupling measured with a static/dynamic relative-import scan of non-spec `src/**/*.mjs` (counts in the audit). Manifest fields confirmed in `metadata.plugin.schema.json` (`cli`, `compile`, `tasks`, `use_cases`, `memory_categories`). No code changed.
- 2026-09-25: User decision: everything gets its own repo. Added Phase 0B (repo template, pinned default-plugin lock, move the 3 bundled plugins out).
- 2026-09-25: User: plugin repos go under the `gregiteen` GitHub account, named `tr-plugin-<id>`.
- 2026-09-25: User: plugin repos are MIT licensed.

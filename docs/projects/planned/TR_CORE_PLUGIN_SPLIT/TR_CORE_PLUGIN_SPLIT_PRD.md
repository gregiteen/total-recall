---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — PRD
description: Requirements for a small Total Recall core with standard features shipped as plugins.
timestamp: 2026-09-26T00:00:00Z
tags: [project-management, prd, total-recall, plugins]
---

# TR_CORE_PLUGIN_SPLIT — PRD

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Problem

Total Recall ships every feature in one package (see the [audit](TR_CORE_PLUGIN_SPLIT_AUDIT.md)). People who want memory and instructions also get mesh, research, TTS, collab, rotation, and more. The code is hard to fork per use, and the plugin system cannot yet express most of what built-in features do.

## Goal

A small, stable core (memory, SSSS, surfaces, secrets store, plugin runtime, daemon, auth) with standard features shipped as **white-label, open-source plugins, each in its own repository** (user decision, 2026-09-25: "everything should have its own repo"). They use the same contract as capability plugins: two layers, a generated CLI, customization through the Total Recall CLI, and design-token UI.

## Requirements

1. **Extension points first.** The plugin runtime gains REST routes, chat tools, dashboard pages/panels, daemon event hooks, and settings UI, each permission-scoped. Re-add them to the manifest only with a consumer and tests (the lesson from PLUGIN_P2P, which removed unconsumed fields).
2. **One repository per plugin.** This covers every moved feature and the three plugins bundled today (`code-quality`, `git-sentinel`, `system-monitor`). Each repo owns its code, specs, CI, license, README, and releases. The core package ships no plugin code.
3. **Default plugin set.** The core carries `default-plugins.lock.json` (repo, tag, content digest). `init` and `upgrade` install from that lock through the existing hash-pinned install pipeline (PLUGIN_P2P), with a local cache for offline reinstall. A digest mismatch refuses the install.
4. **Same features after upgrade.** Moved features install from the default lock, enabled by default for existing brains, with their SSSS documents and events unchanged. A user can disable or remove one without losing vault data.
5. **Customizable through the CLI.** Each plugin's settings are a schema-declared, SSSS-backed config, with generated `total-recall <plugin> config …` commands (shared machinery with CAPABILITY_DEPLOYMENT_PLUGINS Phase 2B).
6. **White-label and open source.** No personal names, hosts, domains, or brands in core or plugin code, help text, or UI defaults. Each plugin has a license and can be forked on its own.
7. **Order by coupling.** Move low-coupling features first; mesh and research go last, after the extension points have been proven.

## Success criteria

| ID | Outcome |
| --- | --- |
| S1 | Routes, tools, UI, and hooks extension points each have one real consumer and tests; the route manifest and dashboard show plugin contributions. |
| S2 | Each moved feature passes its existing specs from the plugin location; the full suite is green on the Mac Mini. |
| S3 | Upgrading a brain that uses a moved feature keeps it working with no user action; disabling it removes its routes, tools, UI, and tasks but leaves its vault data intact. |
| S4 | `npm pack` of the core contains no plugin code; core size is reported before and after. A clean `init` installs the default set from `default-plugins.lock.json`, and an offline reinstall works from the cache. |
| S7 | Every plugin repo builds and passes its own CI, and installs by digest from its tagged release. |
| S5 | The white-label grep gate passes for the core and every plugin repo. |
| S6 | The daemon survives 24 h with all default plugins enabled, and again with all disabled (the readiness walkthrough in the project-management overlay). |

## Out of scope

Capability plugins for apps (CAPABILITY_DEPLOYMENT_PLUGINS) and public plugin distribution (PLUGIN_P2P). This project reuses both.

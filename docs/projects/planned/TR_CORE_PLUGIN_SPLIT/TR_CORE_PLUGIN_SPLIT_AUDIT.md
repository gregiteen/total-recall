---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Audit
description: Evidence for splitting standard Total Recall features out of the core into plugins.
timestamp: 2026-09-26T00:00:00Z
tags: [project-management, audit, total-recall, plugins]
---

# TR_CORE_PLUGIN_SPLIT — Audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Request

User, 2026-09-25: "there are many standard total-recall features that should probably be split out the same way" as the skill → plugin conversion in [CAPABILITY_DEPLOYMENT_PLUGINS](../../in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md). Everything is white-label and open source, and customization happens through the Total Recall CLI.

## Current size

Measured on `main` at `5e21133`: `src/core` holds 269 files (non-spec modules plus specs), there are about 60 CLI command modules in `src/cli`, and 45 REST route groups in `src/server/routes`. `src/server/rest.mjs` has 94 route-import/mount lines. The only bundled plugins are `code-quality` (report only), `git-sentinel`, and `system-monitor`.

## What plugins can extend today

`metadata.plugin.schema.json` and `src/core/plugin-loader.mjs` accept `cli`, `compile` (context generator), `memory_categories`, scheduled `tasks`, and `use_cases`. The PLUGIN_P2P project removed the unconsumed `entrypoint`, `hooks`, `ui`, `notifications`, and `tools` fields. So **a plugin cannot currently add REST routes, chat tools (`src/server/tools.mjs`), dashboard pages, daemon event hooks, or settings UI**. Built-in features use all of these, so the plugin runtime needs these extension points before any real feature can move out.

## Candidate features, by coupling

Coupling = distinct non-spec files outside the group that import it (static and dynamic relative imports; script in the verification log).

| Feature | Files | Outside importers | Where it is wired in |
| --- | --- | --- | --- |
| obsidian sync | 1 | 1 | `core/crons.mjs` |
| collab | 2 | 2 | `server/index.mjs`, `server/rest.mjs` |
| tts | 2 | 2 | `server/api.mjs`, `server/rest.mjs` |
| meta-harness / agent manager | 5 | 3 | `cli/agent.mjs`, `cli/mesh.mjs`, `routes/context.mjs` |
| usage tracking | 2 | 3 | `daemon-loop.mjs`, `runtime.mjs`, `routes/system.mjs` |
| notifications / emergency alerts | 3 | 3 | `daemon-loop.mjs`, `fact-seeker.mjs`, `rest.mjs` |
| repo-expert generation | 1 | 3 | `cli/skill.mjs`, `source-watcher.mjs`, `routes/skills.mjs` |
| github / repo sync | 2 | 4 | `cli/init.mjs`, `crons.mjs`, `daemon-loop.mjs`, `routes/brains.mjs` |
| source ingesters (quick-capture, watchers) | 4 | 4 | `daemon-loop.mjs`, `fact-seeker.mjs`, `research.mjs`, `routes/capture.mjs` |
| friction / post-mortem / session watcher | 4 | 4 | `cli/ingest.mjs`, `daemon-loop.mjs`, `dream.mjs`, `task-executors.mjs` |
| OKF / OpenWiki ingest + export | 3 | 5 | `cli/export`, `ingest`, `init`, `lint`, `core/surface.mjs` |
| secrets rotation, provider sync, remote deploy | 9 | 6 | `cli/deploy`, `cli/secret`, `daemon-loop`, `secrets-store`, `task-executors`, `routes/secrets` |
| sandbox / code mode | 2 | 6 | `evolution`, `runtime`, `api`, `rest`, `routes/scripts`, `tools` |
| research (System 2) | 10 | 15 | CLI share/status, daemon-loop, dream, post-mortem, provider-account-sync, … |
| mesh / headscale / network | 19 | 16 | agent-manager, daemon-loop, meta-harness, ollama-embeddings, plugin-peers, registration-watch, … |

Not candidates (the core): the SSSS kernel bridge and operation service, vault and cache, `remember`/`recall`/`forget`, surface compilation, the plugin runtime and store, the secrets store itself (encryption and keychain), auth/keys/WebAuthn, the daemon loop and scheduler, and CLI/server scaffolding.

## White-label status

A grep of non-spec `src/` files for personal or product identifiers (`gregiteen`, `gregoryiteen`, `festech`, `ultrachat`, mesh IPs) found 8 files. Most are explanatory comments or the mesh CGNAT range. Real hardcoded examples a user would see: `src/server/tools.mjs:816` and `:833` tool descriptions (`"macmini"`, `"100.64.0.2"`, `"gregoryiteen"`) and `src/core/provider-catalog.mjs:249` `docs_url` (the project's own repo, acceptable).

## Conflict with existing skill sync

`total-recall skill push|sync|pull` (`src/cli/skill.mjs`) fans one catalog copy out to every repo install. For two-layer skill plugins (plugin-owned core, repo-owned implementation) that would overwrite repo customizations. This is tracked as a task in CAPABILITY_DEPLOYMENT_PLUGINS Phase 2B.

## Risks

- Mesh and research are wired into `daemon-loop.mjs`, `dream.mjs`, and the plugin peers code. Moving them first would destabilize the daemon, which is priority 2 in the overlay's framework.
- Every moved feature must keep its SSSS state and events readable. Plugin removal must not delete vault data.
- Existing users must get the same features after upgrading. Formerly built-in features install from their own repos through the default plugin lock, enabled by default, until the user opts out.

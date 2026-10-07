---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Audit
description: Evidence for splitting standard Total Recall features out of the core into plugins.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, audit, total-recall, plugins]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# TR_CORE_PLUGIN_SPLIT — Audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Request

User, 2026-09-25: "there are many standard total-recall features that should probably be split out the same way" as the skill → plugin conversion in [CAPABILITY_DEPLOYMENT_PLUGINS](../CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md). Everything is white-label and open source, and customization happens through the Total Recall CLI.

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

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Current defect register

| Finding | Current evidence/problem | Correction and acceptance |
|---|---|---|
| PIC-009 | Search memory-save reports success despite child failure and has an incorrect installed CLI path. | Resolve the actual host CLI, check exit/error/timeout and return persisted memory evidence; negative child outcomes must not save or report success. |
| PIC-010 | Search engine counts/online indicators and health overstate actual results. | Render measured/configured engine status with timestamp and partial/failed state; zero results plus timeout never reports healthy. |
| PIC-011 / PIC-022 | Search UI localStorage and CLI JSON are divergent; settings are ignored and endpoints hardcoded; alerts/search state bypasses SSSS operations. | Use declared SSSS config/events and rebuildable projections; CLI/UI consume identical config, each control changes actual runtime behavior; interrupted/denied writes leave canonical state unchanged. |
| PIC-012 | Search follow-up results are omitted and the constructed report is unused. | Return combined deduplicated cited report and verify query/follow-up/save/UI all reference the same actual sources. |
| PIC-013 | Both bundled context generators return objects the host discards. | Choose one versioned generator return contract and exercise actual host compile for both healthy/unavailable results; compile must retain their evidence. |
| PIC-014 | DSH/Search element sources fail existing adapter validation. | Correct token/source contract in both owned elements, generate web-component and React wrappers, then mount real authenticated data/actions; no static preview substitutes. |
| PIC-015 / PIC-016 / PIC-017 | DSH accepts unrelated listeners, crashes without runtime path, invents tool inventory, misreads HTTP 500 and retains stale errors. | Validate identity and configuration; query authoritative tools/models/metrics via host adapter; unknown stays unknown; unavailable→healthy→unavailable transitions reconstruct the UI without false online states. |
| PIC-018 | Git Sentinel corrupts porcelain columns and reports missing upstream as up-to-date. | Preserve raw status columns, distinguish no-upstream from clean/ahead/behind/error and prove staged/unstaged/untracked behavior in a real temporary repository. |
| PIC-019 | Standalone generated runtime/gates claim readiness without a capability server. | Use canonical SSSS scaffolder, initialize project brain, register extension schemas, start real capability runtime independent of TR and execute feature/conformance/auth checks before atomic publication. |

Audit status: current source and documentation findings recorded; broad extraction/runtime certification remains pending. Historical count/coupling figures above refer to the dated commit, not current tree measurements. Prior summary claims of live plugin exchange or phase completion require linked source-exact evidence before becoming acceptance.

Scope stays Planned while prerequisites are unresolved. Code Quality runner extraction is historical progress, not completion of a UI/default-install contract. The five currently bundled integrations expand the extraction inventory beyond the old three-plugin list. No immediate migration work for hypothetical external users is a release dependency.

## 2026-10-01 skill manager extraction scope

Scope audit: Complete for adding this extraction candidate; extraction readiness remains pending.

| Finding | Evidence | Required outcome |
|---|---|---|
| SPLIT-SKILL-001 | Skill management currently spans `src/cli/skill.mjs`, `src/core/skills-registry.mjs`, `src/core/skill-config.mjs` and the uncommitted optimizer in `src/core/skill-optimizer.mjs` / `src/cli/skill-optimize.mjs`. CONTEXT_OPTIMIZATION records 12 focused remote tests, while clean scaffold, complete gates, periodic optimization and total fresh-start measurement remain open. | Confirm current behavior before extraction; retain exact-source evidence and package ownership/configuration contracts. |
| SPLIT-SKILL-002 | `skill-config.mjs` already defines a plugin-owned JSON Schema and a repo-owned SSSS `skill_config` record with a rebuildable `config.json` projection. | Reuse this generic contract where applicable; ship no machine, account, credential or private memory instances. |
| SPLIT-SKILL-003 | The separate decision plugin already owns a skill named `decision`; Jev is a configurable provider implementation. | Reuse the decision capability for optional routing advice; do not create a competing global skill or bake Jev into mandatory core behavior. |

User explicitly requested extraction later, after confirmation that the current implementation works. This addition does not authorize immediate migration or establish plugin runtime readiness. Source pointers are inventory, not a proven minimal extraction boundary.

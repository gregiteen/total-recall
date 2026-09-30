---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — PRD
description: Requirements for a small Total Recall core with standard features shipped as plugins.
timestamp: 2026-09-30T16:30:00Z
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
2. **One repository per plugin.** This covers every moved feature and the five plugins currently bundled (`creative-search`, `dsh`, `git-sentinel`, `operator-alerts`, `system-monitor`); Code Quality already has a separate repository. Each repo owns its code, specs, CI, license, README, and releases. The core package ships no plugin code.
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

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../../in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Acceptance corrections

- **PIC-009:** Resolve the actual host CLI, check exit/error/timeout and return persisted memory evidence; negative child outcomes must not save or report success.
- **PIC-010:** Render measured/configured engine status with timestamp and partial/failed state; zero results plus timeout never reports healthy.
- **PIC-011 / PIC-022:** Use declared SSSS config/events and rebuildable projections; CLI/UI consume identical config, each control changes actual runtime behavior; interrupted/denied writes leave canonical state unchanged.
- **PIC-012:** Return combined deduplicated cited report and verify query/follow-up/save/UI all reference the same actual sources.
- **PIC-013:** Choose one versioned generator return contract and exercise actual host compile for both healthy/unavailable results; compile must retain their evidence.
- **PIC-014:** Correct token/source contract in both owned elements, generate web-component and React wrappers, then mount real authenticated data/actions; no static preview substitutes.
- **PIC-015 / PIC-016 / PIC-017:** Validate identity and configuration; query authoritative tools/models/metrics via host adapter; unknown stays unknown; unavailable→healthy→unavailable transitions reconstruct the UI without false online states.
- **PIC-018:** Preserve raw status columns, distinguish no-upstream from clean/ahead/behind/error and prove staged/unstaged/untracked behavior in a real temporary repository.
- **PIC-019:** Use canonical SSSS scaffolder, initialize project brain, register extension schemas, start real capability runtime independent of TR and execute feature/conformance/auth checks before atomic publication.

No stubs, successful placeholders, product mocks, fabricated metrics, ignored controls or message-only runtimes may be delivered as capabilities. Test-only synthetic fixtures are retained to verify failures and boundaries, followed by real clean-install/runtime proof. Disabling/removing a plugin preserves its app-owned SSSS data while removing operational surfaces.

Scope stays Planned while prerequisites are unresolved. Code Quality runner extraction is historical progress, not completion of a UI/default-install contract. The five currently bundled integrations expand the extraction inventory beyond the old three-plugin list. No immediate migration work for hypothetical external users is a release dependency.

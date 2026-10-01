---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Architecture
description: Core boundary and plugin extension points for splitting Total Recall features.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, architecture, total-recall, plugins]
---

# TR_CORE_PLUGIN_SPLIT — Architecture

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Boundary

```mermaid
flowchart TB
  subgraph Core
    K[SSSS operation service + vault] --- M[remember / recall / forget]
    K --- S[surface compile]
    K --- SEC[secrets store]
    PR[plugin runtime + store] --- D[daemon loop + scheduler]
    A[auth / keys / WebAuthn] --- SRV[server + CLI shell]
  end
  PR -->|routes| SRV
  PR -->|chat tools| SRV
  PR -->|dashboard panels| UI[Dashboard SPA]
  PR -->|event hooks| D
  subgraph Plugin repos, one per plugin, installed from default-plugins.lock.json
    P1[obsidian] & P2[collab] & P3[tts] & P4[meta-harness] & P5[usage] & P6[notifications] & P7[repo-expert]
    P8[source ingest] & P9[okf/openwiki] & P10[secrets rotation] & P11[sandbox] & P12[research] & P13[mesh]
  end
  P1 & P13 --> PR
```

## Extension points (to add to the manifest, each with a consumer)

| Point | Shape | Enforcement |
| --- | --- | --- |
| `routes` | `{ mount: "/api/<plugin-id>/…", handler, scope }` | Mounted under the plugin's own prefix only; `requireAuth` + declared PAT scope; listed in the route manifest |
| `tools` | chat tool definitions + handler | Namespaced `<plugin-id>.<tool>`; runs through `plugin-runner` child process with declared capabilities |
| `ui` | dashboard pages/panels (React), settings form from `config.schema.json` | Design tokens only; registered in a slot, lazy-loaded |
| `hooks` | subscribe to core events (`vault.written`, `session.ended`, `dream.cycle`, `daemon.tick`) | Async, time-limited, failure-isolated: a plugin hook can never stop the daemon |
| `config` | `config.schema.json` → SSSS `plugin_config` document + generated `config` CLI | Same machinery as CAPABILITY_DEPLOYMENT_PLUGINS skill config |

Plugins no longer live in the core package. Each is its own repository with a tagged release artifact (`tr-plugin-bundle/1`) and content digest. The core's `default-plugins.lock.json` pins the default set. `init`/`upgrade` install them into the global plugins directory through `plugin-store.mjs`'s hash-pinned path, keeping a local artifact cache for offline reinstall. The `plugins/` directory and the `package.json` `files` entry for it are removed at the end of the project. "Enabled" stays per-brain state in `brain-state.json`.

Plugin repos are `gregiteen/tr-plugin-<id>` (for example `gregiteen/tr-plugin-code-quality`), decided 2026-09-25. Every plugin repo is MIT licensed, matching the core. Each repo starts from clean extracted source with the core's history referenced, not copied.

## Moving a feature

1. Create the plugin's repository with manifest, code, specs, CI, README, and license (no personal values). Tag a release and record its digest in `default-plugins.lock.json`.
2. Replace each outside import with an extension point: a route mount, a tool, a hook subscription, or a core service the plugin calls.
3. Keep SSSS types: the plugin registers the same host-extension types; documents and events are untouched.
4. Leave a thin compatibility shim in the core for one release where CLI commands must keep their names (`total-recall research …` → plugin CLI).
5. Delete the core copy once the shim release has shipped.

## Security

Plugin routes and tools inherit no blanket access. They get only their declared scopes, run as a child process where they execute code, and cannot read the secrets store except through a declared, audited grant. This matches CAPABILITY_DEPLOYMENT_PLUGINS' permission model.

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../../in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Required dependency flow

Validated plugin pin and schema → scoped host registration → plugin-owned CLI/UI/runtime → authorized SSSS operations → canonical app-owned documents/events → disposable projections → results with actual provenance. Distribution, installation, UI generation, runtime health and provider acceptance are separate states. Each state has its own evidence and failure status.

Search and alerts own their config/event extensions; DSH owns runtime discovery/proxy/UI; Git Sentinel owns faithful git parsing. Composer owns plan/apply/verify contracts and real standalone scaffolding. Kernel host fixes the shared generator contract and generic route/UI registration. External plugin repos own source/tests/docs; the extraction plan may not copy their simulated host previews into product code.

The diagram and extension-point tables above are target architecture unless this reconciliation identifies a consumed current contract. No compatibility shim or existing-user migration is required merely by hypothetical external installations; validate clean installs and actual developer brains.

Scope stays Planned while prerequisites are unresolved. Code Quality runner extraction is historical progress, not completion of a UI/default-install contract. The five currently bundled integrations expand the extraction inventory beyond the old three-plugin list. No immediate migration work for hypothetical external users is a release dependency.

## Proposed skill manager boundary

The future skill manager plugin owns skill catalog administration, scoped deployment, optimization, periodic audits and IDE invocation adapters, subject to a refreshed importer/consumer audit. Core retains generic SSSS operations, memory/instruction retrieval and the minimal plugin-host interface. Existing CLI paths remain compatible during migration.

Use the existing layered skill contract (`core/config.schema.json` plus repo-owned SSSS `skill_config`, with disposable `config.json` projection) where applicable. Portable methods are global; local overlays/configuration own repository identity and runtime topology. Publish no resolved private instance data. Resolve optional decision assistance through the decision plugin contract; Jev remains provider configuration. Disabling either plugin must preserve source skills, canonical config and memory, and retain a deterministic safe path for instruction retrieval.

This is a proposed boundary, not a completed extraction or a new implemented config interface.

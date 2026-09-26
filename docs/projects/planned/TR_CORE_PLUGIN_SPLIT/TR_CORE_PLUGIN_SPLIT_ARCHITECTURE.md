---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Architecture
description: Core boundary and plugin extension points for splitting Total Recall features.
timestamp: 2026-09-26T00:00:00Z
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

---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Development Plan
description: Phased order for extension points and feature moves.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, development-plan, total-recall, plugins]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# TR_CORE_PLUGIN_SPLIT — Development Plan

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

Starts after CAPABILITY_DEPLOYMENT_PLUGINS Phase 2B (schema config + generated CLI), which it reuses.

## Phase 0B — Repo-per-plugin infrastructure

Repos are `gregiteen/tr-plugin-<id>`, MIT licensed. Add `default-plugins.lock.json` and the lock-driven install on `init`/`upgrade` with an artifact cache, plus a plugin repo template (manifest, CI running the plugin specs against a pinned core, release workflow emitting a bundle and digest). Extract the five currently bundled plugins (`creative-search`, `dsh`, `git-sentinel`, `operator-alerts`, `system-monitor`) into their own repositories; Code Quality is already external.
**Done when:** a clean `init` installs the actual declared default set from its repositories by digest, and `plugins/` holds nothing they need.

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

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Dependency-ordered correction work

- [ ] **1 — Honest contracts and output:** PIC-009/PIC-010/PIC-013/PIC-015/PIC-016/PIC-017/PIC-018: fail on missing/invalid evidence, unify generator return type, verify runtime identity and preserve git columns. Add synthetic regressions before wiring runtime changes.
- [ ] **2 — Canonical configuration/state:** PIC-011/PIC-022: register owned SSSS extensions and route config/events through verified operations; connect actual CLI/UI settings and replayable projections.
- [ ] **3 — Functional plugin UI:** PIC-014: pass UI adapter validation and mount DSH/Search plugin-owned elements with actual data, controls, error and recovery behavior. Coordinate showcase removal of simulated previews.
- [ ] **4 — Real app lifecycle:** PIC-019: replace standalone shell with canonical scaffolder and independent runtime; operation-backed apply/grants; verify real feature execution, denied access, reapply, interrupted upgrade and tenant data preservation.
- [ ] **5 — Extract without behavior loss:** create individual repositories for the five actual bundled plugins, pin artifacts/digests in default lock, implement generic registration/unload, and remove bundled code from the published core only after independent clean-install proof.
- [ ] **6 — Verify and close:** run exact-tree full suite/conformance/gates on Mac mini as bounded background jobs; install from pinned artifacts in a clean brain; run real UI/CLI/independent app walkthroughs; retain hashes, commands and results. Live provider proof is separate from synthetic tests and HTTP reachability. No readiness checkbox closes without those records.

Scope stays Planned while prerequisites are unresolved. Code Quality runner extraction is historical progress, not completion of a UI/default-install contract. The five currently bundled integrations expand the extraction inventory beyond the old three-plugin list. No immediate migration work for hypothetical external users is a release dependency.

## Skill manager extraction dependency

1. Link CONTEXT_OPTIMIZATION's exact-source functional evidence before scheduling extraction (SPLIT-SKILL-001).
2. Refresh the dependency audit for skill registry, config, optimizer, scheduler and IDE adapters; identify minimal host interfaces and preserve CLI compatibility.
3. Define generic config schemas/defaults and repo-owned overlays using the existing layered configuration contract (SPLIT-SKILL-002). Verify public artifacts exclude private instances.
4. Extract into a standalone skill manager plugin repository through verified plugin interfaces. Integrate optional decision assistance through the existing decision capability (SPLIT-SKILL-003).
5. Prove independent clean install, upgrade, disable, offline fallback, scope/collision protection and rollback; retain exact-source remote gates and package evidence before removing capability code from core.

Extraction stays planned until the current implementation is confirmed working; this explicit user sequencing does not defer the active context optimization work.

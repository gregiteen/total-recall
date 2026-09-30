---
type: project_document
title: TR_CORE_PLUGIN_SPLIT — Project Tracker
description: Checklist for splitting standard Total Recall features into plugins, each in its own repository.
timestamp: 2026-09-30T16:30:00Z
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
- [/] Move bundled `code-quality`, `git-sentinel`, `system-monitor` to their own repos; remove them from `plugins/`. `code-quality` done 2026-09-26 (`gregiteen/tr-plugin-code-quality`, removed from `plugins/`); it is not yet in a default-plugin lock, so `init` does not install it (M)
- [ ] Remove `plugins/` from `package.json` `files` once empty (S)

## ⏳ Phase 0C: Project identity and groups (user direction 2026-09-28)

Goal: every project has a random-UUID id, projects can be grouped, and groups can contain groups. Core concept, exposed through the composable CLI.

- [x] `total-recall project-id` — random UUID per project, created once (global composable command, 2026-09-28) (S)
- [ ] Decide canonical location so every machine resolves the same id (brain config is gitignored in some repos) (S)
- [x] SSSS `project_group` document: `id` (random UUID), `name`, `members[]` (project ids **or** group ids), `description` (M) — global composable command `~/.agent/commands/group.mjs`, 2026-09-28
- [x] Cycle detection and depth limit on nested groups; a project may belong to several groups (S) — global composable command `~/.agent/commands/group.mjs`, 2026-09-28
- [x] `total-recall group create|add|remove|list|tree|members --recursive --json` (M) — global composable command `~/.agent/commands/group.mjs`, 2026-09-28
- [ ] Group-aware targeting: rules/skills fan-out, `secret` bindings (explicit group scope instead of one-repo-only where the user opts in), rotation (`rotation-due --group`), deploy/check commands (`--group <id>` resolves all member projects recursively) (L)
- [ ] Tests: nested membership resolution, cycle rejection, multi-group membership (M)

## ⏳ Phase 0D: `/start` — global skill + one per repo (user direction 2026-09-28)

Goal: every agent, in every repo, starts by knowing what it needs before it knows anything. One global `start` skill + the `total-recall brief` composable command (`start` is taken by the built-in server verb) answers the universal questions; each repo owns a **different** repo-scoped `start` skill for its own steps, grounded in its openwiki.

- [x] Global `start` skill (global brain skills) — the universal checklist and how to read the brief (M) — `~/.agent/skills/start`, registered globally, 2026-09-28
- [/] `total-recall brief [--mesh] [--json]` composed from: `project-id`, `group`, host permission mode, `mesh status/doctor`, `secret catalog/rotation-due/shared`, integration health probes (new), scheduled jobs + last run (new), `command list`, deploy-target safety check (new: key-name diff, includeGlobal), active trackers, local+UTC time and data freshness (L) — shipped as global command `brief` 2026-09-28: project-id, groups, commands, secret counts, tasks, mesh, trackers, openwiki freshness, domain (providers, integrations, launchd/cron, launchers). Open: `--group`, integration health probes, scheduled-job last run, deploy-target key diff, host permission mode
- [ ] Repo-scoped `start` skill in every repo with a brain (20 as of 2026-09-28; only moogie_crm has one): generated and verified from that repo's code, manifests and openwiki — its runtime, servers, logins, deploy path; calls `total-recall brief` first (L)
- [ ] Refactor moogie_crm `/start` (467 lines) into repo-specific steps on top of the global brief (M)
- [ ] openwiki plugin: listed in the plugin roster; `/start` and repo skills cite openwiki pages instead of duplicating them (M)

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

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../../in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Dependency-ordered correction work

- [ ] **1 — Honest contracts and output:** PIC-009/PIC-010/PIC-013/PIC-015/PIC-016/PIC-017/PIC-018: fail on missing/invalid evidence, unify generator return type, verify runtime identity and preserve git columns. Add synthetic regressions before wiring runtime changes.
- [ ] **2 — Canonical configuration/state:** PIC-011/PIC-022: register owned SSSS extensions and route config/events through verified operations; connect actual CLI/UI settings and replayable projections.
- [ ] **3 — Functional plugin UI:** PIC-014: pass UI adapter validation and mount DSH/Search plugin-owned elements with actual data, controls, error and recovery behavior. Coordinate showcase removal of simulated previews.
- [ ] **4 — Real app lifecycle:** PIC-019: replace standalone shell with canonical scaffolder and independent runtime; operation-backed apply/grants; verify real feature execution, denied access, reapply, interrupted upgrade and tenant data preservation.
- [ ] **5 — Extract without behavior loss:** create individual repositories for the five actual bundled plugins, pin artifacts/digests in default lock, implement generic registration/unload, and remove bundled code from the published core only after independent clean-install proof.
- [ ] **6 — Verify and close:** run exact-tree full suite/conformance/gates on Mac mini as bounded background jobs; install from pinned artifacts in a clean brain; run real UI/CLI/independent app walkthroughs; retain hashes, commands and results. Live provider proof is separate from synthetic tests and HTTP reachability. No readiness checkbox closes without those records.

Scope stays Planned while prerequisites are unresolved. Code Quality runner extraction is historical progress, not completion of a UI/default-install contract. The five currently bundled integrations expand the extraction inventory beyond the old three-plugin list. No immediate migration work for hypothetical external users is a release dependency.

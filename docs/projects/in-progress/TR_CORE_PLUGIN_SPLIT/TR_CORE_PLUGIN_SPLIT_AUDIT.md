# TR_CORE_PLUGIN_SPLIT — Audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Audit Status**: Complete
> **Audited commit**: 9b2e21f5ad2591e8d3c3c34ef97af94c13ee83ff
> **Date**: 2026-10-07
> **Author**: Codex

This audit supports project consolidation. It does not certify completion of the core extraction or the historical projects.

## 1. Scope and method

Greg requested one project replacing all open Total Recall projects, aligned to a memory core with every other feature supplied by a plugin. He also required checking code rather than accepting checked documentation. Read the 13 active trackers, the existing planned split project, central correction register, package manifest, plugin manifest schema, memory/startup paths, daemon, server routes/tools, plugin loader/context, app deployment implementation and installed plugin inventory. Preserve every historical task and Action Log in archived source projects; one active tracker controls priorities.

## 2. Inventory

The source register captures 14 project trackers, including the existing split plan, with 549 checklist entries, 254 open or in progress. Counts describe documents, not working features. `evidence/consolidation/source-items.json` retains original wording (with private display examples redacted), line numbers, original-text hashes, historical checkbox state, current disposition/reason and the canonical work owner for every item.

The 13 active projects were AGENT_SPAWN_TOOLS, CAPABILITY_DEPLOYMENT_PLUGINS, CLI_AGENT_SKILL_UPDATE, CLOUD_DAEMON_HANDOFF, CONTEXT_OPTIMIZATION, EXTENSION_OVERHAUL, OPERATOR_ALERTS_PLUGIN, PLUGIN_IMPLEMENTATION_CORRECTIONS, PLUGIN_P2P, PLUGIN_SHOWCASE_UI, SHARED_PROJECT_MANAGEMENT, SHARED_STARTUP_RUNTIME and SKILL_PROPAGATION_REPAIR. TR_CORE_PLUGIN_SPLIT was planned. All become historical records under `docs/projects/archived/consolidated-into-tr-core-plugin-split/`.

Current `package.json` version is 3.38.0. Its published `files` list excludes `plugins/`; no production `plugins/` directory exists in the tracked root. Test fixtures remain under `fixtures/bundled-plugins/`. The loader still supports bundled lookup, and installed records can retain historical `source: bundled`; those labels do not prove the current npm artifact bundles plugins. `default-plugins.lock.json` is absent.

## 3. Runtime surface

`src/server/rest.mjs` directly mounts research, sandbox, skills, network, tasks, collab, capture, scripts, TTS, notifications and other feature routers. `src/server/tools.mjs` contains built-in feature tools. `src/core/daemon-loop.mjs` directly handles research queue transitions, mesh enrollment, task execution and emergency alerts. These are concrete remaining extraction boundaries.

`metadata.plugin.schema.json` declares CLI, compile, tasks, schemas, deployment, secrets, skills, commands, app CLI and UI elements. It has no generic host route/tool/event-hook extension contract. `src/core/plugin-context.mjs` accepts a string generator result. A declared manifest or successful installed-plugin list is metadata evidence only.

## 4. Data and state

Memory remains canonical SSSS documents through validated operations. Indexes, embeddings and instruction surfaces are derived. Plugin configuration, events and product state belong to the plugin/app owner. `src/core/app-deploy/apply.mjs` still writes capability/grant records directly at the inspected call sites; extraction must replace that behavior with authorized operations. Preserve the intentionally separate MacBook and cloud brains. Consolidating project Markdown does not merge vaults or credentials.

## 5. Integrations

Installed inventory reports 14 project plugins, including linked standalone capabilities and historical bundled installs. This confirms discovery, not provider acceptance, independent runtime operation, or release status. External correction IDs PIC-030–049 remain owner-repository dependencies. Those repositories retain implementation ownership; this master tracks integration acceptance and priority without duplicating their code or modifying another repository.

The old plan proposed automatic installation of every moved feature. The new target is a usable memory-only core; optional plugins are selected explicitly, with existing installed state preserved during migration. Do not make memory startup depend on a feature provider, mesh, agent subscription or product dashboard.

## 6. Security and privacy

The repository is public. Cloud handoff docs were sanitized before commit, with private operational evidence retained separately. New documents use source paths and generic host roles, never secret values or personal mesh addresses. Plugin execution, secret access, routes and writes need explicit authorization and recorded provenance. Current review creation accepts `reviewer_node` and `verified_conformance` from request data; conformance defaults to true with `!== false`. Those source behaviors prevent trust claims.

## 7. Standing-rule conflicts

Historical plans disagree about mesh, daemon, secrets, UI and orchestration ownership. The current user direction governs: portable memory/vault/recall/instructions and the minimum safe plugin loading interfaces form core; feature behavior belongs to plugins. Generic auth/transport/secret-reference interfaces may remain only where demonstrated necessary for memory or plugin loading. Feature-specific scheduling, agent execution, provider rotation and deployment move to their owners.

Old checklist completion cannot override source or runtime evidence. Archived means consolidated/superseded, not completed. No remaining work is silently placed in a deferred backlog. Duplicate tasks are mapped to one canonical work item; superseded approaches are explicitly retired.

## 8. Quality baseline

The isolated Mac mini snapshot based on f33cf7e plus the working-tree overlay committed as 9b2e21f passed 373 Vitest files / 2,353 tests, exit 0. The final remote six-check gate passed dist freshness, public paths, shipped paths, scaffold state, SSSS registry and full tests with zero findings, exit 0, 209.8 seconds. Raw logs and the actual status files were read; the report stated fresh. Changed production modules and scaffold documents were hashed against the local committed files and matched.

Native isolated startup returned `/health` healthy, version 3.38.0; the owned process was stopped. The verified frontend build and package tarball were produced on the mini. Tarball SHA-256: `3fc723cc9d36d86a7456778b21f3240b1770931e28cdd8bef031f14fa66e8c08`. npm dry run succeeded; publication remains pending.

Fresh helper checks on the mini passed 20/20 after correcting a snapshot omission of the project-management hooks. The earlier 19/20 result was missing test-support files, not evidence of an implementation failure. The helpers prove their tested mechanics, not all installed agent/provider functionality.

## 9. Debt and dead code

`src/core/app-deploy/standalone.mjs` generates an entrypoint that reports `status: ready` while its gate checks file/directory presence. It does not prove an independent application runtime. `frontend/src/pages/PluginsPage.tsx` renders host-owned previews from a hardcoded registry. Review identity/default conformance remains unsafe. These features need an owner and acceptance check before being promoted as complete.

The old correction register repeatedly assigns PIC-001–023 to several projects. External PIC-030–049 and later PIC-050–053 add overlapping UI/runtime claims. Preserve their identifiers and source evidence in the archive, but schedule each correction once in the master register. Historical assertions about missing package files, route inventories, plugin counts and versions require rechecking against current source.

## 10. Deploy and operations

Cloud leadership is operationally verified with separate brains and a stopped MacBook worker. The cloud currently serves 3.37.0. Its sole-server `scripts/auto-pull.sh` uses stop/restart and fails the zero-downtime deployment requirement. Its one cron entry was backed up and paused before any push; other cron entries remain. Do not restore that unsafe deployment path or equate npm publication with cloud deployment.

No Git push, release tag or npm publication has happened during this consolidation. Existing release commit 9b2e21f is local. Release 3.38.0 is a bounded batch of existing fixes and this consolidation; it cannot claim that the entire split is delivered. Production rollout requires a staged healthy release, traffic switch, retained rollback and live selected-version proof.

## 11. Content and product fit

The public product describes verified memory and optional installed capabilities. Plugin-owned UI must show actual loading, unavailable, unconfigured, failure and recovery state. Retire fabricated ratings/counts/verified badges and simulated operational previews. A host may provide generic slots; capability interfaces and behavior belong to their plugins.

## 12. Findings register

| Finding | Severity | Verified evidence | Canonical owner / disposition |
| --- | --- | --- | --- |
| A-001 | P1 | Fourteen independent plans repeat priorities and completion claims | TR-001: consolidate now; preserve source records |
| A-002 | P1 | Core server/tools/daemon directly implement feature behavior | TR-004/TR-005: minimum consumer interface, then extract/reuse/remove by dependency |
| A-003 | P1 | No consumed generic routes/tools/event-hook contract in current manifest | TR-004: prove minimal extension consumers before extraction |
| A-004 | P1 | app-deploy direct records and placeholder readiness remain | TR-005: remove/delegate composer from core; external owner keeps real runtime correction |
| A-005 | P1 | Review request supplies identity/trust; conformance defaults true | TR-005: remove unsupported core trust surface; do not build a new review subsystem |
| A-006 | P1 | Host preview registry and product feature UI remain in core | TR-005: remove/delegate host product interfaces; reuse installed owner UI only if selected |
| A-007 | P1 | Production auto-pull stops sole server; timer currently held | TR-002: safe rollout before cloud source deployment |
| A-008 | P2 | Checked historic claims lack fresh runtime coverage | TR-003/TR-006: certify the reduced delivered scope; other claims remain historical |
| A-009 | P2 | Old bundled/default-install assumptions conflict with current package and memory-only goal | TR-004/TR-005: explicit selection, preserve current installs |
| A-010 | P2 | Context native acceptance and external plugin/provider proofs remain unresolved | TR-003: core's own acceptance; app/provider proofs remain external owner work |

## 13. Impact on the requested change

The consolidation edits documentation and ownership only. It replaces 14 competing plans with one active five-file project, six workstreams and an explicit value/disposition decision for every source item. It does not implement every extraction or turn historical checked boxes into new proof. Existing release code remains covered by the current Mac mini gate; documentation validation follows the consolidation.

## 14. Decisions

Use the existing prefix TR_CORE_PLUGIN_SPLIT. Archive all 13 active projects plus its previous planned five-file set as superseded records. Preserve original wording and logs, append explicit successor links, map every source checklist item, and update HANDOFF and project navigation. The master remains In Progress until its implementation acceptance is met. The consolidation request can finish while the resulting implementation project remains open.

Greg subsequently requested reducing size and scope using task value and alignment. Retire speculative product catalogs, host showcase/reviews, optional provider experiments, broad propagation and unrelated app rebuilds. Existing plugin owners retain their roadmaps; only selected migration interfaces/behavior block this core project. Implement the smallest real plugin migration, then extract reused features or remove unused source. Preserve memory/security/state/rollback requirements. Record retained, merged, retired and external-owner dispositions in the source register; do not carry 254 old pending boxes into the active plan.

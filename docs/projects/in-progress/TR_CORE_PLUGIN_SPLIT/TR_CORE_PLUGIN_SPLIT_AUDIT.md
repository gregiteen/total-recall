# TR_CORE_PLUGIN_SPLIT — Audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Audit Status**: Complete
> **Audited commit**: 9b2e21f5ad2591e8d3c3c34ef97af94c13ee83ff
> **Date**: 2026-10-07
> **Author**: Codex

This audit supports project consolidation. It does not certify completion of the core extraction or the historical projects.

## 1. Scope and method

### Functional plugin extension, 2026-10-07

Greg expanded delivery acceptance to every installed plugin: a separate repository, working purpose-specific UI, full supported integration features, complete configuration and encrypted credentials. The earlier selected-plugin proof certifies a host seam only.

Fourteen plugins are installed. Phone and Text resolve to separate repositories but their dashboard panels live in Total Recall. Phone fabricates connection with a timer and invokes a cleanup job for hangup. Text seeds a fake thread and connection badge, inserts messages before acceptance, and supplies positional arguments to a CLI requiring flags. Details & Config contains no settings or key fields. The authenticated host serves confined manifest-declared UI modules, but the dashboard does not load them.

Verified official references: [browser call API](https://team-telnyx.github.io/webrtc/classes/Call.html), [credential lifecycle](https://developers.telnyx.com/docs/voice/webrtc/auth/telephony-credentials/index), [scheduled messaging](https://developers.telnyx.com/docs/messaging/messages/schedule-message), and [inbound messages](https://developers.telnyx.com/docs/messaging/messages/receive-message). API keys stay on the server; credential JWTs authenticate the browser. Provider call events determine state. Message acceptance does not prove delivery. Reuse owner adapters for call creation/hangup, number search/orders, SMS/MMS, message retrieval and signatures; inventory additional documented features explicitly.

Mac mini baseline `1de702c` passed six gates, 373 files / 2,353 tests. Later memory proofs passed 59 schema tests, 48 host/auth/identity tests, locked registry validation, expanded native lifecycle and package inventory checks. None certify plugin UI functionality. Owner repositories have pre-existing dirty work that must be preserved.

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

### Implementation refresh: memory routes, 2026-10-07

The exact 1de702c Mac mini gate completed with actual exit 0 and all six checks passing in 213.9 seconds. This is a baseline, not completion evidence for later changes. Source inspection found `memory.mjs` PUT writes to `vaultDir` but then references undefined `targetVaultDir`, producing a 500 after persistence. `_shared.mjs` defaults unknown selected brains to the global vault, including memory writes. TR-003 repairs both and verifies selected-brain failure without persistence. Existing instructions/context already request strict resolution. Publication follows retained implementation and final verification.

`plugin-context.mjs` formats scientific benchmarks/research/project fields in the host, runs generators even for invalid manifests, falls back to project-root files and reads one shared derived context for multiple plugins. The generic host should render declared memory text and load only valid, confined plugin-owned generators/context. `bin/total-recall.mjs` imports handlers in-process despite an existing isolated runner used by the API/tasks; reuse that runner for consistent confinement/failure handling. This does not sandbox trusted local plugin code or grant it new OS isolation.

Use the existing prefix TR_CORE_PLUGIN_SPLIT. Archive all 13 active projects plus its previous planned five-file set as superseded records. Preserve original wording and logs, append explicit successor links, map every source checklist item, and update HANDOFF and project navigation. The master remains In Progress until its implementation acceptance is met. The consolidation request can finish while the resulting implementation project remains open.

Greg subsequently requested reducing size and scope using task value and alignment. Retire speculative product catalogs, host showcase/reviews, optional provider experiments, broad propagation and unrelated app rebuilds. Existing plugin owners retain their roadmaps; only selected migration interfaces/behavior block this core project. Implement the smallest real plugin migration, then extract reused features or remove unused source. Preserve memory/security/state/rollback requirements. Record retained, merged, retired and external-owner dispositions in the source register; do not carry 254 old pending boxes into the active plan.

### Implementation refresh: default init and installed consumers

The old init directly seeds onboarding work, copies every scaffold/global skill, provisions product surfaces and reads/copies credential stores. It is unsuitable as a portable-memory bootstrap. Existing writeBrainIdentity/registerProjectBrain primitives can initialize an empty brain without those feature side effects. The CLI agent-dir pins all explicit layer operations to AGENT_DIR; core config previously rejected its project layer. Align the explicit-root contract and test independent project/global selection.

Following installed symlinks found seven plugin package dependencies on total-recall-brain; Signing directly imports the optional src/core/secrets-store.mjs resolver, and Code Quality supports TR_PACKAGE_ROOT. Preserve these consumed exports. The user-automations link targets the removed in-repository plugins directory and is currently unavailable; preserve its installation/state until its existing owner artifact is recovered. This is a discovery failure, not proof of a functioning automation.

### Implementation refresh: canonical mutation side effects

Remember appends a raw legacy rule sheet before validating and automatically archives similar/title-matching nodes through raw file writes. Edit and both forget paths detach compilation. Forget uses raw deleteNode or raw .trash renames; HTTP DELETE unlinks a searched file. HTTP mutation triggers automatic conflict resolution and session embedding builds. These bypass the portable memory boundary and can leave indexes stale or mutate other records. Reuse the existing SSSS delete/write/event operations, preserve explicitly archived project records, remove implicit optimization and await local CLI projections.

## Release/status audit — 2026-10-07

Registry latest is 3.37.0; local source is 3.38.0. The draft memory-only whitelist excludes the dashboard, update CLI and plugin creation scaffold. Publishing that draft as an ordinary 3.x update would remove existing public commands and interfaces. Resolve the release compatibility boundary before publication. The update route aggregates older consumers into the host flag, causing a preview host to show an upgrade prompt. The comparator ignores prerelease precedence and build metadata. Official npm semantic-versioning guidance requires a major version for incompatible changes (https://docs.npmjs.com/about-semantic-versioning/). An exact current-tree Mac mini baseline is running in an isolated snapshot; prior baseline remains recorded above.

## Added card generation request — 2026-10-08

Greg requests dynamically model-written plugin card faces that maximize spatial efficiency and expose live credentials, accounts, actions, analytics and notifications. Source audit: PluginsPage currently repeats metadata, capabilities and toolbars on the card; PluginPanel loads owner custom elements only in the detail view and supplies a run bridge. PluginSettings separately exposes write-only credentials and declared configuration. The installed Design manifest exposes status only and declares no UI element; it does not currently certify a working card-code generation service. New generator implementation and live data contracts remain unverified. The compatible 3.39.0 release candidate passed seven exact-source gates and 2,391 tests across 380 files, plus native source/installed memory health and npm dry run. No tag, push or publication has occurred.

## Pre-launch security audit — 2026-10-07 Denver

Baseline: prior source-exact mini gate passed 380 files/2,391 tests; new security audit runs before publication. Confirmed blockers: password change requires authentication but no write scope; plugin UI modules import into the dashboard origin and can reach its DOM/storage/authenticated fetch; gray-matter accepts executable JavaScript frontmatter on untrusted Markdown; production npm audit reports proxy-addr critical advisory and the unpatched sprintf-js dependency chain. Validate password authorization with real middleware, isolate UI in an opaque-origin scripts-only frame with network-blocking CSP and a source-bound declared-command bridge, disable executable frontmatter at every owned parser entry, and replace affected dependency resolution. Sources: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe ; https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage ; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy ; https://github.com/advisories/GHSA-jqcg-44mw-7w3h ; https://github.com/advisories/GHSA-hp3w-g68c-fv3c . UI isolation does not convert installed native plugins into an OS sandbox: trusted installed code still has same-user filesystem authority. Generated runtime code must not be executed as a native plugin automatically.

Additional auth audit: /auth/login is outside the /api rate limiter; the quarantine threshold is 9,999 failures, so it does not bound bcrypt work. First-run local setup accepts browser-origin requests without validating Origin, permitting hostile cross-origin/DNS-rebinding claim attempts. Add a dedicated auth limiter and a loopback/explicitly allowed Origin check to first-run setup; validate password input types/size. requireHttps also trusted x-forwarded-proto directly from any socket; remove that fallback and use Express trusted-proxy-derived req.secure.

The all-dependency audit additionally reports 11 development findings (8 high, 3 moderate). The unpatched braces chain arrives through the direct development-only openwiki package; source/scripts contain no imports/requires of that package, and production npm audit already excludes it. Remove that unused development dependency and update compatible test/build dependency resolutions. Full-suite attempt rc 2 exposed two missing better-sqlite3 bindings after npm ci --ignore-scripts; rebuild the required native dependency on the mini before final tests. Browser attack fixture initially skipped onboarding and then lacked the runner ok field; corrected fixture proves all isolation assertions, actual UI command operation and draft preservation.

## Verified pre-launch security candidate — 2026-10-08 UTC

The current candidate security checks pass for exact source `72abfdd410ebdc9fae6bda227a8fd05745e415b988b24331979cc43c10d56207`: nine gates, 383 test files and 2,405 tests, native source/installed health, clean consumer dependency audit and 43 installed lifecycle operations. Both lockfiles have zero reported advisories. Publishing dry run passes; all 579 package files match between test/publishing hosts, with zero credential-pattern/private-credential-path matches. Initialization preserves existing and concurrent credentials. Test-host configuration was restored byte-exact from the pre-incident snapshot, canonical memory preserved, owned additions quarantined, local indexes rebuilt with zero drift and snapshot unmounted. SSH cannot unlock the restored store, so live decryption remains unverified. Detailed evidence: [security audit](evidence/release-3.39.0/security-audit.md). Model-generated card faces remain unimplemented and unaudited; the project stays In Progress. No publication or live runtime upgrade.

## Additional blocker: compatibility init isolation — 2026-10-08 UTC

The incorrectly selected native fixture reached the test host global brain at 02:17 UTC. Compatibility init now honors the shared explicit-root resolver; legacy-store restoration refuses existing stores and atomically preserves concurrent writers. Every native lifecycle fixture also pins HOME. Configuration was restored byte-exact from the read-only 01:43 Time Machine snapshot after a same-host protected backup. No credential mutations were recorded between snapshot and incident. Removed/quarantined 16 owned new files, 47 unchanged scaffold skill files and 12 owned IDE links; four scaffold vault records pre-existed unchanged. CLI rebuild processed 60 canonical nodes with zero drift; embeddings preserved. Snapshot unmounted. SSH could not unlock the store; decryption is not certified. Nine focused initialization/credential tests pass. Final source-exact nine gates pass: 383 files and 2,405 tests; native artifact/lifecycle/dependency proofs pass.

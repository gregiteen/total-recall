# TR_CORE_PLUGIN_SPLIT — Audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Audit Status**: Complete
> **Audited commit**: 9b2e21f5ad2591e8d3c3c34ef97af94c13ee83ff
> **Date**: 2026-10-07
> **Author**: Codex

This audit supports project consolidation. It does not certify completion of the core extraction or the historical projects.

## 1. Scope and method

### Deployment optimization extension, 2026-10-13

Greg requested `deploy optimize` to inspect runtime performance, extra processes and cached files. Source audit: `tr-plugin-deploy/cli.mjs` has no optimization operation; `src/deploy-engine.mjs` requires execution receipts for release changes but writes local legacy state; `ui/panel.js` still fabricates v1.0.0/ports and alerts that an unsaved credential was saved. Existing owner changes must be preserved. No scheduled optimization or production mutation is authorized by this feature request.

Current official research: [Docker pruning](https://docs.docker.com/engine/manage-resources/pruning/) includes stopped resources and build caches, so blanket prune cannot establish deployment ownership; [Node filesystem API](https://nodejs.org/api/fs.html) supplies lstat/realpath/statfs for bounded observation and symlink rejection. Systemd documentation returned HTTP 403; no systemd integration contract is assumed. The first implementation measures OS memory/load, process CPU/RSS, filesystem space, endpoint response time and a dedicated disposable cache. It reports unknown processes for review rather than treating unfamiliar processes as unused. Cache cleanup requires an exact reviewed digest, unchanged file identity, explicit deployment root, and health verification; serving/rollback directories, volumes, databases, credentials and OS page caches are excluded. No persistent optimizer state is introduced.

Findings: DEP-OPT-001 (P2, missing optimization operation, fix); DEP-OPT-002 (P1, fabricated panel state/credential save, fix); DEP-OPT-003 (P2, legacy deployment-state persistence, remains part of existing SSSS migration scope). Baseline: pending exact-source sanctioned-node owner suite before implementation. Tests must cover drift, symlinks, protected files, age limits, real local inspection, remote transport failures and truthful UI. Production performance and provider acceptance remain separate evidence.

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

## Mesh ownership repair audit — 2026-10-10

Scope: working tree based on f3a8b3f98c4b5219e4da491053b70a96ae9be762 plus existing uncommitted changes; linked mesh owner repository. Full CLI, mesh/activity/auth/access/enrollment/client modules and presence routes inspected; other consumers inventoried by imports. Baseline on isolated Mac mini snapshot /tmp/tr-mesh-repair-20261010: 4 suites / 34 tests pass, plugin 2 tests pass; both actual exits 0. No clean-commit or live-production certification.

| ID | Severity | Evidence | Impact and disposition |
| --- | --- | --- | --- |
| A-901 | P1-high | bin/total-recall.mjs COMMANDS/CORE_BUILTINS and src/cli/mesh.mjs | Core owns competing mesh command/status; move full implementation to plugin, retain only generic host loading contracts. |
| A-902 | P1-high | src/core/mesh*.mjs, headscale-client.mjs, leader-election.mjs; src/server/routes/mesh*.mjs, headscale.mjs | Runtime/API ownership in core; extract to plugin and load declared modules/routes generically. |
| A-903 | P1-high | linked mesh ui/card.js fixed peers; cli.mjs verifyToken stub | False topology and unusable credential setup; bind live observations and verify authenticated API before save. |
| A-904 | P1-high | src/server/routes/mesh-presence.mjs dispatch uses [local], returns dispatched:true without delivery | Query fresh authenticated peer presence; report actual delivery/command outcome. |

State: preserve existing SSSS node/event identities and vault roots; never copy brains. Credentials use existing encrypted store contract. Mesh control API uses bearer auth over HTTPS, read-only /api/v1/user verification, redirect rejection; official contract https://headscale.net/stable/ref/api/ inspected 2026-10-10. Generic plugin loading validates relative paths and installed manifests. Plugin absence must not run built-in mesh behavior. No deployment requested; changes remain local until verified. Existing unrelated working-tree changes preserved.

### Auth ownership audit — 2026-10-10

29 valid installed manifests declare auth; declarations do not enforce credential ownership. CLI `secret` aliases currently reach installed auth, but still fall back to core when auth is absent. Direct core credential imports exist in mesh, image-generator, phone, text, signing, and skill-manager. Environment credential paths exist in decision, deploy, design, domains, maps, phone-companion, security, signing, stripe, tickets, translator and auth. CRM and operator-alerts use the CLI alias. Generic credential UI requests `/api/plugins/auth/secrets`, which has no mounted implementation in current source; core still owns `/api/secrets`. Tickets has a constant signing-secret default. Remaining plugins have no matched credential resolver; composable-cli declares a token without an observed consumer. No live provider credentials were revealed or rotated.

Auth baseline: sanctioned Mac mini `/tmp/tr-mesh-repair-20261010/auth`, `node --test test/auth.test.mjs`, 10 tests passed, actual exit 0. First baseline command used a deleted filename and failed; corrected against actual test inventory. Auth extracted CLI contains missing `../core/` imports and duplicate portable host and mesh implementations. Core config silently catches secret read errors and combines multiple stores. Required outcome: one auth owner, explicit selected store, failures propagated, shipped scaffold artifact, no secret implementation or fallback in core.


### Security machines and network

Security plugin expansion (2026-10-10): source inspection confirms fabricated probe HTTP 200/11ms, blanket secured status, generated headers counted as applied, manifest edits presented as runtime enforcement, ambient credential reads and shared signing/encryption defaults. No machine/firewall/SSH/listener collection exists. Mac mini baseline security suite exited 1: installed-plugin assumptions fail in isolated snapshot; retain the raw security-baseline.log. Official contracts reviewed: OpenSSH sshd_config effective settings (sshd -T), Ubuntu firewall administration, Apple malware protection. Missing privilege or tools must yield unavailable coverage, not pass. Network bind addresses alone do not prove Internet reachability.


### Windows and mobile platform coverage

Platform coverage extension (2026-10-10): user identified omitted Windows, Chromebook/ChromeOS, iPhone/iPad and Android. Current security collector accepts only darwin/linux; baseline full owner suite passes 20/20 on the sanctioned node, actual exit 0. Phone-companion has no posture-query contract; its claimed ready/active status does not establish phone protection. Official Microsoft Defender/NetSecurity/BitLocker/SecureBoot cmdlets reviewed, including ActiveStore firewall semantics and privilege failures. Google update-schedule/Android patch and Play Protect procedures, Android verified-boot documentation and Apple mobile protection guidance reviewed. ChromeOS Linux-container checks cannot certify the host. Mobile sandbox/management limitations require explicit guided evidence; no invented enrollment, native APIs or successful scans. Windows fixture verification will not constitute physical Windows certification.


2026-10-10T07:39:00Z — Codex: Implemented Windows fixed read-only posture queries, allowlisted Android property reads on existing authorized ADB sessions, and distinct iPhone/iPad/Android/ChromeOS/Flex/Windows guides. Mobile companion provides no verified posture API. Native Windows/Android hardware execution remains unverified; Mac mini fixtures cannot certify it. First expanded run passed 25/26: CLI fixture incorrectly invoked an exported plugin handler as a standalone script, yielding no command. Corrected fixture to exercise the real exported CLI dispatch; second run passed 26/26, exit 0. No live security policy changed.


2026-10-10T07:40:00Z — Codex: final cross-platform security suite passed 26/26 on sanctioned Mac mini, actual exit 0; matching local/tested-source SHA-256 eb6918b76c58d7e3dd2cc9c1e427e85d0cf175d5ecab7c1befc8693acb0c6c02 (CLI, manifests, README, src, tests, UI, skills, scripts). Actual installed CLI platforms returned eight supported modes, exit 0; initial iPhone review returned nine unverified checks, automatic:0, complete:false and exit 1. Final tests cover Windows/Android fixtures, authorization, evidence spoofing/redaction/staleness, mobile fleet missing coverage and UI manual answer/reset semantics. Raw logs retained under evidence/security-plugin. No native Windows/Android hardware verification, management connection, live settings mutation, release or deployment; wider split remains in progress.


2026-10-10T17:48:38.043211+00:00 — Codex: Resumed auth split audit: core server/auth.mjs still generates plaintext session-secret, accepts runtime credential configuration, implements dashboard password hashing and writes security.yml plus swallowed encrypted-backup failures. OAuth routes accept ambient credentials and swallow store errors; collaboration route generates a second JWT file and accepts environment JWT_SECRET. Auth baseline fails before owner Vitest phase because CLI tests read an unisolated locked store and still expect ambient Google credentials. Official jsonwebtoken contract reviewed (algorithm allowlist and numeric expiry). No live credentials/settings have been modified.

### Auth continuation findings, 2026-10-10

- Uninstall attempted JSON parsing of encrypted bytes, swallowed failure, and could preserve a plaintext hash before deleting the brain. Replaced by owner-only authenticated ciphertext preservation before teardown; conflicts and legacy data abort.
- Init/config/deploy/reset flows still handled YAML password hashes. Password mutation now delegates to auth; config credential paths and object-parent reads are rejected. Legacy data requires explicit owner migration, never automatic overwrite.
- Session and collaboration keys had core/env/file sources. Auth now signs/verifies with encrypted selected-store keys, distinct audiences and collaboration key, algorithm allowlist, issuer and bounded expiry; no raw session key exported through core config.
- API-key lifecycle and public passkey persistence moved into owner source; core keeps required-plugin adapters. Dashboard OAuth/passkey routes likewise moved to owner factories.
- Auth card falsely advertised hardware readiness and animated scanning; panel stopped registration after options and claimed rotation scheduling. Removed simulations and schedule claim; browser creation plus verified server response now required.
- Bootstrap baseline exposed missing copied-plugin dependencies; compatible declared host package wiring added. Initial YAML minimum mismatch correctly rejected and aligned with supported host ^2.9.0 contract.
- Official contracts consulted: jsonwebtoken algorithm/audience/issuer/expiry, Vitest external dependencies, SimpleWebAuthn browser three-step registration, MDN PublicKeyCredential creation JSON/toJSON. Fixtures do not certify live provider or authenticator behavior.


2026-10-10T18:26:25.985393+00:00 — Codex: Additional observed blockers: owner host adapters resolved an independently installed stale host package; now auth requires explicit current TR_PACKAGE_ROOT. Local installation eagerly loaded mesh via peer distribution/search and cron parsing; routing is now lazy for peer operations, with pure cron authoring separate. API inventory silently skipped import failures and omitted plugin routers; now inventories actual mounted stack and propagates failures. Deliberate POST /api/plugins/:id/credentials added to regenerated 254-route manifest. All-plugin audit still identifies ambient credential consumers and ticket signing default; these are unresolved acceptance blockers, not certified by passing core tests.


2026-10-10T18:35:44.132567+00:00 — Codex: Full core suite now passes 336 files / 2,025 tests, actual exit 0 (core-full-auth-verified.log). Auth owner passes 11 Node + 154 Vitest tests, actual exit 0; strengthened global-store isolation fixture still needs final rerun. Fast gates prior to final auth CLI source update passed all eight. Auth secret get no longer selects a second store, honors TR_SECRETS_BRAIN, and supports structured found/value JSON for internal consumers. Continued all-plugin bypass remediation across service owners, with auth-only client transport tests. Initial owner runs expose stale environment/fake-result assertions and missing snapshot dependency/runtime files; repairing both. Maps generated results and Maps/Stripe fabricated probes confirmed and removed in edited source. No all-plugin clean result, release or deployment claimed.


2026-10-10T18:38:09.122266+00:00 — Codex: Security scanner strengthened to report dynamic credential environment access and uninspected linked source, without matched contents. Added negative fixture. Service owner tests now use explicit auth fixtures rather than ambient credentials; Phone/Text and Signing tests reject removed fallbacks. Maps/Stripe denial probes covered. Owner snapshot initially omitted Phone runtime package and Skill Manager root specs, and lacked SSSS package; repairing selected source/dependency snapshot without copying any brain/vault. All changes remain unshipped; final owner/security reruns pending.


2026-10-10T18:50Z — Continuation audit: Doctor still reports ambient embedding keys as configured; replace with selected auth projection and explicit read failure. Mesh host forwarders still select independently installed core. Deploy engine invents connected providers, initial version, health 200 and traffic switching; these are confirmed defects, not live deployment evidence. All 15 service owner verified exit files are zero; latest auth/core boundary edits still require fresh full reruns.

Deployment contract research: Node fetch exposes response status/ok and AbortSignal timeout (https://nodejs.org/api/globals.html#fetch); nginx reload validates configuration and gracefully replaces workers (https://nginx.org/en/docs/control.html). A JSON state change cannot prove proxy reload. Repair acceptance: empty initial discovery, fail closed on missing execution adapter, require adapter receipts and matching release health before switching, reject corrupt/old unverified records, render unknown status instead of invented telemetry. No configured live adapter or deployment authorization is present.

All 29 installed plugin manifests declare auth. Redacted source scan correctly reports review findings, not all-plugin success: confirmed Operator Alerts ambient dynamic key lookup plus legacy raw secret command/error-to-missing fallback. Other findings include explicit auth store selection, user input validation, checker environment interpolation and isolated CRM walkthrough credentials; these need classification rather than blanket passing. Repair Alerts using the same strict structured auth transport and prove failures without sending messages.


2026-10-10T18:59:01.594783+00:00 — Codex continuation verification: full current core 336 files / 2,025 tests passed, actual exit 0 (core-auth-final2). Auth 11 Node + 156 Vitest tests passed, exit 0; eight fast gates passed, exit 0. All 15 earlier service-owner suites passed, exit 0; later Alerts auth cutover passes 10 tests, exit 0. Mesh selected-host runtime suite passes 25 files / 249 tests, exit 0; manifest/host rejection checks pass 3 tests, exit 0. Security expanded-language scanner passes 28 tests, exit 0. Deploy execution/health/UI contract passes 10 tests, actual exit 0. No live provider, credential, machine setting, deployment or release changed.

All 29 installed manifests declare auth, but the source audit returns exit 1, not all-plugin certification. Expanded Python/shell coverage confirms unresolved CRM local_config.py, session/hash, google_auth.py and cli_client/crm_client.py credential storage. User/operator secret transport has since moved to auth; other paths remain active migration work. These are active required repairs. Regex review also flags authorized auth unlock/store selection and nonsecret checker interpolation; findings require source classification. Source tests cannot certify live hardware, providers, operational deployment adapters or comprehensive UI acceptance.

CRM credential transport repair research: Python subprocess.run waits for child completion, supports stdin, timeout and explicit return codes (https://docs.python.org/3/library/subprocess.html#subprocess.run). Current user_secrets.py instead treats metadata appearance as a successful write, keeps stale listings after failure and substitutes an in-memory store via CRM_SECRETS_ISOLATED. Replace it with one selected auth command and structured get, exact readback, scoped keys, no detached process or cached/in-memory substitute. Add isolated Python negative tests before claiming this path repaired. Other local_config/OAuth/client storage remains active migration work.


2026-10-10T23:58:50.683704+00:00 — Codex: CRM local_config.py stores API keys/passwords in plaintext, treats corrupt config as empty, auto-imports ambient credentials, generates session/password credentials, and exports secrets through P2P sync. Baseline: 12 isolated transport/operator tests pass on sanctioned mini; whole CRM uncertified. Official Python JSON docs specify malformed input raises JSONDecodeError (https://docs.python.org/3/library/json.html). Google OAuth best practices require secure client/token storage (https://developers.google.com/identity/protocols/oauth2/resources/best-practices). Next repair: auth-backed local settings and explicit verified migration. OAuth token, session/hash and client paths remain required work.


2026-10-11T00:04:35.943935+00:00 — Codex: Auth-backed local settings and OAuth client credential boundary implemented. 29 isolated Python tests + one Node/Python/auth-port test pass, actual exit 0. Token files, vault session/hash and standalone CLI files remain unverified required repairs; all-plugin audit is not clean.


2026-10-11T00:05:46.779874+00:00 — Codex found CRM remote-check.sh copies the whole owner checkout with insufficient exclusions: local_config/OAuth credential files and .env are not excluded. It has not been invoked in this work. Repair source-only transfer before use; never copy live vault/private credentials to test host.


2026-10-11T00:09:04.778444+00:00 — Codex verification: final native CRM auth/settings scope passes 29 Python tests, exit 0; CLI migration and real source-transfer archive tests pass 2 Node tests, exit 0. SHA256 identity matches all 18 selected files across native and CLI snapshots. Five-file project audit passes, exit 0. Refreshed 29-plugin source audit still exits 1; no clean ecosystem claim. OpenWiki ingestion imported 6 hubs, errors 0, exit 0; CRM retrieval is being checked. Native suites used isolated fixture ports, not live credentials, accounts, services or settings.


2026-10-11T00:11:17.381710+00:00 — Refreshed scanner covers 29 installed owners, all 29 auth-declared, exit 1. CRM has 30 source review findings. Additional confirmed runtime bypasses: cli_api.py:180 reads ambient CRM/DABBER keys before auth_headers and may ensure a local daemon; crm_service.py:6401/6561/7119 prioritizes ambient Maps credentials; cron_service.py:452/456 uses ambient email/phone keys; market_collector.py:1021/1026/1031 falls through to ambient team tokens. These are active required runtime repairs, alongside OAuth token files/session hashes/client storage. Review-rule matches are not automatically proven vulnerabilities.


2026-10-11T00:13:26.919269+00:00 — Codex closed generated API transport ambient CRM/DABBER key bypass and local-daemon startup side effect. Expanded focused suite passes 31 tests, actual exit 0. Initial new test run had two harness errors because extracted function annotations omitted the original deferred-annotation flag; harness corrected and rerun passes. Full CRM runtime/OAuth tokens/session hashes/standalone client/provider paths remain required work. Source identity now includes 19 files; refresh audit after this repair.

## Addendum — plugin ecosystem, bricks and monetization (2026-10-11, Claude)
Evidence read from source and the local installs; plugin test suites were not run for this addendum.

| Finding | Evidence |
| --- | --- |
| Only `auth` ships in the package. `listBundledPlugins` reads `PACKAGE_ROOT/plugins` (absent) and the local brain's `plugins`, so the other 29 appear "bundled" only on machines where they are installed. | `package.json` `files`; `scaffold/.agent/skills/total-recall/plugins` contains `auth` only |
| 30 `tr-plugin-*` repositories exist. All have uncommitted changes except `crm`; `auth`, `deploy` and `phone-companion` have no git remote. | `git status`, `git remote` per repo |
| Maturity (by version and test-file count, not by running): `auth` 1.0.0/25, `mesh` 0.2.0/27, `crm` 0.1.0/41 are furthest; `stripe`, `maps`, `tickets`, `translator`, `deploy` are 0.1.0 with 2–3 test files. | plugin manifests, file counts |
| There is no project-creation command. `init --project` creates a project brain and registers it; it scaffolds no application, no plugins and no SSSS project files. | `total-recall init --help` |
| `plugin vendor` and `plugin bricks` (branch `feat/plugin-vendor`) add a plugin to a project as a self-owned copy, recorded in `tr-bricks.json`. | commit `6e6850a`, spec 12/12 green on the Mac mini |
| A monetization contract exists: models `free, one-time, subscription, metered, take-rate`, price, period, take rate, recipient (`stripe_account`, `crypto_address`, `mesh_identity`), `license_key_secret`, `checkout_url`. | `metadata.plugin.schema.json`, `plugin-loader.mjs:295–318` |
| Enforcement is absent. `plugin license verify` stores a key and then reports "provider verification is unavailable". Nothing checks a license before running a plugin. | `src/cli/plugin/monetization.mjs` |
| The "store" is a local flag. `deployPluginToStore` sets `shared`, `public_shared`, `store_deployed` and `locked` on a record; there is no listing service, publisher identity, review, payment or payout. | `plugin-distribution.mjs:82` |
| Source code that runs on a user's machine cannot be protected by a license check. Closed, monetizable capability must keep its value on a server the operator controls. | design finding |
| Plugin names in manifests embed brands (for example Kinship CRM, Holy MX, Waymark Maps), and some capabilities are built around one operator's infrastructure (`domains` and a specific mail server). | manifests |

## Addendum — plugin cards (2026-10-11, Claude)
| Finding | Evidence |
| --- | --- |
| Card faces are 130–400 line hand-written custom elements per plugin with decorative animation (for example a canvas "ledger wave" in the payments card). | `tr-plugin-*/ui/card.js` line counts; `tr-plugin-stripe/ui/card.js` |
| Manifests carry fabricated status: `card_face.metrics` hard-codes values such as `CHECKOUT READY`, `WEBHOOK ACTIVE`, `PROBE 200 OK` regardless of real state. This contradicts the no-fabricated-data acceptance. | `tr-plugin-stripe/plugin.json` `card_face.metrics` |
| `cli.subcommands` have only `name` and `description`; no argument, effect (read/write/destructive) or output metadata exists, so a UI cannot render real forms or warn before dangerous actions. | `tr-plugin-stripe/plugin.json` `cli` |
| The host already renders a generic settings form from `configuration.fields` and write-only credential inputs from declared secrets (`PluginSettings.tsx`, `/api/plugins/:id/configuration`). Only two manifests declare `configuration` fields in the checked set (auth, crm, phone seen); most declare none. | `PluginSettings.tsx`; `grep configuration plugin.json` |
| The sandboxed card bridge exposes only `host.run(subcommand, args)` for declared commands. It has no stdin channel, so a card cannot set a secret without putting it in argv, which is forbidden. | `plugin-frame.ts` |
| The frame hard-codes plugin-specific tags and events (`domains-console`, `stripe-panel`, `select-domain`, `set-record`), against the stated rule that core contains no plugin-specific code. | `plugin-frame.ts` |


## Full plugin completion — 2026-10-12

Shared bridge source audit (2026-10-12): plugin-frame.ts permits any command when the declared command set is empty and contains provider-specific event handlers. plugin-runner.mjs supports inherited/ignored stdin only; the run route has no secret-input contract. Card contract infers mixed config groups as read operations. Workspace source contains phone-specific host logic. Focused before-change Mac mini baseline passes 48 tests/5 files, actual exit 0, after adding missing bundled auth source to isolated snapshot; original missing-auth failure retained. Official browser contracts reviewed: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage and https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia . Opaque frame isolation must remain intact; enabling microphone alone cannot provide a safe audio workspace.


2026-10-12T07:11:15Z — Codex: Runtime-path inspection found PluginsPage still mounts the older PluginCardFace, so the shared CardEngine is test-only. Wire the installed grid to the configuration/observation engine and verify the page behavior; retain owner Live panels through declared regions and preview. Source manifest inventory records 30 plugins/241 commands, only six explicit effects. The default face must stay honest about missing contract declarations. Full core suite is running on the isolated mini source snapshot; no serving source changed.

2026-10-12T07:20:59Z — Codex: Full mini run reports 2064 passed / 2 failed (actual rc 1), both model-catalog discovery/alias assertions. Both model routers ignore the explicit TR_ROOT fixture; align the configured root. Frontend build rc 0. Source identity exposed ignored scaffold derived/embeddings.db; preserve it outside the scaffold, classify legacy derived state canonically, synchronize the shipped manifest and add a rejecting regression before delivery. Whole project remains In Progress.

2026-10-12T07:24:48.187050+00:00 — Codex: Catalog regressions now pass; full3 reports 2065 pass/1 fail because the isolated snapshot retained an empty legacy derived directory. New guard correctly rejects it. Remove that empty test-copy directory, then rerun. Eight fast gates ran, scaffold gate correctly failed (checker rc 2); preserve raw report. Additional card audit: gauge invents zero/100 when observations are missing, Usage implies unavailable agent history, and modal lacks focus containment. Correct these shared UI behaviors and test missing-data, keyboard trapping and focus restoration. OpenWiki ingestion completed: 6 imported/0 errors, actual rc 0; retrieval includes the updated plugin hub.

2026-10-12T07:26:34.591438+00:00 — Codex: Brick source review found vendor destination containment checks lexical paths only, allowing an in-project symlink parent to write outside the project. Resolve the nearest existing parent against the real project root before mutation; add a regression proving the external directory stays untouched. Existing vendor functionality is present in the working tree; requires/new and standalone-consumer acceptance remain incomplete.

2026-10-12T07:30:05.594130+00:00 — Codex: Phone owner-source audit found the extracted CliPhoneDataSource expects an obsolete exit/output envelope while the generic bridge returns parsed data, invents host/extension SIP credentials, and hides contact lookup failures. Current browserSession returns a login token, which is not an Asterisk SIP credential. Official browser SDK reference https://developers.telnyx.com/docs/development/webrtc/js-sdk/tutorials/make-your-first-call requires authenticated readiness and actual call state events. Add native owner regressions, verify failure on the mini, then correct adapter transport and reject unsupported sessions explicitly; this does not certify audio or finish the operated Hello Phone product.

2026-10-12T07:31:54.303102+00:00 — Codex: Phone adapter native regression baseline failed 4/4 (rc 1); after repair all four pass (rc 0) on the mini. CliPhoneDataSource now consumes decoded host responses, preserves actual explicit credentials, rejects token-only/incomplete browser sessions without fabricated defaults, and propagates lookup failures. Owner test added. This fixes the extracted adapter boundary only; current provider-token session still needs a compatible real dialer transport, and live audio remains unverified. Full4 core passed 340 files/2068 tests, build/type rc 0 and eight fast gates passed; expanded lint found one new render-time ref error (rc 1), repaired before full5. Nineteen existing lint warnings remain in expanded scope.

2026-10-12T07:32:50.289576+00:00 — Codex: Final full5 passes 340 files/2069 tests, actual rc 0; frontend build5 rc 0; all eight configured fast gates pass, checker rc 0; expanded lint5 rc 0 (19 warnings, zero errors); type check4 rc 0. Current source identity5 matches all 1047 hashed files, actual rc 0; phone adapter hash matches and four native regressions pass rc 0. Raw failures and successes preserved in private scratch evidence and the isolated mini directory. Built frontend artifact copied back after source verification. Project audit checker and diff whitespace pass. PLUGIN_COMMAND_COMPLETION_INVENTORY.md lists all 241 commands/30 plugins, with 235 missing effects. No commit, push, publication or deployment; remaining owner/service/store/security/live scope stays required and In Progress.

## Developer-owned Headscale provisioning (owner requirement, 2026-10-12)

Greg: every developer project scaffolds with SSSS and Total Recall, ships mesh with Headscale, and sets up the developer's OWN control server. Nothing may point at Greg's server. Saved as invariant `invariants-e223ff7f`.

Verified against official Headscale docs (headscale.net stable, docs show 0.29.3; config-example.yaml on main), fetched 2026-10-12: DEB packages are recommended on Debian 12+/Ubuntu 22.04+; a standalone binary needs a `headscale` system user, `/etc/headscale/config.yaml`, a systemd unit and a writable `unix_socket`. Minimum config changes: `server_url` (clients must reach it; loopback default is test-only), `listen_addr`, `dns.base_domain` (must differ from the `server_url` domain), `prefixes` (CGNAT/ULA subsets only), sqlite database (Postgres discouraged), `policy.mode` (`database` is needed for runtime policy edits; `mesh policy` already assumes it). CLI: `headscale users create <name>`; `headscale preauthkeys create --user <USER_ID>` (id, not name; default one hour, single use); `tailscale up --login-server <url> --authkey <key>`; `headscale configtest` validates config. API key creation and exact current flags were not on the pages fetched: confirm against `headscale --help` on the installed version before coding.

Existing state (source-read, 2026-10-12): the mesh plugin administers an already-running Headscale (`status`, `nodes`, `enroll`, `preauthkey`, `policy get|set|init-ssh`; `headscale-client.mjs`; server routes). Nothing installs, configures or starts a Headscale server, and `total-recall new` performs no mesh setup. A mesh brick vendored alone also fails without the host (`TR_PACKAGE_ROOT`).

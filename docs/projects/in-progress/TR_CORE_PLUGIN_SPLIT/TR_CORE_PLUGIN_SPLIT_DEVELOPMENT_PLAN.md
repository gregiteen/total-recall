# TR_CORE_PLUGIN_SPLIT — Development Plan

## Canonical Plugin Architecture & Functional Acceptance (2026-10-09)

- [x] Strict Core Repository Boundary:
  - Purged all hardcoded preview components (`frontend/src/components/plugins/previews/`) from Total Recall core.
  - Purged hardcoded brand dictionaries (`plugin-brands.tsx`) and hardcoded CLI card generators (`src/cli/plugin/card.mjs`).
  - Total Recall core contains zero hardcoded plugin code, cards, or mockups. Every plugin is an independent repository (`/Users/greg/Github/tr-plugin-*`).
- [x] Generic Frameless Host Envelope:
  - `PluginCardFace.tsx` acts purely as a generic container loading the plugin's registered Web Component from `ui/card.js` full-bleed inside a sandboxed iframe.
  - Eliminated duplicate outer brand headers; the plugin's own bespoke animated JavaScript interface serves as the single card face.
  - Integrated touch-first host actions (KEYS, CFG, OPEN) with minimum 44px tap targets.
- [x] Total Recall Secrets Vault Resolution:
  - Wired `secretsBrainDir` in `src/server/routes/plugins.mjs` directly to `globalBrainDir` (`/Users/greg/.agent/skills/total-recall`).
  - All plugin CLI handlers resolve credentials from the encrypted secrets store.
- [ ] Production Cloud & Droplet Deployment via `tr-plugin-deploy`:
  - Manage droplet targets and zero-downtime blue/green staging through the dedicated deployment plugin (`tr-plugin-deploy`).
  - Route droplet infrastructure credentials (`DEPLOY_PROVIDER_TOKEN`, `DEPLOY_SSH_KEY`) through the Total Recall secrets vault.
- [ ] White-Label CRM via `tr-plugin-crm`:
  - Operate Kinship CRM platform with pipeline tracking, customer directories, and portable business vaults.
  - Expose authenticated commands (`client`, `vault`, `menu`) and the dashboard panel without hardcoding CRM logic in core.
- [ ] Bespoke Animated JavaScript Card Faces Across All 29 Plugins:
  - Ensure every plugin repository maintains its own bespoke animated JavaScript card face in `ui/card.js` with zero emojis, authentic commercial brand identities, and touch-first ergonomics.
- [ ] Complete Verification Gates:
  - Verify full test suite, lint gates, and TypeScript gates before publication.


> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-07
> **Based on audit**: TR_CORE_PLUGIN_SPLIT_AUDIT.md (Complete, 9b2e21f)

Keep six workstreams and one next action. Historical feature roadmaps are not release prerequisites.

| Order | Workstream | Smallest useful result |
| --- | --- | --- |
| 1 | TR-001 scope and custody | One active project; every old task has an explicit value/disposition; original records preserved; no conflicting priorities |
| 2 | TR-002 current operations | Preserve cloud health and separate brains; keep unsafe auto-pull held while implementation proceeds |
| 3 | TR-003 memory correctness | Exercise actual remember/recall/forget/context/instructions offline and authenticated; measure core retrieval/capsule behavior; memory works with feature plugins disabled |
| 4 | TR-004 smallest plugin seam | Select one existing working capability; reuse its repository and current CLI/task/loading contracts; prove install/invoke/disable/failure with minimal scope and artifact identity |
| 5 | TR-005 core cleanup | Audit feature imports and state obligations; reuse/extract existing owners or remove unused code; delegate product behavior and remove unsupported core readiness/trust/UI surfaces |
| 6 | TR-006 final proof | Clean memory-only artifact, selected-plugin migration, state preservation and rollback, exact-source sanctioned checks, supported behavior and safe deployed-version evidence |

Complete TR-003, TR-004 and TR-005, then TR-006 verification, before tagging, pushing or publishing the package. Earlier release authorization does not override this sequence. Run final release checks against the delivered implementation, once for the consolidated project.

For each feature, choose reuse, extract, remove, or retain as a demonstrated necessary memory interface. Start with source/import evidence and actual usage. A new provider, UI or platform subsystem is not an extraction prerequisite. Existing external plugin/app projects retain their own implementation scope; only a selected supported migration depends on their artifact/evidence.

No active tasks remain for a new showcase/ratings/review system, optional Jev navigation, new notification channels, marketplace/public-sharing expansion, broad cross-repo skill rollout, new industry/plugin catalog, unrelated app rebuilds, or all-default-plugin multi-day soak. Their disposition and reason remain searchable in the source register. Never silently claim those features completed.

The next action is implement memory correctness and the feature boundary from the audited source. Production source deployment stays gated by healthy staging, traffic switch and rollback proof.

### Memory route corrections found during implementation

- Fix PUT mutation invalidation using its selected vault; the current handler writes successfully then references an undefined variable and returns 500.
- Reject unknown explicitly selected brains in memory operations, including multi-brain reads. No mutation may silently fall back to the default brain.
- Prove successful replacement and denied unavailable-brain writes before continuing extraction.

### Minimal host corrections

- Replace hardcoded scientific/product context formatting with generic declared-category memory text; specialized formatting belongs to the existing plugin generator.
- Require a valid manifest and confine generator/context files to their installed plugin directory. Never fall back to executing a similarly named project file.
- Use the existing isolated command runner for CLI plugin dispatch, preserving stdin for CLI operations and propagating failures.

### Memory runtime boundary

- Honor explicit `AGENT_DIR` for global layers and secret discovery; an isolated memory service must not load the operator's home brain or credentials.
- Provide a memory-only HTTP entrypoint using existing validated memory, context, instructions and auth handlers. No feature routers, chat/computer tools, UI build, agent execution or worker auto-start.
- Require authentication and memory read scope for the rules endpoint.
- Remove research queue synchronization, automatic secret-triggered integration research, and research/agent contributions from the memory compiler. Preserve all existing canonical records; capability owners retain optional feature behavior.
- Add an explicit offline embedding mode (`TR_EMBEDDINGS_DISABLED=1`) for provider-free local memory verification; report semantic unavailability honestly while keeping indexes and local recall usable.
- Fix the observed remember/recall race: await local projection compilation before the write CLI reports completion. Keep provider work explicitly selected instead of spawning an unowned background compile.

### Portable initialization and consumer audit

- Replace the default init path with empty portable memory initialization using existing brain identity/registry primitives. Do not seed scheduler work, feature skills, wiki, credentials or default plugins. Preserve existing memory and authored skills on repeated init.
- Keep explicit AGENT_DIR resolution consistent across memory and plugin CLI operations; verify real project/global isolation on the mini.
- Inspect linked plugin targets, not just non-linked directories. Keep the secret resolver export used by the existing Signing plugin; seven capability manifests depend on the core package, but that alone does not establish feature-module usage.

### Canonical memory mutation completion

- Remove remember’s raw shadow rule-sheet write and automatic duplicate archiving. New memory must not alter unrelated existing nodes before validation; explicit optimization belongs to its feature owner.
- Await local indexes after edit and forget; use validated delete/event operations. Replace project soft-delete raw renames with validated archival preserving canonical records.
- Remove HTTP mutation-triggered automatic conflict rewriting and session embedding jobs from the memory host; compile only selected-vault local indexes and report maintenance failure.

### Minimal installed host dependency boundary

- Extract the existing pure UI/app CLI manifest validators from their generator modules; the loader needs validation, not a composer or runtime generator. Re-export from legacy generator paths for current source consumers.
- Separate local/Git installation, canonical install records and artifact identity from optional peer/public distribution. Preserve old distribution implementation with an explicit adapter; the portable CLI selects local/Git installs only.
- Produce a portable CLI entry with memory commands and installed plugin dispatch, using existing handlers and runner. Keep source-only legacy operations available for the current cloud transition until its owner migration is verified.

- Keep embedding endpoint resolution to explicit configuration and loopback. Optional endpoint discovery can be injected by its feature owner; the memory provider must not import or enroll mesh nodes.

- Extract the existing encrypted secret read/write gateway from provider catalog, rotation, usage administration and UI metadata. Preserve the exact consumed Signing export through a package export alias; legacy source administration reuses the same gateway.
- Initialize an isolated disposable brain in every test worker before application imports, then clean it after the file. Tests must never mutate the operator home brain.

- Separate the memory schema from legacy domain schemas. Preserve the existing composed registry type catalog as compatibility metadata so canonical plugin/state records remain readable and kernel registry identity stays stable; this catalog grants no feature execution. Portable memory validation must not import domain implementations.

- Fix the observed import CLI async result bug, propagate failed imports and await local compilation before imported rules can be recalled. Keep authored source files unchanged.
- Read installed manifest command declarations directly, reusing the isolated runner rather than generating another wrapper/authoring system. Portable dispatch must expose declared verbs, confine handlers, preserve output/exit behavior and require an explicit capability owner for background execution. Existing authored/generated files remain preserved for their capability owner.
- Repeated portable initialization must preserve custom brain identity and reject malformed existing identity/registry configuration without replacing it.
- Replace the package's broad product file whitelist with an explicit memory dependency closure and verify a clean installed candidate. Keep legacy source and feature owner records for migration; exclude feature runtime, dashboard and scaffold from the portable artifact.

- Split the existing authentication quarantine from feature monitoring. Memory auth keeps the same persisted blocks without importing sandbox/token/disk monitoring or starting its periodic timer.

## Current release request — 2026-10-07

- [x] Separate host version status from registered consumer upgrades; show Preview features when installed exceeds npm latest.
- [x] Respect semantic version precedence, including prereleases and build metadata, and prevent preview downgrade even with force.
- [x] Verify the source-exact full suite, clean scaffold, native runtime and actual candidate package before a new npm release.
- [x] Resolve the draft memory-only artifact versus requested recent plugin/dashboard/scaffold delivery without silently removing existing consumer commands.

The later explicit npm release request authorizes the compatible 3.39.0 batch independently of completing every extraction workstream. The default dashboard/plugin/update interfaces remain available; the isolated memory runtime has a separate command and export. TR-003 through TR-006 remain in progress until their full acceptance is verified.

## Added request: dynamic plugin card faces

- [ ] Resolve generator ownership and whether this addition is included in the pending 3.39.0 release.
- [ ] Audit the existing provider/owner adapter and verify its current API before integration.
- [ ] Implement model-written compact card code with declared live capability/data bindings and host-owned write-only credential entry.
- [ ] Preserve form state, validate actions, retain the last working face, and make generation failures visible.
- [ ] Verify rendered spatial efficiency, real owner operations, live refresh, credential boundaries and source-exact remote release gates.

## Pre-launch security repairs

- [x] Require config:write for dashboard password changes and verify read-only rejection.
- [x] Isolate plugin UI from dashboard credentials/DOM/network and validate the declared-command bridge using a real browser.
- [x] Reject executable frontmatter on all owned production parsing paths.
- [x] Remove audited vulnerable production dependency resolutions and verify parser compatibility.
- [x] Scan candidate source/artifact for secret material without printing matched values; rerun source-exact full gates, build and native artifact checks.

- [x] Bound public auth request work, reject hostile browser origins during first-run setup, and ignore untrusted forwarded TLS claims.

## Security boundary refresh — 2026-10-08

Security repairs are implemented and the first repaired eight-gate run passes 382 files/2,398 tests. Final source identity and installed package verification remain in progress. Test fixture failures and native-binding setup failures are retained in the evidence. Do not launch based on the historical pre-security artifact or count an unimplemented card generator as delivered.

## Verified pre-launch security candidate — 2026-10-08 UTC

The current candidate security checks pass for exact source `72abfdd410ebdc9fae6bda227a8fd05745e415b988b24331979cc43c10d56207`: nine gates, 383 test files and 2,405 tests, native source/installed health, clean consumer dependency audit and 43 installed lifecycle operations. Both lockfiles have zero reported advisories. Publishing dry run passes; all 579 package files match between test/publishing hosts, with zero credential-pattern/private-credential-path matches. Initialization preserves existing and concurrent credentials. Test-host configuration was restored byte-exact from the pre-incident snapshot, canonical memory preserved, owned additions quarantined, local indexes rebuilt with zero drift and snapshot unmounted. SSH cannot unlock the restored store, so live decryption remains unverified. Detailed evidence: [security audit](evidence/release-3.39.0/security-audit.md). Model-generated card faces remain unimplemented and unaudited; the project stays In Progress. No publication or live runtime upgrade.

## Additional blocker: compatibility init isolation — 2026-10-08 UTC

The incorrectly selected native fixture reached the test host global brain at 02:17 UTC. Compatibility init now honors the shared explicit-root resolver; legacy-store restoration refuses existing stores and atomically preserves concurrent writers. Every native lifecycle fixture also pins HOME. Configuration was restored byte-exact from the read-only 01:43 Time Machine snapshot after a same-host protected backup. No credential mutations were recorded between snapshot and incident. Removed/quarantined 16 owned new files, 47 unchanged scaffold skill files and 12 owned IDE links; four scaffold vault records pre-existed unchanged. CLI rebuild processed 60 canonical nodes with zero drift; embeddings preserved. Snapshot unmounted. SSH could not unlock the store; decryption is not certified. Nine focused initialization/credential tests pass. Final source-exact nine gates pass: 383 files and 2,405 tests; native artifact/lifecycle/dependency proofs pass.

## Mesh ownership repair — 2026-10-10

1. Baseline and audit: 34 core tests + 2 plugin manifest tests pass on isolated Mac mini snapshot.
2. Extract mesh runtime/CLI/routes into plugin; remove built-in command and feature route mounting.
3. Repair status/live topology, verified credential setup and peer presence/delivery.
4. Add owner/host boundary and functional failure regression coverage; run source-matched Mac mini checks.
5. Record exact outcomes and clean owned jobs; no production deployment.

### Active auth migration

1. Repair extracted auth module closure and establish required runtime exports.
2. Move remaining core credential modules/routes/tests into auth; change callers to required generic plugin loading and delete old modules.
3. Ship the auth artifact with scaffold and install it during init without overwriting existing plugin or credential state.
4. Repair plugin credential bypasses and add an enforceable ownership gate.
5. Complete mesh repairs, synchronize skill sources/scaffold, verify source identity and full suites on Mac mini.


### Security machines and network

In progress: add testable macOS/Linux machine/network collector and fleet aggregation; truthful permission hardening and HTTP probe; remove security credential defaults/bypass; replace simulated UI states with actual reports. Validate malicious/clean fixtures and missing-tool/partial-fleet behavior plus full plugin suite on sanctioned Mac mini. Document commands and remaining coverage via OpenWiki.


### Windows and mobile platform coverage

In progress: implement Windows native collector with strict JSON typing; Android runtime/explicit attached-device observations; guided profiles and UI for ChromeOS/iOS/iPadOS/Android/Windows; fleet coverage guidance for platforms without a remote collector. Test safe/unsafe/partial Windows and Android fixtures, missing tools, stale/spoofed/manual evidence and UI interactions on sanctioned Mac mini; retain live-device limitations. Update plugin skill, TR reference, scaffold and OpenWiki; verify ingestion and retrieval.


2026-10-10T07:39:00Z — Codex: Cross-platform source, UI, CLI, manifest and guides implemented. Repeat full owner suite after final strict timestamp validation and source/UI consistency changes; retain matching source fingerprints and raw exit/log. Update and ingest OpenWiki; verify retrieval. Live Windows/Android and managed-device posture integration remain explicit unverified work within the in-progress project, not completed certification.


2026-10-10T07:40:00Z — Codex: final cross-platform security suite passed 26/26 on sanctioned Mac mini, actual exit 0; matching local/tested-source SHA-256 eb6918b76c58d7e3dd2cc9c1e427e85d0cf175d5ecab7c1befc8693acb0c6c02 (CLI, manifests, README, src, tests, UI, skills, scripts). Actual installed CLI platforms returned eight supported modes, exit 0; initial iPhone review returned nine unverified checks, automatic:0, complete:false and exit 1. Final tests cover Windows/Android fixtures, authorization, evidence spoofing/redaction/staleness, mobile fleet missing coverage and UI manual answer/reset semantics. Raw logs retained under evidence/security-plugin. No native Windows/Android hardware verification, management connection, live settings mutation, release or deployment; wider split remains in progress.


2026-10-10T17:48:38.043211+00:00 — Codex: Implement auth token/password services and required core adapter; remove OAuth environment bypass and collaboration signing-file fallback. Repair isolated owner-test paths/fixtures, rerun full auth suite plus affected consumer specs on sanctioned mini. Update scaffold and OpenWiki with exact source/results and remaining credential-owner gaps. Do not deploy while batch verification remains incomplete.

### Auth continuation integration (2026-10-10 — in progress)

Implemented owner session/password service, middleware and route factories, PAT/passkey ownership, explicit migration and encrypted uninstall preservation; closed config/password/deploy writers and environment/file signing bypasses. Auth scaffold and procedure sources synchronized. Validate final owner suite, fresh-init stdin password operation, affected host consumers, dependency failures, package/quality gates and exact source identity; then ingest updated OpenWiki hubs. Broader ecosystem migration remains active until all installed plugin runtime paths and end-to-end surfaces are verified.


2026-10-10T18:26:25.985393+00:00 — Codex: Finish source-exact full core rerun, current fast gates and scaffold negative tests; preserve raw results. Then continue all-installed-plugin credential audit and repair remaining ambient/store/default bypasses with an enforceable gate and owner tests. Keep project In Progress until all required work is verified.


2026-10-10T18:35:44.132567+00:00 — Codex: Full core suite now passes 336 files / 2,025 tests, actual exit 0 (core-full-auth-verified.log). Auth owner passes 11 Node + 154 Vitest tests, actual exit 0; strengthened global-store isolation fixture still needs final rerun. Fast gates prior to final auth CLI source update passed all eight. Auth secret get no longer selects a second store, honors TR_SECRETS_BRAIN, and supports structured found/value JSON for internal consumers. Continued all-plugin bypass remediation across service owners, with auth-only client transport tests. Initial owner runs expose stale environment/fake-result assertions and missing snapshot dependency/runtime files; repairing both. Maps generated results and Maps/Stripe fabricated probes confirmed and removed in edited source. No all-plugin clean result, release or deployment claimed.


2026-10-10T18:38:09.122266+00:00 — Codex: Security scanner strengthened to report dynamic credential environment access and uninspected linked source, without matched contents. Added negative fixture. Service owner tests now use explicit auth fixtures rather than ambient credentials; Phone/Text and Signing tests reject removed fallbacks. Maps/Stripe denial probes covered. Owner snapshot initially omitted Phone runtime package and Skill Manager root specs, and lacked SSSS package; repairing selected source/dependency snapshot without copying any brain/vault. All changes remain unshipped; final owner/security reruns pending.


Continuation acceptance: Doctor must ignore ambient provider credentials and report auth failures. Refresh bundled auth and hash pins, run exact-source full core/auth and fast gates. Replace mesh host selection and synthetic deploy receipts with selected-host/verified execution contracts; validate negative paths. Keep status in progress.


2026-10-10T18:59:01.594783+00:00 — Codex continuation verification: full current core 336 files / 2,025 tests passed, actual exit 0 (core-auth-final2). Auth 11 Node + 156 Vitest tests passed, exit 0; eight fast gates passed, exit 0. All 15 earlier service-owner suites passed, exit 0; later Alerts auth cutover passes 10 tests, exit 0. Mesh selected-host runtime suite passes 25 files / 249 tests, exit 0; manifest/host rejection checks pass 3 tests, exit 0. Security expanded-language scanner passes 28 tests, exit 0. Deploy execution/health/UI contract passes 10 tests, actual exit 0. No live provider, credential, machine setting, deployment or release changed.

All 29 installed manifests declare auth, but the source audit returns exit 1, not all-plugin certification. Expanded Python/shell coverage confirms unresolved CRM local_config.py, session/hash, google_auth.py and cli_client/crm_client.py credential storage. User/operator secret transport has since moved to auth; other paths remain active migration work. These are active required repairs. Regex review also flags authorized auth unlock/store selection and nonsecret checker interpolation; findings require source classification. Source tests cannot certify live hardware, providers, operational deployment adapters or comprehensive UI acceptance.

Current CRM cutover batch: implement strict Python auth transport and route user/rep credentials through it; validate nonzero/invalid JSON, existing-key stale readback, ambient key ignored, instance isolation, stdin-only writes and unavailable selected host. Then migrate local settings/session password/OAuth/client storage and validate native runtime without touching the live CRM.


2026-10-10T23:58:50.683704+00:00 — Codex: Implement auth-backed config, corrupt/legacy rejection, validated updates, secret-free sync, strict required password/session settings, and explicit migration. Run isolated native Python tests in background on mini and compare source identity. Update skills/scaffold and ingest/retrieve OpenWiki. Continue OAuth/session/client; no release.


2026-10-11T00:04:35.943935+00:00 — Codex: Local settings and OAuth client credential slice passes focused negative and CLI transport checks. Continue auth migration of Google OAuth token files, session/password/hash records, standalone CLI credential files and remaining runtime consumers. Full CRM runtime/owner gate remains required; no release readiness claim.


2026-10-11T00:05:46.779874+00:00 — Codex found CRM remote-check.sh copies the whole owner checkout with insufficient exclusions: local_config/OAuth credential files and .env are not excluded. It has not been invoked in this work. Repair source-only transfer before use; never copy live vault/private credentials to test host.


2026-10-11T00:09:04.778444+00:00 — Codex verification: final native CRM auth/settings scope passes 29 Python tests, exit 0; CLI migration and real source-transfer archive tests pass 2 Node tests, exit 0. SHA256 identity matches all 18 selected files across native and CLI snapshots. Five-file project audit passes, exit 0. Refreshed 29-plugin source audit still exits 1; no clean ecosystem claim. OpenWiki ingestion imported 6 hubs, errors 0, exit 0; CRM retrieval is being checked. Native suites used isolated fixture ports, not live credentials, accounts, services or settings.


2026-10-11T00:13:26.919269+00:00 — Codex closed generated API transport ambient CRM/DABBER key bypass and local-daemon startup side effect. Expanded focused suite passes 31 tests, actual exit 0. Initial new test run had two harness errors because extracted function annotations omitted the original deferred-annotation flag; harness corrected and rerun passes. Full CRM runtime/OAuth tokens/session hashes/standalone client/provider paths remain required work. Source identity now includes 19 files; refresh audit after this repair.

## Plugin ecosystem, bricks and monetization — plan added 2026-10-11
Order matters: each phase ends with Mac mini gates and real logs.

1. **PE-A Bricks and `new` (TR-007).** Finish `plugin vendor`/`plugin bricks` (done on `feat/plugin-vendor`); add `requires` resolution, `total-recall new <name> --with …`, SSSS project files via the ssss CLI, and a clean-machine test that creates a project and runs its gates.
2. **PE-B Tiers and shipping (TR-007).** Add `distribution.tier` and `license` to the manifest, schema and loader; decide the core set; make the package carry or fetch core plugins; keep the `card` UI kind accepted (blocks every plugin today); commit the dirty plugin repos; give `auth`, `deploy`, `phone-companion` remotes; neutralize official plugin names; split operator-specific variants into `personal`.
3. **PE-C New official plugins (TR-007).** Build in this order, each as an open plugin with tests and README, proven by a real product: `identity`, `tenancy`, `credits`, `ai-gateway` (needed by Gro), then `google`, `email`, `agent-sandbox`, `skills-pack`, `app-shell`, `enrichment`.
4. **PE-D Service-backed monetization (TR-009).** Define the hosted-service contract (license check, metering, credits, error codes); implement it first for one plugin (telephony or domains/email) end to end; replace the unavailable `license verify` with a real verification call; show price and usage in the card.
5. **PE-E Third-party authoring (TR-009).** Publish the manifest and contract docs, `plugin test` conformance kit, `plugin from-openapi`, and generate a first batch of open API wrappers.
6. **PE-F Store (TR-009).** Publisher accounts and signing, immutable signed versions, hash-pinned install, security review gate, search, payouts to `recipient`; `plugin install <id>` resolves from the store.
7. **PE-G Rules and docs.** Keep the skill, plugins reference and memory rule (`plugins-scaffold-or-direct`) in step with each change.

Out of scope until needed: ratings and reviews, a community marketing site, P2P expansion.

## Functional cards — plan added 2026-10-11 (TR-010)
1. **FC-A Contract.** Extend the manifest schema and validator (`args`, `effect`, `output`, `status`), remove `card_face.metrics`, document the standard subcommands.
2. **FC-B Bridge.** Add `stdin` to `host.run` with the secret-only rule; remove plugin-specific tags and events from `plugin-frame.ts`.
3. **FC-C Engine and templates.** Build the shared engine, the seven layout templates and the widget set in the dashboard, with brand-token theming; reuse `PluginSettings` logic; specs; then verify each plugin visually at phone, tablet and desktop widths. Two plugins of different function must render with visibly different layouts.
4. **FC-D Per-plugin design and manifest enrichment.** For each plugin write a `DESIGN.md` brief (function, layout choice, brand), declare `card_layout`, branding tokens, For each of the 30 plugins read its CLI and declare real arguments, effects, status command and settings; implement `status --json`, `config`, `secrets` where missing; delete decorative `ui/card.js` code or reduce it to the Live view.
5. **FC-E Verification.** Per-plugin spec that the manifest validates and every declared command is runnable in `--help`/dry mode; Mac mini gates for core frontend; screenshot review of every card.

## Brand, logos, drawer and tracking — plan added 2026-10-11
1. **FC-F Names and brands.** Correct wrapper names to provider brands (done for eight plugins on 2026-10-11 in the local plugin repos); decide product names for monetized services (owner); keep first-party names descriptive.
2. **FC-G Logos.** Add `branding.logo` and `branding.provider` to the contract (done in the validator on `feat/plugin-vendor`); source provider logos (needs the owner's approval to download from the official brand kits or Simple Icons, with the license note recorded in `ui/LOGO.md`); design original marks for first-party and monetized plugins; sanitize SVGs on serve; render in the card and plugin list; warn on emoji icons.
3. **FC-H Drawer.** Build the slide-out drawer (Settings, Credentials, Usage, Projects) in the dashboard.
4. **FC-I Ledgers.** Installation records from `plugin vendor` and `new`; the per-brick `usage` helper and `.tr/usage` JSONL; dashboard aggregation across registered projects; server-side per-project metering for closed services; documented opt-in for any reporting; specs proving no payload or secret is ever written.


## Hello Phone workspace and contact stores — 2026-10-11

1. Define `workspace` in the manifest contract and validator; drawer hosts it; `microphone` permission handled by the host.
2. Add `host.subscribe` events to the bridge; wire incoming call and message events from the phone service.
3. Hello Phone CLI parity: call, message, contact, note, transcript, number, settings, agent commands with args, effects and JSON output.
4. Per-number state layout, derived index, export.
5. Contact-store interface, local provider, vCard/CSV import, `tr-plugin-crm` provider (read/write), first read-only adapter.
6. WebRTC softphone component (answer, place, mute, hold, transfer) and agent configuration screens for inbound and outbound Telnyx assistants.
7. Consent, do-not-call, quiet-hours and daily-limit enforcement in the CLI, with tests.
8. Mac mini verification: CLI parity specs, drawer specs, and a live test call on an owner-provided number.


## Full plugin completion — 2026-10-12

Execution order: use PLUGIN_COMPLETION_CHECKLIST.md as the complete scope; first close declared-command, explicit-read and bounded stdin gaps with negative tests, then complete per-owner manifests/workspaces, branded services, bricks/distribution, new blocks, monetization/store and final release. Preserve all existing staged/unstaged work. Focused baseline on sanctioned mini is 48 tests, actual exit 0. Required scope remains In Progress.


2026-10-12T07:11:15Z — Codex: Runtime-path inspection found PluginsPage still mounts the older PluginCardFace, so the shared CardEngine is test-only. Wire the installed grid to the configuration/observation engine and verify the page behavior; retain owner Live panels through declared regions and preview. Source manifest inventory records 30 plugins/241 commands, only six explicit effects. The default face must stay honest about missing contract declarations. Full core suite is running on the isolated mini source snapshot; no serving source changed.

2026-10-12T07:20:59Z — Codex: Full mini run reports 2064 passed / 2 failed (actual rc 1), both model-catalog discovery/alias assertions. Both model routers ignore the explicit TR_ROOT fixture; align the configured root. Frontend build rc 0. Source identity exposed ignored scaffold derived/embeddings.db; preserve it outside the scaffold, classify legacy derived state canonically, synchronize the shipped manifest and add a rejecting regression before delivery. Whole project remains In Progress.

2026-10-12T07:24:48.187050+00:00 — Codex: Catalog regressions now pass; full3 reports 2065 pass/1 fail because the isolated snapshot retained an empty legacy derived directory. New guard correctly rejects it. Remove that empty test-copy directory, then rerun. Eight fast gates ran, scaffold gate correctly failed (checker rc 2); preserve raw report. Additional card audit: gauge invents zero/100 when observations are missing, Usage implies unavailable agent history, and modal lacks focus containment. Correct these shared UI behaviors and test missing-data, keyboard trapping and focus restoration. OpenWiki ingestion completed: 6 imported/0 errors, actual rc 0; retrieval includes the updated plugin hub.

2026-10-12T07:26:34.592095+00:00 — Codex: Brick source review found vendor destination containment checks lexical paths only, allowing an in-project symlink parent to write outside the project. Resolve the nearest existing parent against the real project root before mutation; add a regression proving the external directory stays untouched. Existing vendor functionality is present in the working tree; requires/new and standalone-consumer acceptance remain incomplete.

2026-10-12T07:30:05.595797+00:00 — Codex: Phone owner-source audit found the extracted CliPhoneDataSource expects an obsolete exit/output envelope while the generic bridge returns parsed data, invents host/extension SIP credentials, and hides contact lookup failures. Current browserSession returns a login token, which is not an Asterisk SIP credential. Official browser SDK reference https://developers.telnyx.com/docs/development/webrtc/js-sdk/tutorials/make-your-first-call requires authenticated readiness and actual call state events. Add native owner regressions, verify failure on the mini, then correct adapter transport and reject unsupported sessions explicitly; this does not certify audio or finish the operated Hello Phone product.

2026-10-12T07:31:54.303102+00:00 — Codex: Phone adapter native regression baseline failed 4/4 (rc 1); after repair all four pass (rc 0) on the mini. CliPhoneDataSource now consumes decoded host responses, preserves actual explicit credentials, rejects token-only/incomplete browser sessions without fabricated defaults, and propagates lookup failures. Owner test added. This fixes the extracted adapter boundary only; current provider-token session still needs a compatible real dialer transport, and live audio remains unverified. Full4 core passed 340 files/2068 tests, build/type rc 0 and eight fast gates passed; expanded lint found one new render-time ref error (rc 1), repaired before full5. Nineteen existing lint warnings remain in expanded scope.

2026-10-12T07:32:50.289576+00:00 — Codex: Final full5 passes 340 files/2069 tests, actual rc 0; frontend build5 rc 0; all eight configured fast gates pass, checker rc 0; expanded lint5 rc 0 (19 warnings, zero errors); type check4 rc 0. Current source identity5 matches all 1047 hashed files, actual rc 0; phone adapter hash matches and four native regressions pass rc 0. Raw failures and successes preserved in private scratch evidence and the isolated mini directory. Built frontend artifact copied back after source verification. Project audit checker and diff whitespace pass. PLUGIN_COMMAND_COMPLETION_INVENTORY.md lists all 241 commands/30 plugins, with 235 missing effects. No commit, push, publication or deployment; remaining owner/service/store/security/live scope stays required and In Progress.

## Phase: developer-owned Headscale

1. Confirm `headscale --help` flags on the installed version (API keys, preauth). 2. Mesh `server` command group with injectable runner and specs. 3. `new` calls it after init/connect and reports readiness honestly. 4. Mac mini proof in an isolated HOME using a container or a throwaway host; real remote-host proof needs an owner-authorized machine. 5. Docs, skill and OpenWiki updates.

### Current deployment-optimization slice (2026-10-14)

1. Capture an owner baseline on an isolated Mac mini snapshot.
2. Implement `optimize` inspection and `optimize-clean` reviewed cleanup with explicit path/health/SSH inputs.
3. Add drift, symlink, file-policy, failed-health, transport, CLI and truthful-panel regressions.
4. Verify the complete owner suite and exact delivered source hashes on the mini; record actual exit status. No production mutation or partial release.

2026-10-14T04:53:00Z — Codex: Deployment optimizer slice implemented in the deploy owner. Baseline 11/11 and final 24/24 owner tests pass on the sanctioned Mac mini, actual exit 0. All 14 delivered source hashes match; host manifest contract has zero errors/warnings. Real SSH inspection and HTTP 200 health verified. Cleanup tests exercise real HTTP and isolated disposable fixtures only. Panel no longer fabricates release/save success; cards invoke only read commands. CLI help cannot create state. Evidence: [deployment optimizer verification](evidence/deploy-optimize/verification.md). Existing SSSS receipt migration, verified provider credential setup, broader plugin contracts and final release remain open. No production mutation or publication.

2026-10-14T05:04:00Z — Codex: Fresh release-owner sweep: 27/29 suites pass; phone’s existing round-trip fixture still returns legacy exit/output while the current host/adapter uses decoded JSON, failing the contact-name assertion. User-automations cannot load its declared jsdom test environment because jsdom is absent from devDependencies. Repair fixture transport without weakening assertions; declare/install the test dependency and rerun both complete owners on the mini before any push.

2026-10-14T05:07:00Z — Codex: Greg requires a full working CLI for every plugin: all supported actions, settings and secure credential operations, with UI/API parity and failure verification. Saved invariant through Total Recall; surfaces compiled. Fresh owner source-only release sweep now passes all 29 suites after repairing phone’s obsolete transport fixture (all assertions retained) and user-automations’ missing jsdom dependency. Matched all snapshot source hashes; Git/private-target verification in progress. Complete CLI coverage is a separate acceptance item and is not implied by those suites.

2026-10-14T05:17:00Z — Codex: Inventory/library lifecycle acceptance added at Greg’s request. Existing installs write SSSS plugin records and compile, but plugin-store swallows compilation errors; only explicit manifest.commands are registered in composable commands, and no comprehensive plugin operation library is exposed. Implement one generic manifest-derived catalog in the loading boundary, refresh derived inventory/library on compilation and plugin lifecycle, expose discovery through the composable-CLI owner, and keep a compact CLI-first inventory in every generated surface. Verify real install/remove/update, invalid manifests, missing declarations, unchanged-vault freshness and compilation failures on the mini. The latest universal Total Recall/plugins-first rule is saved both globally and in the project; canonical bodies remain intact.
### Expanded lifecycle/card/agent implementation order (2026-10-14)

Current delivery evidence is consolidated in [plugin library progress](evidence/plugin-library/progress.md). Owner source pushes are verified for the 29 original repositories plus Command Fleet and the latest composable update. Finish the final group-inclusive host suite, source identity and current-source push gates; install the owner through the native plugin lifecycle and verify resulting inventory/surfaces. Keep full integration parity, owner-specific command UI and live provider/runtime verification open until actually proved.

1. Finish automatic composable compilation and actual composed catalog projection; owner 30/30 tests pass on the mini.
2. Verify activation gates, catalog/surface status, owner card mounting, horizontal command scenes, common menus, busy events and secure forms. Preserve full failure logs; rerun the complete core/dashboard suite after fixes.
3. Add a standalone CLI-agents plugin with nine documented adapters, bounded process/auth/result tests and remote installed-agent discovery; preserve unknown states and explicit remote cwd selection.
4. Connect per-command harness/node selection through the owning module, verify actual native/remote routing, and inspect rendered desktop/mobile cards.
5. Synchronize skill/hub/tracker evidence, verify tested source hashes, run current gates and push completed work. All 29 original owner repositories now have verified private remote pushes. Publication/live daemon rollout remains separately evidenced.

Complete all 30 owner development brain layouts through supported CLI, inspect each native layout, compile instruction surfaces, and prevent local memory from entering source commits. Audit owner persistence separately; do not interpret schemas as verified migration.

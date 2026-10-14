# TR_CORE_PLUGIN_SPLIT — PRD

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-07
> **Based on audit**: TR_CORE_PLUGIN_SPLIT_AUDIT.md (Complete, 9b2e21f)

Greg's current direction is a Total Recall memory core with every other feature implemented as a plugin. This project is the single source for priorities previously spread across 13 active projects and one planned project.

## Requirements

Greg's subsequent functional-plugin instruction supersedes selected-plugin delivery acceptance. Every installed plugin needs its own repository containing UI, adapters, configuration, CLI and tests. Every supported integration feature must have an explicit coverage entry and working operation; a generic command launcher or fake successful preview is insufficient. Secure credential entry and all supported settings belong on each plugin. Phone provides real calls and call controls; Text provides real conversation threads, composition, media and delivery states. Remain in progress until the expanded batch is verified.

| ID | Requirement | Acceptance |
| --- | --- | --- |
| R-01 | One active project and ordered tracker | Every prior checklist item has one canonical owner; original wording/logs remain archived; no competing active/planned trackers |
| R-02 | A usable memory-only core | Remember, recall, forget, SSSS validation, memory search and instruction retrieval/compilation work without feature plugins, mesh or a provider account |
| R-03 | Minimum generic plugin contracts | Reuse working CLI/task/loading contracts. Add an interface only when the next existing capability needs it; prove that consumer, scope, failure and unload behavior |
| R-04 | One implementation per capability | Extract working source into its existing owner repository where possible; remove the core duplicate after installed proof |
| R-05 | Preserve canonical state and ownership | Plugin config/events use validated operations; upgrade/disable/remove preserves vault data, app state, overlays and unrelated secrets |
| R-06 | Optional feature installation | Memory-only installation works; selected plugins install from immutable digests; existing enabled installations survive upgrade; missing features report unavailable |
| R-07 | Truthful UI and runtime claims | Plugin-owned interfaces use actual state/actions; unknown conformance stays unknown; identity and evidence derive from authentication and the installed artifact |
| R-08 | Complete source traceability and task reduction | Every historical task is retained, merged, retired with a reason, or assigned to an existing external owner; no automatic carry-forward of old scope |
| R-09 | Real delivery evidence | Distinguish source tests, installed behavior, provider acceptance/delivery, public exchange and production version; verified boxes link code and artifacts |
| R-10 | Safe production and separate brains | Cloud work stays cloud-owned; no brain merge; staged healthy rollout, graceful traffic switch and retained rollback precede cloud version claims |

## Ownership boundary

Core owns portable SSSS memory, vault access, memory retrieval/indexes and instruction surfaces. The minimum loading, authorization and transport interfaces needed to expose memory or attach a plugin remain generic. Research, agents, scheduling, monitoring, notifications, mesh/network management, skills tooling, app composition, product UI, collaboration, speech, browser capture and provider/secret administration belong to capability owners.

Feature-specific source remaining in the core is migration work. Its current location does not make it a permanent exception. Auth/encryption/daemon abstractions need a documented consumer before any portion is retained; administrative/provider workflows belong to plugins.

## Delivery boundaries

The unpublished 3.38.0 candidate contains existing rules/daemon/kernel/Claude-hook fixes. Complete the retained memory/plugin implementation and validate its final source/artifact before any tag, push or publication. Cloud rollout has its own safety gate and live version proof.

External plugin repositories keep their own implementation history and tests. Require their acceptance only for capabilities selected in this migration. Their complete roadmaps do not block memory-core delivery.

## Scope removed after value review

Do not implement the old host showcase/marketing/review/rating system, speculative application/industry plugin catalog, new notification channels, optional Jev navigation, independent public marketplace/P2P expansion, broad cross-repo skill propagation, or unrelated app rebuilds in this project. Existing working capabilities use their current owners. Unsupported product surfaces are removed or kept unavailable during extraction rather than expanded into new subsystems.

The fresh Dabber native total-context reduction acceptance belongs to that app/session integration and is removed from this core project's release criteria. Core acceptance measures its own capsule correctness, complete required-rule coverage, retrieval behavior and actual memory workflow. Replace all-default-plugin multi-day soak requirements with focused installed migration/failure checks for selected capabilities and memory with plugins disabled.

## Success

The core package contains memory plus demonstrated minimal host contracts. Every retained capability runs from its separately owned plugin; unused feature code can be removed after its imports and state obligations are audited. Disabling all features leaves memory usable. Current-core and selected-plugin checks pass on the Mac mini, clean installs work, state survives upgrade/rollback, and supported operational claims have evidence. The project remains In Progress until those outcomes hold.

## Current release acceptance — 3.39.0

Publish the recent source and plugin scaffold as a compatible npm artifact. Expose the isolated memory runtime explicitly, preserve existing public entrypoints and secure consumer imports, show Preview features above public npm latest, and prevent preview downgrades. Release evidence does not close the ongoing feature extraction or external integration acceptance.

## Dynamic plugin card face acceptance — added request

The card face should be generated as working code from the actual plugin capabilities, available state and allocated space. It must efficiently expose the relevant credentials, accounts, actions, analytics and notifications without fabricated data or unsupported controls. Generate credential input/status controls; existing secret values never enter model prompts or generated code. Live data should update without discarding in-progress input or repeatedly rewriting the layout. Details and provenance remain accessible outside the primary face. Generation ownership and inclusion in the current release require resolution before delivery claims.

## Security boundary refresh — 2026-10-08

Pre-launch security acceptance includes read-only PAT password rejection, trusted first-run browser origins, public auth work limits, production TLS proxy trust, non-executable Markdown metadata, isolated owner UI with functioning declared-command/draft behavior, and zero published dependency advisories. Native plugins remain explicit trusted-code installs. Generation acceptance still requires actual owner generator and live data contracts; browser attack fixtures do not certify these future features.

## Verified pre-launch security candidate — 2026-10-08 UTC

The current candidate security checks pass for exact source `72abfdd410ebdc9fae6bda227a8fd05745e415b988b24331979cc43c10d56207`: nine gates, 383 test files and 2,405 tests, native source/installed health, clean consumer dependency audit and 43 installed lifecycle operations. Both lockfiles have zero reported advisories. Publishing dry run passes; all 579 package files match between test/publishing hosts, with zero credential-pattern/private-credential-path matches. Initialization preserves existing and concurrent credentials. Test-host configuration was restored byte-exact from the pre-incident snapshot, canonical memory preserved, owned additions quarantined, local indexes rebuilt with zero drift and snapshot unmounted. SSH cannot unlock the restored store, so live decryption remains unverified. Detailed evidence: [security audit](evidence/release-3.39.0/security-audit.md). Model-generated card faces remain unimplemented and unaudited; the project stays In Progress. No publication or live runtime upgrade.

## Mesh ownership repair acceptance — 2026-10-10

Greg: "there should be no core status all mesh should be handled by plugin". Mesh plugin owns status, CLI, APIs, discovery, execution, policy/enrollment, presence and UI. Core contains generic plugin loading and compatibility bindings only, with no duplicate mesh behavior. Live node display, secure verified credentials, fresh peer selection and honest delivery acknowledgment are required. Existing brain/state identities and access controls remain intact.

### Auth scaffold correction — 2026-10-10

Ship auth with Total Recall scaffold. Remove secrets functionality from core entirely. All plugin credentials use auth. No fallback implementations, environment credential fallback, fake verification, or success after failed operations. Keep `/total-recall` skill and its scaffold and operation references synchronized with implemented behavior. Mesh remains owned by its plugin.


### Security machines and network

Security plugin must help users secure local machines and their declared mesh fleet: real platform checks, listener exposure inventory, effective SSH policy, disk protection, precise remediation and explicit coverage. Auth owns all credentials; no defaults or environment bypass. Read-only fleet audit uses mesh-owned transport. Local permission remediation must verify actual results; disruptive firewall/SSH/disk changes remain reviewable steps with access/rollback prerequisites.


### Windows and mobile platform coverage

Security must cover Windows via native observations and ChromeOS, iPhone/iPad and Android via platform-specific workflows. Add Windows native firewall/Defender/BitLocker/Secure Boot/network checks; optional explicit authorized Android collector; guided device reviews with immutable check IDs, official remediation and strict user-attested evidence. Mobile/ChromeOS manual completion must remain distinguishable from automatic verification. Fleet must surface platform limitations and next steps rather than trying unsupported remote shells or claiming complete coverage.


2026-10-10T07:39:00Z — Codex: Cross-platform acceptance: device guide and assessment UI/CLI for Windows, Android, iPhone, iPad, Chromebook and ChromeOS Flex. Unknown, stale or manual evidence cannot become an automatic pass. Android must not enable debugging or obtain new authorization. Do not collect secrets or recovery material. Native hardware execution verification remains outstanding.


2026-10-10T17:48:38.043211+00:00 — Codex: Require auth-owned session signing/verification and dashboard password persistence, no exported signing keys, generated core files, ambient provider credentials or fallback stores. Missing/locked stores must fail explicitly. Explicit credential initialization/legacy migration belongs to auth; preserve existing live files until explicitly migrated. Test owner and consumer paths in disposable brains.

### Auth continuation acceptance (2026-10-10)

Passwords and signing credentials must never be written through core YAML/config commands or deployment argv. Uninstall must retain verified encrypted credentials before destructive teardown and refuse legacy/conflicting/locked stores. Fresh scaffold init must execute auth password setup with stdin successfully in an isolated root. UI registration requires authenticator creation and server verification; no fabricated scanners, hardware readiness, successful HTTP status or running rotation schedules. Existing account migration stays explicit and conflict-safe.


2026-10-10T18:26:25.985393+00:00 — Codex: Acceptance requires API inventory to include installed routes and surface import failures; custom command/local plugin installation must work without mesh. Auth projection must exclude private session/password/master material and ignore ambient provider credentials. Hash-pinned scaffold acceptance must reject changed source and extra encrypted files. Core and owner tests remain distinct from all-plugin credential verification and live device/provider proof.


2026-10-10T18:35:44.132567+00:00 — Codex: Full core suite now passes 336 files / 2,025 tests, actual exit 0 (core-full-auth-verified.log). Auth owner passes 11 Node + 154 Vitest tests, actual exit 0; strengthened global-store isolation fixture still needs final rerun. Fast gates prior to final auth CLI source update passed all eight. Auth secret get no longer selects a second store, honors TR_SECRETS_BRAIN, and supports structured found/value JSON for internal consumers. Continued all-plugin bypass remediation across service owners, with auth-only client transport tests. Initial owner runs expose stale environment/fake-result assertions and missing snapshot dependency/runtime files; repairing both. Maps generated results and Maps/Stripe fabricated probes confirmed and removed in edited source. No all-plugin clean result, release or deployment claimed.


2026-10-10T18:38:09.122266+00:00 — Codex: Security scanner strengthened to report dynamic credential environment access and uninspected linked source, without matched contents. Added negative fixture. Service owner tests now use explicit auth fixtures rather than ambient credentials; Phone/Text and Signing tests reject removed fallbacks. Maps/Stripe denial probes covered. Owner snapshot initially omitted Phone runtime package and Skill Manager root specs, and lacked SSSS package; repairing selected source/dependency snapshot without copying any brain/vault. All changes remain unshipped; final owner/security reruns pending.


2026-10-10T18:59:01.594783+00:00 — Codex continuation verification: full current core 336 files / 2,025 tests passed, actual exit 0 (core-auth-final2). Auth 11 Node + 156 Vitest tests passed, exit 0; eight fast gates passed, exit 0. All 15 earlier service-owner suites passed, exit 0; later Alerts auth cutover passes 10 tests, exit 0. Mesh selected-host runtime suite passes 25 files / 249 tests, exit 0; manifest/host rejection checks pass 3 tests, exit 0. Security expanded-language scanner passes 28 tests, exit 0. Deploy execution/health/UI contract passes 10 tests, actual exit 0. No live provider, credential, machine setting, deployment or release changed.

All 29 installed manifests declare auth, but the source audit returns exit 1, not all-plugin certification. Expanded Python/shell coverage confirms unresolved CRM local_config.py, session/hash, google_auth.py and cli_client/crm_client.py credential storage. User/operator secret transport has since moved to auth; other paths remain active migration work. These are active required repairs. Regex review also flags authorized auth unlock/store selection and nonsecret checker interpolation; findings require source classification. Source tests cannot certify live hardware, providers, operational deployment adapters or comprehensive UI acceptance.


2026-10-10T23:58:50.683704+00:00 — Codex: CRM settings store credentials only through selected instance-scoped auth. Startup rejects plaintext legacy credentials and corrupt settings. Explicit migration preserves original data on auth failure/conflict, removes plaintext only after full exact readback. Missing session/password configuration fails. Peer config excludes credentials.


2026-10-11T00:04:35.943935+00:00 — Codex: Implemented local settings credential ownership, explicit verified migration, no ambient import/generation fallback, secret-free peer configuration, and unchecked OAuth linkage. Full runtime/provider acceptance remains open.


2026-10-11T00:13:26.919269+00:00 — Codex closed generated API transport ambient CRM/DABBER key bypass and local-daemon startup side effect. Expanded focused suite passes 31 tests, actual exit 0. Initial new test run had two harness errors because extracted function annotations omitted the original deferred-annotation flag; harness corrected and rerun passes. Full CRM runtime/OAuth tokens/session hashes/standalone client/provider paths remain required work. Source identity now includes 19 files; refresh audit after this repair.

## Plugin ecosystem, bricks and monetization — owner expansion, 2026-10-11
This reverses the earlier removal of a plugin catalog and marketplace (see "Scope removed after value review"). The owner now wants the plugins to be the building blocks of new projects, a monetization path for operated services, and an open way for others to publish plugins. Core remains memory plus minimal host contracts; everything below lives in plugins, the CLI and the store.

| ID | Requirement |
| --- | --- |
| PE-01 | **Tiers.** Every plugin declares a tier: `core` (ships with Total Recall), `official` (published, not installed by default), `personal` (owner only), or `community` (third party). Only `core` plugins ship in the package. |
| PE-02 | **Licensing class.** Every plugin declares `open` (source available, vendorable) or `closed` (operated service). Monetizable wrappers over third-party APIs are `closed`; everything else is `open`. |
| PE-03 | **New project.** `total-recall new <name> [--with a,b,c]` creates the folder and git repo, a project brain, SSSS project files, project instructions, test and lint scripts, and adds the chosen bricks with `plugin vendor`. It works offline for open bricks and fails clearly for any brick it cannot fetch. |
| PE-04 | **Bricks.** Open plugins vendor into a project as `bricks/<id>`, recorded in `tr-bricks.json` with version, source and content hash; modified, missing and duplicate states are reported. Done on branch `feat/plugin-vendor`. |
| PE-05 | **Closed plugins are service-backed.** A closed plugin is a thin client plus a hosted service that holds the provider accounts, metering and billing. License and usage are checked by the service, never only by local code. Closed plugins install and run; they are not vendorable. |
| PE-06 | **Monetization.** Support free, one-time, subscription, metered and take-rate. Metered plugins record usage per customer, bill through the operator's payment account, and show cost before use. A missing or lapsed license stops the service call with a clear message and never silently degrades. |
| PE-07 | **Third-party plugins.** Anyone can create a plugin with `plugin create`, test it with the standard gates, sign it with a publisher key and submit it to the store. The manifest and contracts are published and stable. Open plugins stay open; third parties may publish closed service-backed plugins with their own payout. |
| PE-08 | **Store.** A listing service with publisher identity, signed immutable versions, hash-pinned install, search, ratings kept out of scope until needed, review for security, and payouts to the manifest's `recipient`. The store does not run plugin code. |
| PE-09 | **API wrapper generator.** `plugin from-openapi <spec>` generates an open plugin (typed commands, credential handling through `auth`, tests, README) for an existing API, so a large set of thin wrappers can exist cheaply. |
| PE-10 | **Neutral names.** Official and community plugins carry neutral names and no operator-specific infrastructure; operator-specific variants stay `personal`. |
| PE-11 | **New official plugins** (each open unless noted): `identity`, `tenancy`, `credits`, `ai-gateway`, `google`, `email`, `agent-sandbox`, `skills-pack`, `app-shell`, `enrichment`. |
| PE-12 | **Monetizable service plugins** (closed): managed `phone` and `text` numbers, `domains` and `email` (mailbox hosting and a transactional-email relay), `creative-search`, and AI access through `ai-gateway`. Each states its wrapped providers and price model in the store listing. |

## Functional plugin cards — owner direction, 2026-10-11
| ID | Requirement |
| --- | --- |
| FC-01 | Every plugin card is functional first and well designed. No decorative animation, no fabricated values; a value appears only when a command or the host returned it, otherwise the card says it has not been checked. |
| FC-02 | The card shows what the plugin can do: every declared command with its description, arguments (typed, required, choices), effect (read, write, destructive, sends externally), and a run control with output, exit state and duration. Destructive and external-send commands ask for confirmation. |
| FC-03 | The card shows all settings: every `configuration` field with current value, default, validation and save; every declared credential with present or missing, required or optional, and write-only set or rotate. Secret values never enter the page, a prompt or argv. |
| FC-04 | Real status: a declared status command supplies items (label, value, state). The card shows the last run time and any error verbatim. |
| FC-05 | A shared engine supplies the real behavior (actions, arguments, settings, credentials, status, activity) from the manifest. Each plugin has its own design and layout: it picks a layout template and widgets suited to its function, binds them to its own commands, and applies its own brand tokens. Two plugins with different jobs must not look alike. A plugin may add a "Live view" panel for domain data, but its card must still expose the standard capabilities. |
| FC-06 | Each design is deliberate and tied to the plugin's function and branding (color, typeface, density, shape, header treatment), dense but readable, keyboard accessible, touch targets of at least 44 px, light and dark, responsive from phone to wide cards. Shared rules: tokens only, contrast-checked state colors, no decorative animation, no emoji as icons, reduced motion respected. |
| FC-07 | The host contains no plugin-specific tags or events. Domain-specific behavior moves into each plugin's own panel. |
| FC-08 | Secrets can be set from the card through a stdin channel on the host bridge, not argv, and only for declared secret keys. |

## Brand, logos, drawer and tracking — owner direction, 2026-10-11 (amends the neutral-name decision)
| ID | Requirement |
| --- | --- |
| FC-09 | **Wrappers use the provider's brand.** A plugin that only wraps a third-party API is named for that provider (Stripe, Google Maps, Telnyx Voice, Telnyx Messaging, Headscale, fal, DeepSeek Harness). Plugins are not rebranded without reason. Neutral descriptive names apply only to plugins that are Total Recall's own capability. |
| FC-10 | **Real logos.** Cards show the actual brand logo: the provider's logo for wrappers, the plugin's own logo for first-party and monetized plugins. No emoji and no generic icon stand in for a brand. Logos are SVG or PNG files shipped in the plugin (`branding.logo`) with the provider named in `branding.provider`. Provider logos are used only to identify the integration and follow each owner's brand rules. |
| FC-11 | **Monetized plugins have their own brand.** A closed, service-backed plugin has its own name, logo and visual identity, distinct from the providers it wraps (for example a managed telephony service is not called Telnyx). The open bring-your-own-key wrapper keeps the provider brand. |
| FC-12 | **Slide-out drawer.** Each card has a slide-out drawer with tabs for Settings, Credentials, Usage and Projects, so the card stays compact and the drawer holds all configuration and statistics. |
| FC-13 | **Installations.** Every time a plugin is added to a project (`plugin vendor`, `new`), the installation is recorded locally: plugin, version, content hash, project path and id, date. The drawer's Projects tab lists them with status (unchanged, modified, missing). |
| FC-14 | **Usage per project.** Usage is recorded per project: command, time, exit state, duration and units for metered calls (counts and costs only, never payloads or secrets). Open bricks record to the project's own `.tr/usage` ledger with no network reporting; the drawer aggregates across registered projects. Closed services meter on the server with one key per project so usage and billing are attributable. Any reporting beyond local files requires explicit opt-in. |

**Rule for self-hosted engines (owner, 2026-10-11).** A provider brand applies when the user calls the provider's own API with the user's own account. When the owner operates the underlying software as a service (the metasearch instance built on SearXNG, the mail hosting built on Mailcow), the service is the owner's product and carries the owner's brand, which the owner chooses; the underlying software is credited in the plugin's about text. Software the user runs for themselves (for example Headscale) keeps its own name.


## Cards configure and observe; one exception is the phone — 2026-10-11 (owner direction)

**Card rule.** A card is for configuration, credentials, real status, usage and a reference of what the plugin can do. Agents do the work through the CLI, so the card runs only declared read commands (status and list queries) and shows the exact CLI line for every other command. Implemented in the card engine (`frontend/src/components/plugins/card/`).

**Workspace exception.** A plugin may declare a `workspace`: a live-use surface hosted in the slide-out drawer, for plugins whose point is a person doing something in real time. Hello Phone is the first. Everything the workspace does is a CLI command an agent can also run, so people and agents have the same capabilities.

### Hello Phone workspace (drawer)
- **Dialer:** keypad, place a call, answer, hang up, mute, hold, transfer. Audio is a WebRTC softphone on the user's own Telnyx credential.
- **Calls:** history per number with direction, duration, outcome, recording and transcript.
- **Messages:** one thread per contact per number; send, receive, attachments.
- **Contacts:** saved contacts per number, with notes, tags and consent status.
- **Agents:** inbound and outbound AI agents on the Telnyx API (assistant, voice, greeting, hours, handoff to a person), with budgets and consent checks.
- **Settings:** numbers and routing, caller ID, voicemail, recording and consent, quiet hours, do-not-call, E911, 10DLC, usage.
- **Agent parity:** every item above is a CLI command with JSON output: `call place|answer|hangup|list|get`, `message send|list|thread`, `contact add|get|search|import|export`, `note add`, `transcript get`, `number list|get|set`, `settings get|set`, `agent list|set`. The drawer calls the same commands through the host bridge.
- **Per-number scope:** each number owns its threads, contacts, calls, notes and recordings. Data lives under the project's own state (`.tr/phone/<number>/…`) as portable files, so a project that scaffolds the plugin owns it.

### Contacts and records are pluggable
Hello Phone does not hardcode a CRM. It talks to a **contact-store interface** that any plugin or adapter can provide:
- `lookup(number)` for caller ID and context, `search`, `get`, `upsert` for contacts;
- `log(activity)` for calls, texts, notes and transcripts attached to a contact;
- capability flags per adapter (`read`, `write`) and a declared mapping of fields.
Adapters: **local files** (default, always available), **our CRM plugin** (read and write, two-way, transcripts and notes shown inline: the reason to choose it), and **read-only** adapters for other systems the user already uses (vCard/CSV import, Google Contacts, common CRMs). Writing into a third-party system needs an adapter that supports it and an explicit per-number opt-in; otherwise Hello Phone reads from it and writes to local or our CRM.

### Guardrails
- Recording, outbound agent calls and bulk texts follow consent, do-not-call, quiet-hours and per-day limits set in Settings; the CLI enforces them, not just the UI.
- The softphone needs microphone access. The sandboxed plugin frame stays at `microphone 'none'`; the workspace is a host-provided component with the browser's own permission prompt, so a third-party plugin frame never gets the microphone.
- Usage and spend per number are metered server-side for the operated service; recordings and transcripts stay in the owner's project state unless the owner exports them.


## Full plugin completion — 2026-10-12

Greg requests completion of all plugin work. The consolidated acceptance list is [PLUGIN_COMPLETION_CHECKLIST.md](PLUGIN_COMPLETION_CHECKLIST.md). Shared credential entry must use bounded secret-only stdin, reject undeclared operations and never return a submitted secret. Cards execute only explicitly declared read operations; grouped config commands are not implicitly read-only.

2026-10-12T07:20:59Z — Codex: Full mini run reports 2064 passed / 2 failed (actual rc 1), both model-catalog discovery/alias assertions. Both model routers ignore the explicit TR_ROOT fixture; align the configured root. Frontend build rc 0. Source identity exposed ignored scaffold derived/embeddings.db; preserve it outside the scaffold, classify legacy derived state canonically, synchronize the shipped manifest and add a rejecting regression before delivery. Whole project remains In Progress.

2026-10-12T07:24:48.187050+00:00 — Codex: Catalog regressions now pass; full3 reports 2065 pass/1 fail because the isolated snapshot retained an empty legacy derived directory. New guard correctly rejects it. Remove that empty test-copy directory, then rerun. Eight fast gates ran, scaffold gate correctly failed (checker rc 2); preserve raw report. Additional card audit: gauge invents zero/100 when observations are missing, Usage implies unavailable agent history, and modal lacks focus containment. Correct these shared UI behaviors and test missing-data, keyboard trapping and focus restoration. OpenWiki ingestion completed: 6 imported/0 errors, actual rc 0; retrieval includes the updated plugin hub.

2026-10-12T07:26:34.591843+00:00 — Codex: Brick source review found vendor destination containment checks lexical paths only, allowing an in-project symlink parent to write outside the project. Resolve the nearest existing parent against the real project root before mutation; add a regression proving the external directory stays untouched. Existing vendor functionality is present in the working tree; requires/new and standalone-consumer acceptance remain incomplete.

2026-10-12T07:30:05.595436+00:00 — Codex: Phone owner-source audit found the extracted CliPhoneDataSource expects an obsolete exit/output envelope while the generic bridge returns parsed data, invents host/extension SIP credentials, and hides contact lookup failures. Current browserSession returns a login token, which is not an Asterisk SIP credential. Official browser SDK reference https://developers.telnyx.com/docs/development/webrtc/js-sdk/tutorials/make-your-first-call requires authenticated readiness and actual call state events. Add native owner regressions, verify failure on the mini, then correct adapter transport and reject unsupported sessions explicitly; this does not certify audio or finish the operated Hello Phone product.

2026-10-12T07:31:54.303102+00:00 — Codex: Phone adapter native regression baseline failed 4/4 (rc 1); after repair all four pass (rc 0) on the mini. CliPhoneDataSource now consumes decoded host responses, preserves actual explicit credentials, rejects token-only/incomplete browser sessions without fabricated defaults, and propagates lookup failures. Owner test added. This fixes the extracted adapter boundary only; current provider-token session still needs a compatible real dialer transport, and live audio remains unverified. Full4 core passed 340 files/2068 tests, build/type rc 0 and eight fast gates passed; expanded lint found one new render-time ref error (rc 1), repaired before full5. Nineteen existing lint warnings remain in expanded scope.

2026-10-12T07:32:50.289576+00:00 — Codex: Final full5 passes 340 files/2069 tests, actual rc 0; frontend build5 rc 0; all eight configured fast gates pass, checker rc 0; expanded lint5 rc 0 (19 warnings, zero errors); type check4 rc 0. Current source identity5 matches all 1047 hashed files, actual rc 0; phone adapter hash matches and four native regressions pass rc 0. Raw failures and successes preserved in private scratch evidence and the isolated mini directory. Built frontend artifact copied back after source verification. Project audit checker and diff whitespace pass. PLUGIN_COMMAND_COMPLETION_INVENTORY.md lists all 241 commands/30 plugins, with 235 missing effects. No commit, push, publication or deployment; remaining owner/service/store/security/live scope stays required and In Progress.

## Requirement: developer-owned control server

`total-recall new` must leave the developer with a working, private Headscale control server that they own, the first node enrolled, and credentials stored through the auth plugin. Acceptance: no owner hostnames, keys or addresses appear in generated output; `mesh status` reports the new server reachable; a second node can enroll with a generated pre-auth key; a failure at any step stops with the exact command and state so the developer can resume; an existing server is never overwritten without explicit confirmation. Remote hosts need a public name and TLS; the tool must say so rather than claim success on a loopback-only server.

### Amendment (owner, 2026-10-12): deployment-gated

Headscale is provisioned only onto a deployment the developer already has, discovered through the deploy plugin's registered providers. With no deploy plugin or no registered provider, `new` skips Headscale and the mesh brick, says why, and shows the command to enable it later. It never creates a server, spends money or contacts a provider on its own. When providers exist, provisioning needs an explicit choice (`--mesh-on <provider>`); `new` lists the choices and does nothing otherwise.

### Amendment 2 (owner, 2026-10-12): requirements decide

This supersedes the skip messaging and explicit-flag rule above. Requirement: a deploy plugin with at least one registered provider. Met: `new` adds the mesh brick and provisions Headscale on that deployment. Not met: no mesh, no Headscale, no prompt and no hint. With several providers the developer names one with `--mesh-on <provider>`; with one it is used. A provider-list error is a failure of `new`, not an empty list.

### Amendment 3 (owner, 2026-10-12): stays updated, zero downtime

The provisioned Headscale must stay current with upstream releases and update without downtime: stage the new version beside the running one, test it against a copy of the real database, switch only when healthy, and keep the previous binary and a database backup for automatic rollback. Constraint to state plainly: Headscale is a single process over one SQLite database, so a switch has a control-plane gap of a few seconds (new logins and map updates pause); established WireGuard connections between nodes continue. A true no-gap control plane would need a second server and shared database, which is out of scope unless the owner asks.

### Amendment 4 (owner, 2026-10-12): who the mesh is for

The mesh is a developer tool (private connectivity between a developer's machines, agents and servers), not part of CRM end-user products. Gro does not need it. `new` keeps the rule "requirements met means mesh" and adds `--no-mesh` to skip it per project. The mesh plugin stays a full brick so other apps can build on it; the vendored brick is not standalone yet (18 files import Total Recall modules through TR_PACKAGE_ROOT), so extracting that coupling is required before it can be claimed reusable. Managed hosting, pricing and the built-in relay remain undecided: Tailscale's Terms are silent on relay use with a self-hosted control server and forbid reselling "the Services" (section 2.3), so the default must not depend on Tailscale's public relays in a paid product until that is cleared.

### Amendment 5 (owner, 2026-10-12): developers bring their own deployment and domain; stacking bricks is a first-class feature

1. No hosted mesh tier. Developers use their own deployment and domain. The managed-hosting, mesh pricing and Tailscale-relay-resale questions are withdrawn; they are not built and not on the active list.
2. The deploy plugin gains a DigitalOcean provider path first, offered as a white-label of our deploy plugin, and the domains plugin is offered white-labeled or bring-your-own. How the two are branded and billed is undecided: FC-09/FC-11 and the self-hosted-engine rule say a provider keeps its brand when the user calls its API with their own account, and an owner-operated resold service carries the owner's brand. The domains plugin already has a resale markup setting; the deploy plugin has none. Open question recorded in the checklist.
3. Software a developer runs for themselves keeps its own name (the existing rule), so a developer's mesh server is called Headscale unless the owner changes that rule.
4. Stacking bricks must be attractive: named stacks (for example workspace = deploy + domains + mesh), one command to add a stack to a new or existing project, requirement resolution, drift diff against upstream, installation and usage records, and bricks that run standalone. A brick that cannot run without the Total Recall host is not an acceptable brick: host-coupling extraction is a prerequisite.

### Amendment 6 (owner, 2026-10-12): DigitalOcean basics, bring-your-own account

Keep the DigitalOcean path simple: the developer's own DigitalOcean account and personal access token (stored through the auth secret store), with create, list, register-as-deployment and delete of a host. Because the user calls DigitalOcean's API with their own account, the PRD rule keeps the DigitalOcean brand; there is no white-label rebrand and no reselling. Rationale from DigitalOcean's published terms (read 2026-10-13): the account holder is solely responsible for its end users and activity and indemnifies DigitalOcean (Terms of Service 4.5 and 11; Acceptable Use Policy introduction), and the access license is non-sublicensable (2.5). Reselling would make us the account holder who carries that responsibility; contract wording with our users cannot move it to DigitalOcean, which is not a party. Our own terms (for counsel to draft) should state that we provide software only, never operate or see the developer's servers, and that the developer is responsible for their account, charges and compliance. The domains plugin's existing resale markup setting is in tension with this stance and needs an owner decision.

### Amendment 7 (owner, 2026-10-12): admin console, identity and mesh secrets

1. Headplane (MIT, v0.7.1) ships as the mesh admin console: pinned container on the developer's server, bound to 127.0.0.1, reached only through an SSH tunnel (`mesh server console`), login with a one-day Headscale API key placed on the clipboard, updated with the control server, previous image restored on failure. A console failure never undoes a working control server.
2. tsidp (BSD-3-Clause) does not run on Headscale as published: it registers, then stops because it requires Tailscale-issued HTTPS certificates. It is not shipped. Mesh identity itself (WhoIs) works on Headscale and is the foundation for identity features.
3. Secrets and identity are different jobs. The secrets store keeps credentials and hands them to programs. An identity provider proves who is asking. Today's mesh secrets sync copies the whole encrypted store to every node, authorized by one shared token plus a mesh-address check. Target design: a mesh secrets service that identifies the calling machine with WhoIs and releases only the secrets its role is allowed, with no shared token. Not built yet.

### Amendment 8 (2026-10-13): mesh secrets built and proven; correction to Amendment 7

Amendment 7 said the mesh secrets service was not built. That was wrong when written: Antigravity had built it (tracker entries 2026-10-13T01:22 and 01:30). Current state: per-machine grants identified by WhoIs, leader routes `/api/secrets/mesh[/:key]`, node merge into its own store, revocation after a successful list, and an encrypted node cache. Proven end to end on a test mesh (Headscale 0.29.4, official Tailscale 1.104.1 clients) with the production secrets runtime and real stores. The legacy whole-store sync and its shared token stay the default until the owner authorizes switching live nodes.

### Deployment optimization acceptance (2026-10-14)

`deploy optimize` inspects an explicitly selected deployment root on the local host or an explicit SSH target. Inspection is read-only, reports real host/process/disk/health observations, and never stops processes. Cleanup is limited to aged regular .cache/.tmp files directly inside `.deploy-disposable-cache`, excluding credential/database-like names and symlinks. Applying requires the inspected digest and a successful health probe before and after cleanup. Drift fails closed. Production cleanup is a separate reviewed operation.

2026-10-14T04:53:00Z — Codex: Deployment optimizer slice implemented in the deploy owner. Baseline 11/11 and final 24/24 owner tests pass on the sanctioned Mac mini, actual exit 0. All 14 delivered source hashes match; host manifest contract has zero errors/warnings. Real SSH inspection and HTTP 200 health verified. Cleanup tests exercise real HTTP and isolated disposable fixtures only. Panel no longer fabricates release/save success; cards invoke only read commands. CLI help cannot create state. Evidence: [deployment optimizer verification](evidence/deploy-optimize/verification.md). Existing SSSS receipt migration, verified provider credential setup, broader plugin contracts and final release remain open. No production mutation or publication.

2026-10-14T05:07:00Z — Codex: Greg requires a full working CLI for every plugin: all supported actions, settings and secure credential operations, with UI/API parity and failure verification. Saved invariant through Total Recall; surfaces compiled. Fresh owner source-only release sweep now passes all 29 suites after repairing phone’s obsolete transport fixture (all assertions retained) and user-automations’ missing jsdom dependency. Matched all snapshot source hashes; Git/private-target verification in progress. Complete CLI coverage is a separate acceptance item and is not implied by those suites.

2026-10-14T05:17:00Z — Codex: Inventory/library lifecycle acceptance added at Greg’s request. Existing installs write SSSS plugin records and compile, but plugin-store swallows compilation errors; only explicit manifest.commands are registered in composable commands, and no comprehensive plugin operation library is exposed. Implement one generic manifest-derived catalog in the loading boundary, refresh derived inventory/library on compilation and plugin lifecycle, expose discovery through the composable-CLI owner, and keep a compact CLI-first inventory in every generated surface. Verify real install/remove/update, invalid manifests, missing declarations, unchanged-vault freshness and compilation failures on the mini. The latest universal Total Recall/plugins-first rule is saved both globally and in the project; canonical bodies remain intact.
### Expanded card and agent acceptance (2026-10-14)

Every card exposes host active/inactive state and on/off controls, command-running feedback, owner overview, horizontally scrollable command scenes, and common-command context menus. Preserve bespoke owner branding/motion and secure stdin credential paths. Install/remove/composable/activation mutations compile catalogs and connected surfaces, with explicit failure results. Host activation does not certify externally managed daemon liveness.

Users select an installed harness and mesh node per command. A CLI-agents owner integrates Claude Code, Codex, Agy, Cursor, DSH, Grok, Muse, Pi and Hermes with current documented argv/auth/result contracts. Unavailable, unauthenticated, unsupported or failed executions must remain explicit. Do not copy brains, inject provider secrets into subscription agents, guess remote workspace paths, or claim an agent answer proves the requested CLI action ran.

Permission controls expose strict boolean read/write/send/destructive command admission. Apply them before dispatch and preserve the vendor's approval/sandbox defaults. These command controls do not claim a complete OS or network policy. Project, matching-group and global composed commands all participate in derived libraries and surface freshness.

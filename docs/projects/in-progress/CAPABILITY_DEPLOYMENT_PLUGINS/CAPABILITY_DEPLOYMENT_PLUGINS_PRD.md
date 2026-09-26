---
type: project_document
title: CAPABILITY_DEPLOYMENT_PLUGINS — PRD
description: Requirements for deploying app-owned capabilities from Total Recall plugins into SSSS applications.
timestamp: 2026-09-26T03:05:55Z
tags: [project-management, prd, total-recall, ssss, capability-plugins]
---

# CAPABILITY_DEPLOYMENT_PLUGINS — PRD

> **Project Prefix**: `CAPABILITY_DEPLOYMENT_PLUGINS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-25

---

## Problem

The current plugin system extends Total Recall itself. The user needs plugins that **deploy product capabilities** into new or existing SSSS applications, and can make a standalone application from one capability. People should be able to own and fork their data and applications, compose capabilities without adopting the Festech brand, and select supported languages and database projections. See the [audit](CAPABILITY_DEPLOYMENT_PLUGINS_AUDIT.md) for executable behavior and current gaps.

## Product model and ownership

- **Total Recall** is the open-source developer control plane: discover, plan, compose, deploy, upgrade, verify, and optionally coordinate parallel work. It is not the runtime host of installed business features.
- **SSSS** is the open, canonical data and operation contract. App-owned Markdown documents and events remain in the app's vault. The app can run and export its data after disconnecting Total Recall.
- **Capability plugin** is a versioned, forkable repository containing a declarative deployment manifest, source/templates, SSSS extension and structural bundle where needed, adapter recipes, tests, and optional authoring skills. One substantial capability per repository is the default; a single repo may contain closely coupled subfeatures.
- **Generated app** owns its code, vault, resource bindings, and deployment destination. A standalone plugin creates its own runnable app; an installable plugin adds itself to a compatible app. Plugin authors do not become owners of installed app data.
- **Hosted mesh/P2P tooling** may be an opt-in paid service for remote work, coordination, distribution, and operations. Local creation, installation, operation, and data export must work without it. Current private mesh and direct public plugin sharing are separate mechanisms; hosted commercial service is future work.

## In scope

1. Extend the Total Recall plugin manifest with an optional, versioned `deploy` contract. Existing brain-only plugins keep working without changes.
2. Make one composable CLI path for an existing SSSS app and one for a standalone app. Proposed UX: `total-recall app plan/add/create/upgrade/verify` with `--json` and dry-run modes; final names are to be locked by CLI tests and docs.
3. Build a capability plan before applying any change: verified plugin provenance, dependency graph, target compatibility, namespaced SSSS registry composition, data access grants, generated files, migrations, external resource requirements, and test gates.
4. Use `ssss new` as the starting SSSS project for standalone mode, then install the chosen capability's runnable UI/API/runtime shell. Do not claim the existing starter is itself a complete application.
5. Preserve app-owned SSSS state. A plugin declares which document types/paths/events it reads or writes; the app grants those scopes explicitly. Installation and upgrade state is an app-owned SSSS document plus append-only events. Plugin removal must preserve user data by default and offer an export path.
6. Support adapters as an open contract: language/runtime code templates and database **projections** are selected independently where compatible. The first proof is a Node/TypeScript capability with SQLite projection; then a Python host interoperability proof and an alternate SQL projection demonstrate each axis. Unsupported combinations fail during planning with a useful reason.
7. Adapt existing skills into **authoring guidance** (starting with a frontend designer) and package the resulting code, structural SSSS documents, and verification into deployable plugins. A `SKILL.md` alone is not an application deployment.
8. Use `gregiteen/festech-modular` as the first composition/reference app, while a second fresh app proves the plugin has no Festech dependency. Keep the current `festech.live` app and production target unchanged until a separate parity and cutover decision.
9. Expose the same deterministic CLI/SSSS workflow to Codex, Claude Code, Antigravity, and humans. Platform-specific skills are instruction surfaces only. An MCP bridge is an optional plugin using the same operations, not a separate app generator.
10. After the base contract works, support an API-integration meta-plugin that turns a reviewed API description into app operations and optional MCP surfaces. Authentication, pagination, rate limits, webhooks, secret scopes, and SSSS mapping remain explicit provider work; arbitrary API integration is not presumed automatic.
11. **Every plugin ships a CLI and interface elements** (user direction, 2026-09-25). The CLI is **generated** from a declared command spec in the manifest (subcommands, typed args, JSON output, exit codes) for the selected language adapter, so models and humans drive the capability the same way (as Dabber CRM's `crm.py` does). The interface elements (panels, forms, list/detail views, settings) consume a per-app **design-token file** (`DESIGN.md`-style YAML tokens, as in Dabber CRM), so each app restyles them without forking plugin code. The frontend-designer plugin or an external design tool (e.g. Claude Design, once its export format is verified) edits that file.
12. **Skills become plugins, and each repo keeps its own implementation** (user direction, 2026-09-25: "code-quality must be customized for every repo"; "there are many repo-specific implementations of core skills"). A skill plugin has two layers:
    - The **core** is owned by the plugin and upgraded by it: the shared engine (runner, background jobs, locking, report format), the contract the repo layer must satisfy, the generated CLI, and the UI elements.
    - The **repo implementation** is scaffolded once, then owned by the repo and never overwritten: the gate list, commands, tiers, remote hosts, invariants, and SKILL.md prose. For code-quality, the four audited repos share no gate except a test tier.
  Install proposes a repo implementation from detection plus the repo's existing skill, if any. **The repo layer is customized through the Total Recall CLI, not by hand** (user direction, 2026-09-25). Each plugin declares a schema for its repo layer. Total Recall generates the customization commands from it: for code-quality, `total-recall code-quality gate add|remove|list`, `tier set`, `detect --apply`, plus a guided `init`. Every change is validated against the schema, so scaffolding comes out right for each repo.
14. **White-label and open source throughout.** Plugin code, core code, templates, CLI help, and UI defaults carry no personal names, hosts, domains, or brands; those are repo-layer or app configuration. Each plugin repo has an explicit open-source license and clean history (S11). Upgrades touch only the core, and report drift when a repo implementation no longer satisfies the core contract. The first one is a **code-quality plugin**: gate detection, background checker, report CLI, and a gate-status panel. It supersedes the report-only bundled `plugins/code-quality`. Candidates are listed in the audit's skill inventory.
13. **Dabber CRM is the Python reference host.** `~/Github/moogie_crm` already runs Python (Flask + `crm.py` CLI) on SSSS through a Node stdin-JSON kernel bridge, with its own extension registry and `DESIGN.md`. Use it as the Python adapter proof and template instead of building a new one.

## Capability families

The platform contract must be usable for a frontend designer/app shell, identity, messaging and chat, email and domains, credentials, onsite operations, ticketing, marketing, social publishing, accounting, and legal workflows. This project builds the **composer and two proof plugins** (frontend designer plus a small end-to-end messaging slice) first, then **plans and tracks extracting every Festech capability into a Total Recall capability plugin** (see the audit's Festech capability inventory and the tracker's extraction phase). The extraction work is Total Recall work and is tracked here (user direction, 2026-09-25). Each plugin's source, runtime tests, and releases still live in its own repository. The `festech-modular` app-side work (host adapter, type-ownership map, parity, staging, cutover) stays in `gregiteen/festech-modular`'s `CAPABILITY_APP_EXTRACTION` project. A secrets-manager capability can be standalone or composed, with Total Recall's encrypted store as a **development/provisioning foundation** and app-owned secret references, least privilege, rotation, and provider adapters. It must deploy an app-owned runtime secret service/store or securely inject the required values at deploy; ordinary app use must not require Total Recall online. Its key-handling core needs a small audited boundary, and no generated repository may contain plaintext values. Accounting and legal plugins may need separate policy and human review gates before real transactions or documents are enabled.

## Success criteria

| ID | Verifiable outcome |
| --- | --- |
| S1 | A clean machine can create a standalone, unbranded app from a pinned capability source; the app starts, serves its UI/API, and passes its own SSSS conformance tests. The app still runs when Total Recall is stopped/removed. |
| S2 | The same pinned plugin installs into an existing compatible `ssss new` based app, passes an end-to-end feature path, and a second apply makes no unintended changes. An incompatible app fails before writes. |
| S3 | The installed app's canonical documents/events live under its own vault. A permitted user can export, import into another compatible app, and rebuild its SQLite projection; private data is excluded from a template/sale export. |
| S4 | A plugin's declared path/type permissions are enforced. A denied read/write and an undeclared secret/provider request fail without exposing data or partially changing the app. No claim of end-to-end encryption is made without a separate verified implementation. |
| S5 | One plugin is composed with the frontend designer in `festech-modular` and an unrelated fresh app. Both build and pass their feature tests; neither depends on the original Festech runtime or brand assets. |
| S6 | The CLI emits a deterministic, machine-readable plan and result; resolves dependencies; detects collisions; records app-owned installation/upgrade events; and verifies output hashes. Generated files and migrations are reviewable before apply. |
| S7 | A second language route (Python host through a conformant SSSS bridge or native adapter) and a second projection backend pass the same contract fixtures. Every advertised combination names its actual support level. |
| S8 | Plugin repos can be forked and installed from a content-pinned source. A local/offline source works; hosted mesh enrollment and monetization are not required for app operation or data export. |
| S9 | Codex plus at least one other agent invoke the same CLI with the same pinned inputs and obtain the same plan hash and conformant app output; authorization differences are explicit. An optional MCP bridge calls those same operations. |
| S10 | Secret-scoping tests show only authorized app-bound keys reach the selected target, including `--keys` and rotation paths; no secret appears in generated code, SSSS bundles, reports, or logs. |
| S12 | A skill plugin (code-quality first) installed into a TypeScript repo and into Dabber CRM (Python) scaffolds a working repo-specific skill; adopting an existing repo skill (Total Recall's, Festech's) preserves every repo gate; a core upgrade changes none of the repo layer; a generated CLI whose `--json` output validates against the declared spec, and a UI panel. Changing the app's design tokens restyles the panel with no plugin code change. |
| S11 | Each publicly listed capability comes from a clean, independently forkable repo with an explicit license, source provenance, secret/asset scan, and pinned immutable artifact whose digest the installer verifies. No Festech private history or generated assets are copied into the public repo. |

## Explicit limits and risks

- “Any language, any database” means an **extensible, tested adapter interface**, not that every combination exists on day one. SSSS's current reference kernel is JavaScript; non-JavaScript hosts need a verified bridge or native conformance implementation.
- SQLite/Postgres are allowed as application projections. They cannot quietly replace the SSSS vault as the product record.
- Existing skill copy/deploy (`total-recall skill deploy`) moves agent instructions into a repository; capability deployment is a separate operation.
- The `PLUGIN_P2P` release candidate and its live sharing checks are independent prerequisites for remote distribution claims. A local plugin source can prove this project before those live checks finish.
- Current Total Recall `--keys` projection behavior needs a fresh authorization regression: code filters names but appears to bypass repository binding in explicit-key mode; historical full-projection delivery was observed in 3.26.0. A secret-manager plugin cannot claim least-privilege remote delivery until both cases are tested and fixed.
- SSSS registry compose and bundle parameter/id-remap defects identified in the audit need fixes in `gregiteen/ssss`; no bypass or duplicate local protocol is in scope.
- Production cutover, paid mesh service, public marketplace, and extraction of every Festech feature are separate projects. The generated-app contract must leave room for them without making the local app proof depend on them.

## Priority

P0: app data ownership, SSSS conformance, non-destructive planning, permission isolation. P1: install/standalone paths, idempotent upgrade, clean-room proof. P2: additional adapters, frontend polish, hosted mesh integration. This order follows Total Recall's VFS integrity and sandbox priorities.

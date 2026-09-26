---
type: project_document
title: CAPABILITY_DEPLOYMENT_PLUGINS — Audit
description: Evidence-based audit of Total Recall capability deployment foundations and cross-repository blockers.
timestamp: 2026-09-26T03:05:55Z
tags: [project-management, audit, total-recall, ssss, capability-plugins]
---

# CAPABILITY_DEPLOYMENT_PLUGINS — Audit

> **Project Prefix**: `CAPABILITY_DEPLOYMENT_PLUGINS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-25

---

## User requirement and ownership

Total Recall is the developer tool that composes, installs, upgrades, and deploys capabilities into applications. The installed capability runs in the application. A capability may also create a standalone, white-label application. SSSS supplies the portable state and operation contract. The original `festech.live` site stays in place while `gregiteen/festech-modular` becomes a reference application; substantial capabilities should have their own repositories and may be open sourced. Hosted Headscale mesh and P2P control-plane services are an optional future business, not a runtime requirement for generated applications.

This project belongs in **Total Recall** because its deliverable is the developer-facing composer and deployment CLI. SSSS protocol fixes belong in `gregiteen/ssss`; capability implementation belongs in each plugin repository; modular-site migration belongs in `gregiteen/festech-modular`.

## Current behavior, with code evidence

The audit inspected the Total Recall plugin work on 2026-09-25. It is now committed on `origin/main` through `5e21133` (the integration commit is `1cd1a7e`); package metadata still reports v3.28.2, so this newer project work is not established as a separately published npm release. The `PLUGIN_P2P` tracker still lists live sharing checks. Recheck line numbers after later changes.

| Surface | Observed behavior | Gap for this project |
| --- | --- | --- |
| `src/cli/plugin/create.mjs` | `plugin create --with-generator` emits `compile.generator` to build **agent context**; `--category` declares a Total Recall memory category. | There is no product-app code generator or deploy recipe. The term “generator” is presently context-specific. |
| `src/core/plugin-loader.mjs`; `metadata.plugin.schema.json` | The manifest covers id/version, CLI, context compilation, memory categories, and scheduled tasks. | No deployment target, app compatibility, language/database adapter, SSSS extension registry, UI/API output, resource binding, migration, or verification contract is acted on. |
| `src/core/plugin-store.mjs` (release candidate); `src/cli/plugin/install.mjs` | Install copies a plugin into the Total Recall brain and writes a `plugin_record` plus events through the SSSS operation service. | This installs a **tool plugin**, not the capability into an app; no app-side install inventory or upgrade state exists. |
| `src/cli/init.mjs` | `init --project` adds a project brain to an existing directory. | It does not create a runnable product app. |
| `bin/total-recall.mjs`; `src/cli/plugin/index.mjs` | Routes `plugin` and installed plugin CLI commands. | No `app plan/create/add/upgrade/verify` composition workflow. |
| `src/core/plugin-runner.mjs` (release candidate) | Runs CLI handlers in a child Node process, but copies `process.env` into the child. | A public deployment plugin must declare permissions and receive scoped inputs/secrets; child-process isolation alone is not a permission boundary. |
| `src/core/plugin-public.mjs`; `src/core/plugin-peers.mjs` (release candidate) | Direct public exchange uses a hash-pinned HTTPS link; private mesh exchange discovers the user's own nodes. | Distribution is not app deployment. `PLUGIN_P2P` tracker still has live independent-user and two-node exchange checks open. No hosted P2P marketplace or paid control plane is evidenced. |
| `src/core/mesh.mjs`; `src/cli/mesh.mjs` | SSH dispatch/doctor and node records exist for the owner's mesh. | Useful optional remote build/deployment executor; a fresh local app must work without mesh enrollment. |
| `src/core/secrets-remote-deploy.mjs:186–191`; `src/core/secrets-env-export.mjs:100–109` | The current remote deploy path passes `--keys` into the projection builder, which filters by name. Its explicit-key branch returns before checking repository binding. | Do not treat `--keys` as an app-scoped authorization boundary. The Festech Total Recall skill also records a 3.26.0 live incident where `--keys` delivered a full project projection. Re-test current behavior before any scoped-secret claim. |

SSSS already provides meaningful foundation: `scripts/cmd-new.mjs` implements `ssss new <dir> [--with-total-recall]`, creating a Node package, starter Markdown vault, conformance test, and sale-bundle round trip. It is an **SSSS project skeleton**, not a frontend/API/product runtime. `scripts/ssss.mjs` exposes export, validate, provision, import, registry, and adapter conformance commands. `docs/ssss-spec.md` §§5.5, 6, 16–17 defines canonical Markdown state, adapters, portability, bundles, and provisioning.

When `ssss new --with-total-recall --install` runs, `scripts/cmd-new.mjs:124` invokes `total-recall init` without `--project`. That CLI's default initializes the global brain (`src/cli/init.mjs:4–12`), so the new app's project brain is not established by that path. The starter also has no application server or frontend. Both gaps must be handled before marketing it as a standalone app generator.

The reference implementation has two known code/spec gaps that block claiming generic provisioning is finished:

1. `ssss registry compose` currently fails because `scripts/cmd-registry.mjs:9` reads `set.primitives` while `src/registry.mjs:213–228` returns `types`. This belongs in the SSSS repo.
2. `src/bundle.mjs:418–461` checks required parameters and dangling links but currently emits original file content under prefixed paths; it does not substitute parameter values or remap identifiers as `docs/ssss-spec.md:1663–1703` specifies. This belongs in the SSSS repo.

The existing Festech pack path is not a deployable capability implementation: `apps/web/server/services/ssss/UcwPackService.ts:185–218` constructs `manifest/params/steps` rather than the normative `manifest/files` bundle, then shells out to `ssss import` against a collective vault. Its generated-pack path uses a mock response. Festech `apps/web/server/services/ssss/SsssOperationService.ts:49–59` shows the host-side kernel bridge to preserve when capabilities are extracted. These findings are cross-repo blockers only; this project does not edit either repository.

## Festech capability inventory (extraction source)

Source: `gregiteen/festech-modular` → `docs/projects/in-progress/CAPABILITY_APP_EXTRACTION/CAPABILITY_APP_EXTRACTION_AUDIT.md` (2026-09-25, read-only code audit at `b98da9c45`). Paths are relative to `festech-modular`. "Extractable" means the behavior exists in source; it does **not** mean a plugin is ready.

| Plugin | Festech source | Maturity | Blocker before extraction |
| --- | --- | --- | --- |
| Messaging/chat | `apps/web/server/routers/comms.ts`, `packages/comms-engine/` | Extractable | `comms-engine/src/bus.ts` imports Festech DB types; some stores are in-memory |
| Email | `apps/web/server/routers/email.ts`, `packages/email`, email-sync route | Extractable | Provisioning and sending are coupled to host/provider |
| Domains | `apps/web/server/routers/domains.ts` | Extractable | Registrar, DNS, SSL, and tenant state are coupled |
| Secrets/credential manager | Total Recall encrypted store and rotation; Festech `developers.ts` (app keys) | Partial | `--keys` scoped delivery must be re-tested (see above) |
| Onsite operations | `operations.ts`, `liveops.ts`, mobile scanner | Extractable | Scanner and event identity are host-coupled |
| Event ticketing | `tickets.ts`, `services/ticketing/checkin.ts` | Extractable | Direct DB writes must move to canonical SSSS writes first |
| Marketing | Campaign paths in `comms.ts` | Partial | No independent runtime; provider acceptance unproven |
| Social | `social.ts`, `apps/web/lib/releaseFlags.ts` | Partial | Publishing is feature-gated off; needs live provider acceptance |
| Accounting | `finance.ts`, `ledger_entry` type | Partial | Direct ledger writes; protected-action audit |
| Legal | `legal.ts`, `contracts.ts`, `legal_envelope` type | Partial | Protected-action audit; standalone workflow unproven |
| Frontend designer | `pages.ts`, `cms.ts`, `brand.ts`, `WorkspaceProvisioningService.ts`, design skills | Partial | No output contract, preview, or accessibility gates |
| App translator | `next-intl` (`useTranslations`), `apps/web/messages/{en,es,fr,de,it,ar}.json`, `apps/web/lib/i18n/dynamic-keys.ts`, `.agent/skills/translation/scripts/auto-translate.ts` (string extraction + CLI-agent translation) | Extractable | The pipeline is an agent skill script, not app runtime; it needs a model port with no Gemini API path (see the translation skill's warning); catalogs are Festech-specific |
| Tracking cookies (consent + analytics) | `components/gdpr/CookieConsent.tsx`, `components/analytics/WebsitePageViewTracker.tsx`, `server/routers/analytics.ts` (`recordWebsitePageView`, dashboards, `posthog-node`) | Extractable | The consent choice (`festech_cookie_consent` in localStorage) is read only by the banner itself, so "Essential only" does not gate the page-view tracker; consent must gate every non-essential tracker before this ships |

The Festech SSSS registry (`docs/ssss/primitive-registry.json`, 198 entries) has no per-capability ownership or alias map yet; renaming types during extraction could strand existing data. That map is a `festech-modular` gate that every extraction depends on. Event ticketing is not support-case ticketing, and MCP-bridge and API-integration meta-plugins are new work with no Festech source.

## Skills that should become plugins

Each gets its skill scaffolded into the target repo, a generated CLI, and UI elements. The source is the Festech copy unless noted. Every skill-folder listing below was checked in `festech-modular/.agent/skills/` on 2026-09-25.

| Skill | What exists | Plugin shape |
| --- | --- | --- |
| **code-quality** (first) | Same generic `check.mjs` / `detect.mjs` / `report.mjs` + per-repo `config.json` in Festech and Total Recall; Total Recall ships a report-only bundled `plugins/code-quality` (`report` subcommand) | detect → write gate config; `check --tier` (background) / `report --json` CLI; gate-status panel |
| translation | `auto-translate.ts`, `extract-sms.js`; `next-intl` catalogs | = app-translator plugin (inventory above) |
| web-design, ui | design skills; Festech `brand.ts`/`pages.ts` | = frontend-designer plugin; owns the design-token file |
| test | Vitest/Playwright conventions, Mac Mini runner | test CLI + results panel |
| security | audit checklist | audit CLI + findings panel |
| notifications, pwa | push/PWA setup | installable capability with settings UI |
| domains, asterisk (telephony), database | provider and ops runbooks | capability plugins; the production runbook parts stay out of generic output |
| accounting, legal-quants, monetization | domain guidance | pair with the accounting/legal plugins |
| repo-expert, research, cli-agents, project-management | agent workflow skills | skill + CLI only; UI optional |

### Repo-specific implementations already exist everywhere

Counted in `~/Github` on 2026-09-25 (repos containing `.agent/skills/<skill>/SKILL.md`): total-recall 21, research 11, code-quality 10, push 9, test 9, skill 9, ssss 9, security 8, repo-expert 8, deploy 7, cli-agents 7, plus 9 `<repo>-project-management` overlays. They diverge, and must. Code-quality gates differ completely:

| Repo | Gates (tier) |
| --- | --- |
| total-recall | dist-freshness, open-source-paths, shipped-package-paths, scaffold-brain-state, ssss-registry (fast); test (remote) |
| festech-modular | no-gate-bypass, no-stock-photography, image-field-naming, ssss-validate-registry, i18n-translations (fast); ssss-conformance, ssss-bridge (full); types, lint, test (remote) |
| moogie_crm (Python) | flake8, black-check, mypy, tsc, no-hardcoded-secrets, ssss-compliance (fast); pytest, browser-walkthrough (full) |
| ssss | conformance-engine (fast); conformance-full (full) |

Even the shared runner has drifted: `total-recall` and `festech-modular` `scripts/check.mjs` differ. So a skill plugin cannot ship one finished skill. It ships a shared core plus a contract, adopts each repo's existing implementation, and keeps the repo layer repo-owned.

`total-recall plugin create --with-cli` currently writes a placeholder `cli.mjs` (`src/cli/plugin/create.mjs:100–116`). It does not generate commands from a spec, and it has no UI or skill-template support.

## Python reference host: Dabber CRM

`~/Github/moogie_crm` (Dr. Dabber field CRM) is a working Python + SSSS app:
- Flask server (`server.py`) and a model-in-the-loop Python CLI (`crm.py`, argparse, 20+ subcommands) for agents and humans.
- Every vault write goes through `ssss_bridge.py` → `scripts/ssss-store.mjs`, a Node stdin-JSON bridge that composes the core + `registry/extensions/dabber-crm.json` registries and runs `createKernel`. Python reads Markdown directly and never writes vault files.
- `DESIGN.md` holds YAML design tokens (colors, typography) for the TypeScript frontend (`frontend/src`).
- `install.py` sets up Python ≥ 3.10 + Node ≥ 20, runs `total-recall init --project --yes`, and installs the cross-platform launchers (`crm`, `ssss`, `total-recall` + `.bat`/`.ps1`).

This is the Python adapter template. The stdin-JSON bridge is the de facto non-JavaScript protocol; SSSS should standardize it (see the SSSS `CAPABILITY_PROVISIONING_CONTRACT` project, G3).

## Root cause and implications

The word “plugin” currently means “customize Total Recall itself.” The new requirement is a second lifecycle: a **deployable capability artifact** authored with skills and installed into an app. Reusing `plugin install` without an explicit app deployment phase would leave product code inside the brain and make the generated app depend on Total Recall at runtime. Treating SSSS `.ucw` as a code archive would conflate structural vault data with source code and executable scripts.

The safety boundary is material. Installation must preflight source hashes, file paths, compatibility, registry collisions, resource bindings, secrets, and planned writes before changing the app. A plugin may supply executable build/migration steps, so an untrusted share link cannot silently gain shell access or the developer's full environment. App-side installation and upgrade records must be SSSS documents/events; SQLite, Postgres, and other databases may be rebuildable projections, not competing sources of truth.

## Audit method

Read-only code and project-document inspection. No capability deployment was executed, no app scaffold was created, and no end-to-end claim is made. Existing `PLUGIN_P2P` live checks remain separate before public-distribution claims.

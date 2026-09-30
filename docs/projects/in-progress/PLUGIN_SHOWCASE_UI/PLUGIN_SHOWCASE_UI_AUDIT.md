---
type: project_document
title: PLUGIN_SHOWCASE_UI — Comprehensive Audit
description: Comprehensive audit of Total Recall frontend UI, plugin representation, core capability extraction, and preview/marketing/review surfaces.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, audit, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Comprehensive Audit

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-30
> **Reconciliation**: Codex; original authorship and historical text retained below


> **Audit Status**: Complete for the reviewed Total Recall tree; independent plugin repositories remain unverified here.
> **Audited commit**: `e5d9aad0dd7d7372363a7d5d0c97349949330446` plus the inspected working-tree changes.

> **Product-scope qualification (PIC-023):** Genuine opt-in authenticated authored review text is a proposed reconciliation of contradictory project requirements. This documentation does not establish Greg's approval of additional social features. Review schema/storage/provenance corrections repair existing defects; enabling expanded reviews or numerical ratings requires explicit requirements agreement. All review-specific target requirements below are conditional on that agreement. Measured artifact-bound conformance remains separate from user opinion.

## Current audit — 2026-09-30

This reconciliation supersedes the historical audit below. The original audit described desired architecture as present functionality and asserted standalone plugin completion without supporting evidence. This document now distinguishes source existence, executable behavior, and live operational verification. The [central correction audit](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_AUDIT.md) owns the cross-project finding register.

### Scope, inventory, and method

Reviewed `src/server/routes/plugins.mjs`, its route tests, `frontend/src/pages/PluginsPage.tsx`, the eight components and registry under `frontend/src/components/plugins/previews/`, and the prior Mac mini audit results. The preview directory is untracked in this working tree. This reconciliation does not certify independent plugin repositories or provider delivery. The five documents in this project still exist; their existence did not establish readiness.

### Current runtime and state

Authenticated review reads require `config:read`; review writes require `config:write`. GET scans `VAULT_DIR/reviews`, while POST creates a `plugin_review` node without a category and calls `writeNodeValidatedAsync`. The real writer rejects the unknown primitive; the prepared default category also disagrees with the reader. These are separate defects. Conformance GET reads manifest assertions and treats missing conformance metadata as successful. Existing host preview components are disconnected from the Plugins page and contain static or fabricated operational state. No live provider workflow is demonstrated by their existence.

### Findings and disposition

| ID | Severity | Evidence | Impact / correction | Disposition |
|---|---|---|---|---|
| PIC-001 | P1-high | `PhonePreview.tsx` displays a fixed connected call and `00:42`; `CodeQualityPreview.tsx:78` contains invented gate results; `previews/index.ts` is not imported by `PluginsPage.tsx` | Remove fabricated operational displays and host copies; use installed plugin-owned UI with actual handlers, telemetry, and honest unavailable states | Fix in correction project; showcase tasks reopened |
| PIC-002 | P1-high | `src/server/routes/plugins.mjs:255`; real Mac mini write rejected `Unknown SSSS primitive 'plugin_review'` | Register and validate the review extension before route success can be claimed | Fix in correction project |
| PIC-003 | P1-high | `plugins.mjs:195` reads `reviews`; POST node omits category | Align canonical review storage and read projection; prove create/read/update/delete persistence | Fix in correction project |
| PIC-004 | P1-high | `plugins.mjs:300` defaults `ssss_conformant` true; review body controls `verified_conformance` | Separate publisher claims from verified evidence; bind review identity to authenticated provenance | Fix in correction project |
| PIC-005 | P1-high | Three review/conformance routes missing from route manifest; route-inventory test fails | Update inventory and test actual routes after contract fixes | Fix in correction project |
| PIC-021 | P1-high | Historical tracker marked server/schema and preview phases complete | Reopen operational claims and require evidence at the installed-plugin boundary | Documentation reconciled; readiness remains open |

### Security, integrations, and standing rules

A request body can supply `reviewer_node` and `verified_conformance`; this does not establish reviewer identity or independent verification. Future reviews must derive identity from the authenticated requester, validate the plugin identity and schema, and apply mutation authorization through the core contract. Persistent reviews, UI preferences, and evidence records use SSSS VFS primitives; credentials stay in the secrets store. User-entered reviews cannot confer test or conformance badges. Capability UI belongs to plugins, with generic host integration. Public person-to-person sharing is required in addition to private mesh sharing. Provider-specific workflows and credentials must be validated within their owning plugins.

### Quality baseline and coverage gap

Prior Mac mini full Vitest execution covered 361 files: 355 passed and 6 failed. Five failures were attributable to omitted files in the temporary snapshot. After correcting the snapshot, the six affected files were rerun: five passed; route inventory remained failing (54 tests passed, 1 failed in that rerun). This is not a single full green run. Route tests mock persistence and therefore do not prove SSSS review writes. Logs: `/tmp/total-recall-plugin-audit-2026-09-30/suite.log` and `retry.log`; durable evidence is linked from the central correction audit. Documentation changes do not resolve these code failures.

### Root cause, deployment, and decisions

The project accepted file creation, mocked route tests, and manifest claims as proof of working capability. A UI mockup requirement then became a claimed live preview, without integration or provider verification. Schema registration, write/read agreement, route inventory, identity provenance, and installation behavior were omitted from completion gates. Existing deployment procedures remain unchanged by this documentation-only work; do not release until the corrected source snapshot passes the sanctioned gates and a real installed-plugin walkthrough. Rollback uses the previous verified artifact and preserves user vault data.

The correction plan retains the dashboard and showcase goals, replaces simulated previews with plugin-owned functional surfaces, and requires evidence tied to plugin artifact digest, date, environment, command, exit status, and scope. No owner decision is required to begin the known corrections. Unverified external plugin status is recorded as unverified rather than guessed. The prior baseline and code findings complete this scoped reconciliation; a broader release audit remains a separate gate.

## Cross-project requirement reconciliation (PIC-023)

`PLUGIN_P2P` historically forbade ratings/reviews/verified badges while this project's historical PRD requested them. That contradictory instruction set helped produce disconnected trust features. Current target: no invented social proof or manifest-only verified badge. Authenticated review text is a planned opt-in capability, subject to registered schema, actual persistence round trips, and identity provenance. Numerical ratings and aggregate stars must not be presented as established product functionality; expose them only after requirements agree and their real data path is verified. Verification evidence remains distinct from user opinion. This aligns with the dated P2P reconciliation and makes no deployment claim.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded by the reconciliation above

The following original planning text is retained for traceability. It is not an assertion of current implementation, verified plugin status, or operational readiness.


## 1. Executive Summary

Total Recall is undergoing an architectural transition: **core Total Recall strictly contains only portable memory (the SSSS memory kernel, vault, and instruction shims). All other bundled capabilities, background tools, and application features are being extracted into standalone plugins (`tr-plugin-*`).**

Concurrently, the frontend dashboard must transform from a developer utility inspector into a showcase for plugins. The UI must feature rich marketing surfaces, live component previews, mesh-distributed peer reviews, and prominent dashboard capability widgets.

---

## 2. Current Frontend UI State Audit

### 2.1 Router & Page Topology (`frontend/src/App.tsx`)
- **Default Route**: Lines 426–427 route `/` to `Navigate to={isOnboardingComplete() ? '/openwiki' : '/onboarding'}`.
  *Finding*: There is no primary command-and-control dashboard featuring active plugins and system status. Users landing on `/` bypass plugins entirely.
- **Sidebar Integration**: Lines 168–198 render a generic `/plugins` link, followed by a flat list of installed plugin names (`{plugins.map((p) => ...)}`).
  *Finding*: No categorization, no capability badges, and no status indicators (e.g. running daemons or mesh availability) exist in the navigation bar.
- **Unused Routes**: Lines 450–459 show obsolete redirects (`/files`, `/sandbox`, `/collab`, `/design`) pointing to `/memory`.

### 2.2 Plugins Page (`frontend/src/pages/PluginsPage.tsx`)
- **Structure**: Uses three basic tabs (`"installed" | "bundled" | "mesh"`) and a secondary detail panel (`"run" | "readme" | "details"`).
- **Missing Presentation Surfaces**:
  1. **Marketing Showcase**: Lacks visual hero headers, value propositions, feature tags, and categorized discovery filters.
  2. **Component Previews**: Has no interactive component rendering. Users cannot preview what a plugin provides (such as a WebRTC phone dialer, a Documenso agreement signature pad, a DNS record management grid, or design token palettes).
  3. **Reviews & Trust Flow**: No peer feedback mechanism, no star ratings, no verified SSSS v2 conformance badges, and no automated test coverage displays exist.

### 2.3 API Integration (`frontend/src/api/` & `src/server/routes/plugins.mjs`)
- `GET /api/plugins`: Returns installed plugins with basic manifest facts and source kind.
- `GET /api/plugins/available`: Returns bundled plugins from the local package.
- `GET /api/plugins/peers`: Returns peer plugins across the Tailscale mesh.
- `POST /api/plugins/:id/run`: Executes CLI subcommands via `child_process.spawn`.
- *Finding*: No API exists for storing user/peer reviews, conformance audit scores, or structured component preview schemas.

---

## 3. Core Capability Extraction Audit

### 3.1 Non-Memory Capabilities Inside Total Recall Core
An audit of `src/` and `bundled/` reveals features that violate the "core is strictly memory" mandate:
- **Bundled Plugins in Core Tree**:
  - `git-sentinel`: Git repository health monitoring.
  - `system-monitor`: Local OS metrics and load auditing.
  - `operator-alerts`: Notification dispatcher and webhook alerting.
- **Server Routes Outside Memory Scope**:
  - `src/server/routes/mesh.mjs` and `headscale.mjs`: Network routing (should be driven by mesh node plugins or generic SSSS entities).
  - `src/server/routes/webhooks.mjs`: Generic webhook ingress.
- **Extraction Target**:
  Every non-memory feature must be detached from `total-recall` and converted into an installable plugin repository (`tr-plugin-*`), leaving core Total Recall dedicated exclusively to:
  1. SSSS Memory Kernel & VFS Document Store (`memory-vault/`).
  2. Instruction Surface Compiler (`INSTRUCTIONS.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`).
  3. Hybrid Recall Engine (Lexical + Vector RRF).
  4. Plugin Runtime Host (`src/core/plugin-loader.mjs`, `plugin-runner.mjs`).

---

## 4. Standalone Plugin Ecosystem Audit

The eight target capability repositories in `/Users/greg/Github/` stand in varying stages:
1. `tr-plugin-code-quality`: 100% complete (12/12 tasks, passing gates).
2. `tr-plugin-composable-cli`: Phase 1 complete (11/11 tests pass).
3. `tr-plugin-signing`: Phase 1 complete (Documenso client, 42/42 tests pass).
4. `tr-plugin-text`: Phase 1 complete (Telnyx SMS + Ed25519, 41/41 tests pass).
5. `tr-plugin-design`: Phase 1 complete (DESIGN.md token engine, 28/28 tests pass).
6. `tr-plugin-domains`: Phase 1 complete (Vercel DNS adapter, 32/32 tests pass).
7. `tr-plugin-decision`: Phase 1 complete (Decision container & gates, 8/8 tests pass). Phase 2 in progress.
8. `tr-plugin-phone`: Phase 1 in progress (Telnyx telephony client & WebRTC dialer extraction).

Each of these plugins requires a designated preview component and rich marketing metadata for the dashboard.

---

## 5. Security and SSSS Conformance

- **Zero External Database Mandate**: All plugin reviews, install states, and UI preferences must persist as SSSS markdown documents in `memory-vault/` or project vaults.
- **Portability Class**: Plugin definitions and preview models must use the `structural` portability class.
- **White-Label Compliance**: UI components must never hardcode developer machine names, personal credentials, or specific production URLs.

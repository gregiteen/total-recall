---
type: project_document
title: PLUGIN_SHOWCASE_UI — Comprehensive Audit
description: Comprehensive audit of Total Recall frontend UI, plugin representation, core capability extraction, and preview/marketing/review surfaces.
timestamp: 2026-09-28T20:35:00Z
tags: [project-management, audit, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Comprehensive Audit

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-28

---

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

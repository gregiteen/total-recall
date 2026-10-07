---
type: project_document
title: PLUGIN_SHOWCASE_UI — Product Requirements Document
description: PRD defining requirements for the Total Recall plugin showcase, interactive preview surfaces, peer review flow, and core memory extraction.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, prd, total-recall, plugins, ui, frontend, ssss]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# PLUGIN_SHOWCASE_UI — Product Requirements Document

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-30
> **Reconciliation**: Codex; original authorship and historical text retained below


> **Based on audit**: [PLUGIN_SHOWCASE_UI_AUDIT.md](PLUGIN_SHOWCASE_UI_AUDIT.md), reconciled 2026-09-30.

> **Product-scope qualification (PIC-023):** Genuine opt-in authenticated authored review text is a proposed reconciliation of contradictory project requirements. This documentation does not establish Greg's approval of additional social features. Review schema/storage/provenance corrections repair existing defects; enabling expanded reviews or numerical ratings requires explicit requirements agreement. All review-specific target requirements below are conditional on that agreement. Measured artifact-bound conformance remains separate from user opinion.

## Current requirements — supersedes historical scope and success claims

The showcase must help a user discover, inspect, install, and operate real plugins without fabricated data or inferred trust badges. Source-file existence, static rendering, manifest assertions, and mocked tests do not constitute operational success. Corrections reference [PIC-001–005 and PIC-021](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_AUDIT.md).

1. **Functional plugin surfaces:** The generic host loads UI from the installed plugin artifact. Phone, Signing, Domains, Design, Text, Code Quality, Composable CLI, and Decision surfaces display real configured data and execute genuine plugin commands. Missing capability, credentials, or evidence produces an explicit unavailable or unverified state. Remove fabricated calls, messages, DNS records, gate reports, command output, and decision scores from product surfaces.
2. **Review integrity:** Reviews use a registered SSSS extension and one canonical storage projection. Create/read/update/delete and restart behavior must pass against the real writer. Authenticated identity determines provenance; user input cannot set verified status. Handle malformed ratings, invalid plugin IDs, missing records, authorization failures, and conflicts explicitly.
3. **Evidence-backed trust:** Test and conformance badges require independently recorded evidence tied to the installed artifact digest, date, environment, command, exit status, and test scope. Missing or mismatched evidence is unverified; publisher assertions remain clearly identified assertions. A focused mocked suite never proves live provider delivery.
4. **Discovery and sharing:** Support public person-to-person sharing among Total Recall users as well as private mesh discovery. A central paid catalog is outside scope; mesh membership is not a prerequisite for public plugin exchange. Show provenance and artifact integrity before installation.
5. **Dashboard and navigation:** Retain the existing goal of a prominent capability hub, searchable plugin information, marketing descriptions, and review visibility. Surface installed capability status from actual plugin state. Preserve user-authored copy.
6. **Completion:** Require the full suite and configured quality gates on the Mac mini, route-inventory agreement, a real review persistence walkthrough, installed UI verification, and public sender-to-recipient exchange. Any unverified provider capability remains explicitly unverified and blocks claims that it works.

Priorities are review/state integrity and honest trust (PIC-002–005), removal of fabricated product behavior (PIC-001), then showcase/navigation integration and final verification. Independent capability extraction is coordinated through its owning project; this documentation does not certify those repositories or authorize changes within them.

## Cross-project requirement reconciliation (PIC-023)

`PLUGIN_P2P` historically forbade ratings/reviews/verified badges while this project's historical PRD requested them. That contradictory instruction set helped produce disconnected trust features. Current target: no invented social proof or manifest-only verified badge. Authenticated review text is a planned opt-in capability, subject to registered schema, actual persistence round trips, and identity provenance. Numerical ratings and aggregate stars must not be presented as established product functionality; expose them only after requirements agree and their real data path is verified. Verification evidence remains distinct from user opinion. This aligns with the dated P2P reconciliation and makes no deployment claim.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded by the reconciliation above

The following original planning text is retained for traceability. It is not an assertion of current implementation, verified plugin status, or operational readiness.


## 1. Problem Statement

Core Total Recall currently conflates memory management with auxiliary tools (such as Git sentinel, system monitor, and operator alerts), diluting its primary focus. Furthermore, while powerful standalone plugins are being extracted across the workspace, the Total Recall frontend UI treats plugins as second-class administrative items rather than prominent capabilities. Users have no way to visually preview component interfaces, explore marketing value propositions, or verify mesh peer reviews.

---

## 2. Invariants & Constraints

1. **Core Memory Invariant**: Core Total Recall strictly contains only portable memory (SSSS memory kernel, vault, instruction compiler, and plugin runtime host). All bundled and external capabilities exist as standalone plugins.
2. **Zero External Database**: All plugin reviews, registry caches, and showcase states must be stored as SSSS Markdown documents in `memory-vault/`.
3. **Greg's Copy Rule**: All text, descriptions, and user-facing copy must never conclude with a preposition.
4. **No AI Slop**: Absolutely no usage of forbidden terms ("sovereign", "synergy", "leverage").
5. **White-Label Design**: All components, previews, and templates must be strictly generic and free of personal credentials.

---

## 3. Product Scope

### In-Scope
- **Primary Dashboard Integration**: A prominent Plugin Capability Hub on `/` displaying installed capability widgets and system health.
- **Marketing Showcase**:
  - Grid and list views of plugins with rich metadata cards.
  - Category tags (Telecom, Quality, DNS & Infrastructure, Design, Signing, Composable CLI, Decision).
  - Search by name, description, and use cases.
- **Interactive Component Previews**:
  - Live preview tab for each plugin demonstrating its extracted UI component.
  - Dedicated interactive preview components for Phone, Signing, Domains, Design, Text, Code Quality, Composable CLI, and Decision.
- **Mesh Peer Review & Trust System**:
  - SSSS `plugin_review` document primitive with 1–5 star rating, reviewer node ID, and text review.
  - Conformance verification badges (SSSS v2 Conformance, White-Label Verified, 100% Test Pass).
- **Core Separation Plan**:
  - Deprecate in-tree non-memory capabilities from Total Recall core.
  - Support seamless dynamic loading of plugins from local paths or the mesh.

### Out-of-Scope
- Monetized app store or payment gateways (plugins are peer-to-peer and open-source).
- Centralized external cloud catalogs (discovery happens via local filesystem and mesh nodes).

---

## 4. User Personas & Use Cases

- **Developer / Power User**: Wants to glance at the dashboard, see which plugins are active, trigger quick actions (e.g. run a code-quality report or dial a phone extension), and explore available plugins with rich previews.
- **Mesh Peer Operator**: Discovers plugins shared across the Tailscale mesh, inspects trust ratings and SSSS conformance, and installs them with a single click.

---

## 5. Success Criteria

1. **Dashboard Alignment**: The main `/` route hosts the Plugin Capability Hub alongside active OS status.
2. **Visual Previews**: Every capability plugin features a working, interactive UI preview tab within the plugin detail drawer.
3. **Review & Conformance Flow**: Users can view and submit peer reviews persisted as SSSS nodes.
4. **100% Passing Tests**: All frontend components pass Vitest tests with 0 failures.

---
type: project_document
title: PLUGIN_SHOWCASE_UI — Product Requirements Document
description: PRD defining requirements for the Total Recall plugin showcase, interactive preview surfaces, peer review flow, and core memory extraction.
timestamp: 2026-09-28T20:36:00Z
tags: [project-management, prd, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Product Requirements Document

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-28

---

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

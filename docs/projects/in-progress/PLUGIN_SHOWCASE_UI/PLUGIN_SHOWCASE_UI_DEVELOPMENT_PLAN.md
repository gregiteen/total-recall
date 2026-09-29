---
type: project_document
title: PLUGIN_SHOWCASE_UI — Development Plan
description: Phased implementation plan for Total Recall plugin showcase, interactive previews, peer reviews, and core decoupling.
timestamp: 2026-09-28T20:38:00Z
tags: [project-management, development-plan, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Development Plan

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-28

---

## Phase 1: Server Review APIs & SSSS Schemas
- [ ] Add `plugin_review` primitive support to `src/server/routes/plugins.mjs`
- [ ] Implement `GET /api/plugins/:id/reviews` and `POST /api/plugins/:id/reviews`
- [ ] Implement `GET /api/plugins/:id/conformance` reporting test pass rates and SSSS v2 compliance
- [ ] Write server route unit tests in `src/server/routes/plugins.spec.mjs`
- **Done When**: Server tests pass with 0 failures via `node --test src/server/routes/plugins.spec.mjs`.

---

## Phase 2: Interactive Component Previews
- [ ] Create `frontend/src/components/plugins/previews/PhonePreview.tsx` (dialer keypad, active call state)
- [ ] Create `frontend/src/components/plugins/previews/SigningPreview.tsx` (agreement viewer, signature field)
- [ ] Create `frontend/src/components/plugins/previews/DomainsPreview.tsx` (DNS record manager table)
- [ ] Create `frontend/src/components/plugins/previews/DesignPreview.tsx` (token swatches, typography hierarchy)
- [ ] Create `frontend/src/components/plugins/previews/TextPreview.tsx` (two-way SMS thread preview)
- [ ] Create `frontend/src/components/plugins/previews/CodeQualityPreview.tsx` (gate report matrix)
- [ ] Create `frontend/src/components/plugins/previews/ComposableCliPreview.tsx` (terminal verb runner)
- [ ] Create `frontend/src/components/plugins/previews/DecisionPreview.tsx` (confidence gate sliders)
- [ ] Create preview registry mapping in `frontend/src/components/plugins/previews/index.ts`
- **Done When**: All preview components render without errors and pass component tests.

---

## Phase 3: Plugin Showcase Page Overhaul
- [ ] Implement `frontend/src/components/plugins/PluginCard.tsx` with marketing badges, trust scores, and action buttons
- [ ] Rebuild `frontend/src/pages/PluginsPage.tsx` with Showcase Grid view, Category filtering, and Search
- [ ] Implement enhanced Plugin Detail Drawer with tabs: `"preview" | "marketing" | "reviews" | "run" | "readme" | "details"`
- [ ] Add Review submission form writing to `POST /api/plugins/:id/reviews`
- **Done When**: `PluginsPage.spec.tsx` passes and all tabs switch seamlessly.

---

## Phase 4: Primary Dashboard Hub & Navigation
- [ ] Create `frontend/src/pages/DashboardPage.tsx` featuring the Plugin Capability Hub
- [ ] Update `frontend/src/App.tsx` router so `/` renders `DashboardPage` instead of redirecting
- [ ] Add active plugin count badge and capability shortcuts to `Sidebar`
- **Done When**: Visiting `/` renders the dashboard with installed plugins and system status.

---

## Phase 5: Verification & Quality Gates
- [ ] Full frontend Vitest execution
- [ ] SSSS schema and conformance validation
- [ ] Remote quality gates on Mac mini mesh node (`macmini`)

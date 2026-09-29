---
type: project_document
title: PLUGIN_SHOWCASE_UI — Project Tracker
description: Detailed task checklist for Total Recall plugin showcase, component previews, peer reviews, and core decoupling.
timestamp: 2026-09-28T20:39:00Z
tags: [project-management, tracker, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Project Tracker

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-28

---

## ✅ Phase D: Discovery & Governance
- [x] [Audit](PLUGIN_SHOWCASE_UI_AUDIT.md) — Comprehensive audit of frontend, routes, plugins, and core extraction mandate (M)
- [x] [PRD](PLUGIN_SHOWCASE_UI_PRD.md) — Product requirements for showcase, previews, reviews, and core memory invariant (S)
- [x] [Architecture](PLUGIN_SHOWCASE_UI_ARCHITECTURE.md) — Component topology, preview registry, SSSS schemas, and API design (S)
- [x] [Development Plan](PLUGIN_SHOWCASE_UI_DEVELOPMENT_PLAN.md) — Phased rollout from server APIs to UI showcase (S)
- [x] Project Tracker initialized with random UUID (S)
- [x] Saved core memory invariant (`invariants-751c38c6.md`) and UI preference (`preferences-e5abefba.md`) to Total Recall vault (S)

---

## ⏳ Phase 1: Server Review APIs & SSSS Schemas
- [ ] Add `plugin_review` primitive support to `src/server/routes/plugins.mjs` (M)
- [ ] Add `GET /api/plugins/:id/reviews` endpoint (S)
- [ ] Add `POST /api/plugins/:id/reviews` endpoint with SSSS frontmatter validation (M)
- [ ] Add `GET /api/plugins/:id/conformance` endpoint (S)
- [ ] Add unit tests in `src/server/routes/plugins.spec.mjs` (M)

---

## ⏳ Phase 2: Interactive Component Previews
- [ ] Create `frontend/src/components/plugins/previews/PhonePreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/SigningPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/DomainsPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/DesignPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/TextPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/CodeQualityPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/ComposableCliPreview.tsx` (M)
- [ ] Create `frontend/src/components/plugins/previews/DecisionPreview.tsx` (M)
- [ ] Create preview index and fallback renderer in `frontend/src/components/plugins/previews/index.ts` (S)

---

## ⏳ Phase 3: Plugin Showcase Page Overhaul
- [ ] Build `frontend/src/components/plugins/PluginCard.tsx` with marketing badges and ratings (M)
- [ ] Update `frontend/src/pages/PluginsPage.tsx` with category filters and search bar (L)
- [ ] Add `preview`, `marketing`, and `reviews` tabs to the plugin detail drawer (M)
- [ ] Add peer review submission modal and form (M)
- [ ] Verify `frontend/src/pages/PluginsPage.spec.tsx` passes (M)

---

## ⏳ Phase 4: Primary Dashboard Hub & Navigation
- [ ] Build `frontend/src/pages/DashboardPage.tsx` with Plugin Capability Hub (L)
- [ ] Wire `/` route in `frontend/src/App.tsx` to `DashboardPage` (S)
- [ ] Add plugin status indicator and capability badges to `Sidebar` (S)
- [ ] Verify dashboard tests in `frontend/src/pages/DashboardPage.spec.tsx` (M)

---

## ⏳ Phase 5: Verification & Verification
- [ ] Run full frontend test suite (vitest) on Mac mini mesh node (M)
- [ ] Verify 0 regressions across existing routes (M)
- [ ] Commit and sync documentation (S)

---

## Verification Log
- 2026-09-28: Project created under prefix `PLUGIN_SHOWCASE_UI`. Saved core memory invariant to Total Recall vault. Audit, PRD, Architecture, Plan, and Tracker created.

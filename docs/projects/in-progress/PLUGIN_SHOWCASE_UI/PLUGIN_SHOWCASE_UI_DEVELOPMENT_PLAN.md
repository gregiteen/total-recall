---
type: project_document
title: PLUGIN_SHOWCASE_UI — Development Plan
description: Phased implementation plan for Total Recall plugin showcase, interactive previews, peer reviews, and core decoupling.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, development-plan, total-recall, plugins, ui, frontend, ssss]
---

# PLUGIN_SHOWCASE_UI — Development Plan

> **Project Prefix**: `PLUGIN_SHOWCASE_UI` · **Project ID**: `8dcccc83-ff9a-4804-b2d0-dcc3304fb92d`
> **Repository**: `total-recall`
> **Kanban State**: 🚧 In progress
> **Author**: Antigravity with Greg Iteen
> **Date**: 2026-09-30
> **Reconciliation**: Codex; original authorship and historical text retained below


> **Based on audit**: [PLUGIN_SHOWCASE_UI_AUDIT.md](PLUGIN_SHOWCASE_UI_AUDIT.md), reconciled 2026-09-30.

> **Product-scope qualification (PIC-023):** Genuine opt-in authenticated authored review text is a proposed reconciliation of contradictory project requirements. This documentation does not establish Greg's approval of additional social features. Review schema/storage/provenance corrections repair existing defects; enabling expanded reviews or numerical ratings requires explicit requirements agreement. All review-specific target requirements below are conditional on that agreement. Measured artifact-bound conformance remains separate from user opinion.

## Authoritative correction sequence

The historical plan below is superseded. Its `node --test` completion command and render-only gates are insufficient for this Vitest project. Discover current repo gate commands from the test and code-quality skills, ship the complete intended snapshot, and execute suites/gates as one-shot background jobs on the Mac mini. Do not claim completion from cached reports.

### Phase 0 — Audit and traceability

- [x] Reconcile the five showcase documents against reviewed source and prior Mac mini baseline.
- [ ] Record the exact artifact/snapshot digest and durable logs for each subsequent gate.

### Phase 1 — Real review state and honest verification (PIC-002–005)

- [ ] Register the review extension through the canonical SSSS registry and add actual validation tests.
- [ ] Align write category, read projection, identity provenance, update/delete ownership, and conflict handling.
- [ ] Exercise authenticated review create/read/update/delete against the real writer, including restart and rejected writes.
- [ ] Replace positive conformance defaults and body-controlled verification with evidence tied to artifact identity.
- [ ] Update route inventory, API client, tests, and contract documentation for the final route set.

**Done when:** An isolated real vault round trip passes, invalid/unauthorized mutations fail, missing evidence stays unverified, and route inventory matches executable routes.

### Phase 2 — Remove fabricated capability previews (PIC-001)

- [ ] Inventory all eight current host preview components and their static operational claims.
- [ ] Implement the generic installed-plugin UI loading contract and honest unavailable/error states.
- [ ] Replace/remove the host copies and connect PluginsPage to the actual installed plugin UI.
- [ ] For each capability, verify real data and operational handlers in its owning installed plugin; do not replace missing integrations with simulations.

**Done when:** Each enabled action performs its advertised capability with real state, and unsupported/unconfigured capabilities cannot appear connected, passed, or delivered.

### Phase 3 — Showcase, dashboard, and sharing

- [ ] Build the cards, search, filters, drawer, review form, and dashboard capability hub around actual installed plugin state.
- [ ] Show evidence provenance and unverified status alongside publisher descriptions.
- [ ] Verify both private mesh discovery and public person-to-person sender/recipient plugin exchange.

**Done when:** A clean user can discover, inspect, install, and operate a functional plugin, with the correct artifact identity and trustworthy review/evidence states.

### Phase 4 — Verification and documentation closure (PIC-021)

- [ ] Run the complete intended source snapshot through full Vitest and configured quality gates on the Mac mini.
- [ ] Perform installed UI and real review persistence walkthroughs; obtain separate live-provider evidence wherever delivery is claimed.
- [ ] Audit all product source for stubs, fabricated data, placeholder handlers, and unfinished advertised functionality; keep isolated test fixtures separate from product behavior.
- [ ] Record logs, environment, digest, counts, command and exit status; update the tracker only after evidence exists.
- [ ] Reconcile root handoff and related project docs before marking this project complete.

**Done when:** Every known correction has verified disposition and no operational success claim exceeds its evidence. No release or deployment is authorized by this planning document.

## Cross-project requirement reconciliation (PIC-023)

`PLUGIN_P2P` historically forbade ratings/reviews/verified badges while this project's historical PRD requested them. That contradictory instruction set helped produce disconnected trust features. Current target: no invented social proof or manifest-only verified badge. Authenticated review text is a planned opt-in capability, subject to registered schema, actual persistence round trips, and identity provenance. Numerical ratings and aggregate stars must not be presented as established product functionality; expose them only after requirements agree and their real data path is verified. Verification evidence remains distinct from user opinion. This aligns with the dated P2P reconciliation and makes no deployment claim.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded by the reconciliation above

The following original planning text is retained for traceability. It is not an assertion of current implementation, verified plugin status, or operational readiness.


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

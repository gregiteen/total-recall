# MESH_CARD_BESPOKE — Development Plan

> **Project Prefix**: `MESH_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Sonnet 5.5 agent
> **Date**: 2026-10-23
> **Based on audit**: MESH_CARD_BESPOKE_AUDIT.md (Complete)

## Phase 0 — Audit ✅
- [x] Capture real `status`, `doctor`, `leader` payloads; record MS-01…MS-12

## Phase 1 — Planning ✅
- [x] PRD (MSR-1…MSR-12), architecture, this plan

## Phase 2 — Real payloads
- [ ] Delete the seeded telemetry object, the `|| 4` fallback and the regex parsing
- [ ] Read `status`, `doctor`, `leader` as JSON, each failing independently

## Phase 3 — Fleet and verdict
- [ ] Verdict in documented order; figures with em dash + reason when unknown
- [ ] Node list ordered by consequence with three separate state words

## Phase 4 — Control and Capability screens
- [ ] Control: server verification, enrollment, leader
- [ ] Capability: runtimes and harnesses per node

## Phase 5 — Design and manifest
- [ ] Rewrite `ui/DESIGN.md` for Headscale (remove `Ghost Net` and `[GHOST//NET]`)
- [ ] Confirm one card element; `plugin info mesh` valid

## Phase 6 — Verification
- [ ] Render against the real live payload and against 6 constructed fault cases; 0 page errors
- [ ] Plugin test suite green
- [ ] Sync scaffold copy with the owner tool
- [ ] Rendered image inspected on the dashboard's dark tokens

---
type: project_document
title: PLUGIN_IMPLEMENTATION_CORRECTIONS — Development Plan
description: Dependency ordered corrections and proof gates for audited plugin failures.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, development-plan, plugins, corrections]
---

# PLUGIN_IMPLEMENTATION_CORRECTIONS — Development Plan

Implementation has not started in this reconciliation. [Tracker](PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md) owns central status; repository trackers own file-level repairs.

## Phase 0 — Evidence and baseline

- [x] Record bounded audit, document custody and prior Mac mini results.
- [x] Reopen source-disproved completion claims in affected documents.
- [ ] Snapshot complete current trees and run fresh external baselines on Mac mini; preserve concurrent work and hidden scaffold files.
- [ ] Attach precise revisions/redacted logs and assign personnel to repository owner roles.

Gate: reproducible baseline per owner and every finding mapped. Static review is not a runtime baseline.

## Phase 1 — State integrity and honest outcomes

- [ ] Showcase: valid review extension, canonical path, authenticated author, artifact-bound conformance and route inventory (PIC-002–005/020).
- [ ] Alerts: URL/secret selection, strict email receipts, operational Telegram/Expo and failure exits (PIC-006–008).
- [ ] Search: actual save result/running-host resolution and validated shared settings (PIC-009/011/022).
- [ ] External owners: durable STOP enforcement, decision state/hash/parser, composable rollback hash/registry, signing state/recovery (PIC-033–037/042/044–046).
- [ ] Test actual validator/operation round trips; synthetic malformed responses, failures, timeouts, duplicates and restart first.

Gate: no reviewed path claims save, delivery, identity or verification without actual evidence; persistence uses the contract.

## Phase 2 — Runtime and commands

- [ ] DSH: identity-checked configured discovery, authoritative tools and real metrics (PIC-015–017).
- [ ] Search: truthful engine health and complete deep report (PIC-010/012).
- [ ] Git Sentinel: preserve porcelain columns, distinguish upstream/error states (PIC-018).
- [ ] Phone: replace five handler stubs and validate event persistence (PIC-030–032).
- [ ] Domains, Signing, Design and Composable: implement advertised dispatch, actual tests and registration/promotion (PIC-036/038–039/043/048–049).

Gate: clean installed commands work, advertisements match registrations, errors produce honest statuses and runtime identity/lifecycle is demonstrated.

## Phase 3 — Functional UI and composition

- [ ] Actual host context generator contract (PIC-013).
- [ ] Valid DSH/search source/token adapters and installed UI mounts (PIC-014/017).
- [ ] Real plugin-owned actions/projections replace fabricated previews (PIC-001/040/047/049).
- [ ] Canonical scaffolder and independent operational runtime replace ready-printing shell; functional gates replace file existence (PIC-019).
- [ ] Installed walkthrough covers loading/unavailable/error/recovery/action-to-state behavior.

Gate: UI operates on CLI/task state; composed app independently boots and performs its advertised workflow.

## Phase 4 — Distribution and final acceptance

- [ ] Resolve P2P/showcase trust requirements as a reviewable product decision (PIC-004/023).
- [ ] Prove public sender/recipient install, digest/tamper rejection, privacy and provenance.
- [ ] Close all local findings and remaining original scope; verify operational extraction provenance and generic config.
- [ ] Fresh full suite/repository gates in background on Mac mini; native boot and installed walkthrough.
- [ ] Match every checked item to revision/command/result/digest evidence before any release.

Gate: all blocking findings closed and required walkthroughs pass. Publishing follows existing release protocol when requested. Serialize shared schema/manifest/interfaces; parallelize independent owners. Additional failures become tracked repairs, never successful fallbacks.

## PIC-050 — JSX preview registry cannot compile

- [x] Correct the untracked preview registry's `.ts` extension while preserving its contents and existing imports, then rerun the real frontend build on Mac mini.

Evidence: Mac mini `/tmp/tr-agent-operations-20260930/frontend-build.log`, exit2, TypeScript JSX parser errors in `frontend/src/components/plugins/previews/index.ts:63–83`. Full source read confirms JSX in a `.ts` module; source search finds no explicit `index.ts` import that would need rewriting. The surrounding preview feature/readiness remains subject to existing PIC preview findings; a successful compilation will not certify those components as live integrations. This continuation was recorded before the narrow filename correction.

## PIC-051 — Fabricated phone preview call status and personal machine

- [ ] Remove the static active-call timer, connected peer claim and idle status; disable the unwired call control and label the component as a visual preview. Run the frontend build and package gates on Mac mini. This removes false evidence; actual installed calling remains open under PIC-030–032.

Evidence: full remote quality gate exited1 solely on TR-SHIP-004 at PhonePreview.tsx:100. Source contains a literal 00:42 timer, connection text, idle badge and button without handler. Full backend suite passed within the same gate. Recorded before edits.

## Authorized parallel execution — October 1, 2026

Greg requested all remaining proposed-plugin work analyzed and implemented in parallel through cli-agents; he selected DSH DeepSeek flash for lower-cost bounded tasks. First reconcile source against historical findings, establish exact-tree Mac mini baselines, then assign disjoint repository/file owners. Use explicit prompts, synthetic failure regressions before wiring, researched current provider contracts, and parent-reviewed changes. Shared SSSS schema/host interfaces and machine-wide quality gates are serialized. Preserve all existing dirty plugin trees. Worker completion, passing tests, installed behavior and provider delivery are separate evidence. All original remaining scope stays active; no automatic deferrals or readiness claims.

PIC-052: Replace the fabricated Automations schedule cards with an installable user-automations plugin. Add a read-only, authenticated local and mesh task inventory derived from installed plugin manifests and persisted task slots; report offline, unsupported and unavailable nodes without filling gaps. Provide a plugin CLI list command and token-styled custom element. Keep OS cron/process maintenance outside this user-automation view. Verify with exact-tree Mac mini tests, then inspect the live UI before claiming deployment.

PIC-052 placement correction: mount the plugin's custom element in its Plugins page detail preview. Remove the Automations navigation and page; redirect the legacy URL to the plugin detail view.

PIC-052 core-boundary correction: delete the user-automations-specific core module and HTTP routes. Add only a generic mesh-installed-plugin metadata endpoint under the existing mesh plugin router. Move inventory composition, peer status handling, and CLI output into `plugins/user-automations`. Have its custom element call the generic authenticated plugin runner. Verify peer access, unavailable states, and the plugin detail view without presenting a scheduler slot as a completed job.

PIC-053: Extend `total-recall plugin create` with opt-in `--with-task` and `--with-ui` scaffolds. Require a valid five-field schedule and command for a task, and generate a self-contained custom element with parsed DESIGN.md tokens for UI. Validate the generated manifest and UI files, add focused creator tests, and make the command print the install step. Keep generated capability handlers honest until implemented.

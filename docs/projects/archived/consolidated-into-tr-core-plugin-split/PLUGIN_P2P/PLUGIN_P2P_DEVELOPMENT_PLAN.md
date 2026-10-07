---
type: project_document
title: PLUGIN_P2P — Development Plan
description: Development Plan with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# PLUGIN_P2P — Development Plan

> **Project Prefix**: `PLUGIN_P2P`
> **Kanban State**: In progress — corrections and verification pending
> **Date**: 2026-09-30
> **Reconciliation author**: Codex
> **Based on audit**: [PLUGIN_P2P_AUDIT.md](PLUGIN_P2P_AUDIT.md), current reconciliation

## Current correction plan

### Phase 0 — Reconcile scope and evidence

- [x] Update all five P2P documents to distinguish historical implementation claims from current verification.
- [ ] Resolve the review/rating scope conflict using the proposal above before enabling expanded social features.
- [ ] Record complete intended source and installed package digests plus current environment.

### Phase 1 — Integrity, privacy, and authorship

- [ ] Add/confirm packaged artifact tests for checksums over fetched, decoded, and installed bytes, including modified-since-install state.
- [ ] Test tampered bundle/header/pin, invalid manifest, traversal, symlinks, excessive size/file count, interrupted writes, and cleanup without false success events.
- [ ] Test public opt-in, private/mesh-only isolation, unshare revocation, and accidental secret/private-state inclusion.
- [ ] Test author/provenance display; ensure manifest author is an assertion and checksum is not authenticated author identity.
- [ ] Apply PIC-002–005 review/evidence corrections with real state tests before any opt-in review feature becomes operational.

### Phase 2 — Genuine public exchange

- [ ] Use independent sender/recipient environments with no shared mesh and the packaged installed plugin.
- [ ] Sender shares explicitly; recipient inspects provenance, verifies checksum, installs, opens real UI, and executes a real plugin command.
- [ ] Verify sender unshare behavior and recipient handling of changed artifact hashes.
- [ ] Record installed artifact digest, environment/date, actual outputs/exit status, sanitized logs and capability limitations.

### Phase 3 — Final verification

- [ ] Run full Vitest and configured quality gates as background jobs on the Mac mini against the complete intended snapshot.
- [ ] Verify native backend boot and installed-plugin/public-exchange walkthrough independently of mocked tests.
- [ ] Reconcile this tracker, showcase tracker, central correction tracker and handoff with actual evidence before readiness claims.

**Done when:** Distribution, privacy, installed capability and trust display match their evidence, requirements agree, and current public cross-user exchange is demonstrated. No deployment is authorized by this planning document. Existing open live checks remain active work.

## Requirement conflict and reviewable resolution (PIC-023)

Historical P2P requirements prohibited all ratings, reviews, and verified fields. The later showcase requirements requested real user reviews and conformance displays. Those documents gave agents contradictory instructions. The proposed resolution is genuine opt-in, authenticated authored review text, separate from artifact-bound measured conformance evidence. Neither publisher assertions nor user opinion may generate a verified badge. Invented stars, download numbers, review totals, fabricated status, and manifest-only verification remain prohibited. This is a documented proposal for review, not a claim that Greg approved additional product scope. Numerical ratings and aggregate stars remain outside the agreed correction scope until this conflict is explicitly resolved.

Public person-to-person sharing among independent Total Recall users is the requirement. Private mesh sharing is an additional own-device capability and cannot substitute for the public sender-to-recipient path. A checksum establishes byte integrity; it does not establish author identity, safety, live capability, or independent verification.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded where inconsistent

Original text is retained for traceability. Dated source/test assertions are historical evidence, not certification of the current installed artifact. The reconciliation above controls current planning; no additional product scope is approved by its existence.

# PLUGIN_P2P — Development Plan

> **Project Prefix**: `PLUGIN_P2P` · **Date**: 2026-09-22

## Phase 1 — Stop the bleeding (stability + honesty)
- [ ] Remove `CURATED_CATALOG`, ratings storage/endpoint, all rating/review/install/verified fields (REST, CLI, types, UI).
- [ ] Fix `const generatorPath` reassignment in `plugin-context.mjs`.
- [ ] Out-of-process runner (`plugin-runner.mjs`); `/run` requires `config:write`.
- [ ] Remove `root`/`projectRoot` request overrides.

**Done when:** S1 grep is empty; runner spec shows a `process.exit(1)` plugin returns output and the server keeps serving.

## Phase 2 — Layout + bundled plugins
- [ ] Plugin dirs → `skills/total-recall/plugins/` (project + global).
- [ ] Move `.agent/plugins/*` → `plugins/*`; add `plugins/` to package `files`.
- [ ] Fix meta-harness import (`TR_PACKAGE_ROOT`), system-monitor node count, honest authorship.
- [ ] `use_cases` + task `command` in validator and JSON schema; bundled manifests updated.

**Done when:** `plugin available` lists 4 bundled plugins; each installs into a temp project (spec S2).

## Phase 3 — Store, records, events
- [ ] `PluginRecordSchema` registered.
- [ ] `plugin-bundle.mjs` (hash/pack/unpack) + specs.
- [ ] `plugin-store.mjs` install/remove/share writing records + events; CLI and REST both call it.

**Done when:** spec S7 passes.

## Phase 4 — P2P
- [ ] `plugins-mesh.mjs` peer routes.
- [ ] `plugin-peers.mjs` listing + fetch/verify.
- [ ] `peer:<host>/<id>` install source; CLI `peers`, `share`, `unshare`.

**Done when:** S3/S4 specs pass; live peer check reported honestly.

## Phase 5 — Tasks
- [ ] `plugin-tasks.mjs` cron matcher + due runner, wired into `daemon-loop.mjs`.

**Done when:** S6 spec passes.

## Phase 6 — Dashboard
- [ ] Rewrite `PluginsPage.tsx` into Installed / Bundled / On the mesh; use-case filter; share toggle; provenance + hash display.

**Done when:** page renders in preview with real data; component spec updated.

## Phase 7 — Verify
- [ ] Full vitest suite (Mac mini per standing rule), boot `node src/server/index.mjs`, code-quality gates in background.
- [ ] Rebuild frontend dist (dist freshness gate).

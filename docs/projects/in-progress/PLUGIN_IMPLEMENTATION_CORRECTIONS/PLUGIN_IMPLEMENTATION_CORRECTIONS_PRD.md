---
type: project_document
title: PLUGIN_IMPLEMENTATION_CORRECTIONS — Requirements
description: Functional plugin and truthful readiness requirements derived from the September 30 audit.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, prd, plugins, corrections]
---

# PLUGIN_IMPLEMENTATION_CORRECTIONS — Requirements

Status: In progress. [Audit](PLUGIN_IMPLEMENTATION_CORRECTIONS_AUDIT.md) precedes this plan. Implementation is open.

## Problem and outcome

Plugin declarations, client tests and static displays have been counted as operational features. Users can receive success after an unimplemented operation, a failed save or an invalid provider response. Reviews cannot complete the actual SSSS write/read path. Documentation remains present, but several completion claims are unsupported.

The required outcome is a working installed plugin whose command, task, state and UI reflect real operations. Missing configuration, unknown state and failure must be explicit. Production features cannot use successful stubs, invented data, fixed health badges or inert controls. Synthetic fixtures remain valid in isolated tests; they are never product results.

## Scope and requirements

1. Close PIC-001–023 and every mapped external finding in the [tracker](PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Fix state, provider/status/save correctness before polish.
2. Preserve repository-owned source and five-file documentation. Extract operational implementations with provenance; retain generic host interfaces and configurable device/provider fields.
3. Use validated SSSS document/operation contracts for persistent configuration, reviews, decisions, communications and events. Secrets stay in the encrypted store; projections remain rebuildable.
4. Implement plugin-owned functional UI and consume validated adapters through the actual installed host. Source existence or manifest registration alone is insufficient.
5. Distinguish unavailable, pending, accepted, delivered and failed. A transport receipt cannot establish delivery; a shell exit cannot establish durable state without verifying the operation.
6. Keep public person-to-person sharing independent of private mesh membership. Prove bundle integrity, ownership and exclusion of private state.
7. Resolve conflicting trust requirements. Proposed reconciliation: genuine optional authored reviews require authenticated provenance; measured conformance requires artifact-bound evidence. This does not claim newly approved social features. Unsupported ratings/badges remain unavailable.

## Acceptance

| Area | Required evidence |
|---|---|
| CLI/task | Installed dispatch; malformed config, failures, timeout and nonzero exit cases |
| State | Actual validator/operation path; round trip, restart/replay, authorization and invalid-input rejection |
| Provider/runtime | Official contract verification before adapter changes; controlled real operation under existing authorization; actual receipt/identity |
| UI | Installed manifest mount; actual data/actions; loading, unavailable, failure and recovery states |
| Conformance | Digest, date, environment, commands, exits/results and verifier; absent proof is unknown |
| Release | Fresh background Mac mini full suite/gates, native server boot, clean install and public exchange walkthrough |

Every closure links source revision and executable evidence. External static findings do not certify unreviewed code. Code Quality's historically completed runner remains historical; new UI requirements have separate acceptance. The current documentation request plans repairs without implementing, publishing or deploying them.

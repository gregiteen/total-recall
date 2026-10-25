# TOTAL_RECALL_LAUNCH_PLAN — Development Plan

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

## Priority order

LR-1 current follow-up: close the outstanding status/lifecycle identity mismatch using a shared observer, explicit conflict/unknown state and safe start refusal. Verify adversarial lock/entry cases, CLI presentation, full Mini suite and configured gates; record source evidence and push the whole tree. Other agents retain plugin ownership. API/provider/harness/launch work remains in progress.

DEV-API-06 completed source stage: unified composed execution scope resolution with static group discovery and the selected-brain owner; exact memberships, shadow precedence, nested and `.agents` selection, and explicit root overrides are verified. Actual full-key HTTP composed effects/argv/failures and restricted denial pass. Final combined-source Mini suite2391 tests/374 files,111 focused tests and8 quality gates pass, actual exits0; source hashes match before/after. Evidence records concurrent runner preservation and publication. Plugin repositories remain assigned to the other active agent. Provider budgets, broader confined owners and launch acceptance remain in progress.

DEV-API-05 current batch: add strict registry/toggle reads for authorization, bind restricted project UUID grants to verified canonical brains, share the existing read/fact adapters and mutation serialization, filter discovery, and cancel changed bindings. Verify two-project isolation, no implicit server access, scope/issuer denial, unsafe/mismatched/duplicate IDs, disabled/unregistered targets and running-work revocation. Keep existing CLI identity/brain/auth controls. Run focused/full Mini suites and configured gates, document source evidence and publish the whole tree.

DEV-API-04 current batch: close the in-process decision cancellation gap using the existing bounded executor and owner APIs. Verify both success shapes, missing credentials/provider failure, timeout/output caps, running-work revocation and sanitized errors using real child executions with disposable owner adapters. Run focused/full Mini suites and configured gates, update evidence and publish the complete working tree. Provider spending limits, broader restricted workflows and launch acceptance remain open.

DEV-API-03 completed source stage: fact-only server-brain creation through the shared validated memory owner, exact input/target schemas, generated paths, create-only principal and generator-free indexing. Evidence records actual HTTP write/read, CLI and Mini suite/gate verification. Generic restricted owner adapters and provider quotas remain unfinished work within this plan.

October 24 reconciliation: the PRD scope correction and audit SCOPE-RECONCILE-01 govern this plan. Gro owns public CRM skills/gateway, integrated DSH delivery and optional seller-memory integration. No DSH bundle into TR or cloud-hosting prerequisite is added here. DEV-API-01 now resolves invoke disposition: retain the optional TR developer API and harden authority through dispatch. Historical evidence below is not fresh runtime certification.

### Next implementation batch — DEV-API-01

DEV-API-02 first closes current authority leaks: explicit modes and migration, fresh role/lifecycle/issuer checks, catalog validation, fixed restricted recall adapter, bounded children, truthful outcomes and matching discovery. Restricted write and arbitrary owner execution remain denied until their confinement is implemented; keep the complete acceptance item open.

1. Map existing auth role/key contracts, CLI/plugin/composed command catalogs, argument parsing, brain selection and child execution. Finalize the PRD API-1–API-6 contract, including current-key migration, explicit full/restricted modes, credential/target grants and running-work revocation behavior. Reuse the auth owner; do not invent a parallel key store.
2. Enforce registered-command and target/argument authorization, then propagate the caller's execution context through CLI/plugin/composed operations. Preserve intentional full developer capabilities. Restricted execution fails closed where an owner cannot enforce its grants; disallow privilege expansion through nested commands, flags or delegation.
3. Bound timeout/concurrency/output/provider spending and normalize actual failures/termination. Audit caller, authorized target/operation and outcome without secrets. Validate capability discovery against executable permissions.
4. On the mini, prove explicit full access, restricted read/write workflows, cross-brain denial, blocked administrative escalation, composed/plugin enforcement, expiry/revocation/delegation, execution limits and an independent-agent round trip. Keep a separate server-free memory acceptance. Do not weaken a denial test to accommodate an unenforced capability.
5. Write the developer guide from verified behavior: local CLI vs optional local server/private mesh/hosted API, grants, examples and limits. Run required TR gates and include the tested API in packaging/upgrade/launch evidence. No delivery claim or production/package change is made by this documentation update.

This is work within the existing six streams: LR-3 for brain/instruction behavior, LR-5 for generic owner execution contracts, LR-2/LR-4 for release/package integrity, LR-6 for independent-agent and local-only acceptance. Gro's seller API and DSH image remain outside this batch.

Ordered by dependency, not by effort. LR-1 first because nothing is provable while the runtime cannot identify itself; LR-6 last because it verifies everything before it.

| Phase | Workstream | Gate | Status |
| --- | --- | --- | --- |
| 0 | Consolidation | R1–R5 | **Complete** (this plan) |
| 1 | LR-1 Runtime truth | L1 | Identity fixes recorded; status ownership and harness readback remain |
| 2 | LR-2 Release propagation | L2, L5 | Local version gap closed; fleet and upgrade acceptance open |
| 3 | LR-3 Memory and instruction contract | L3 | Telemetry added; sync/version reconciliation open; old overflow blocker superseded |
| 4 | LR-4 Packaging safety | R20–R22 | Source repairs recorded; per-path certification and shipped artifact open |
| 5 | LR-5 Plugin, brick and card contract | — | Mostly complete |
| 6 | LR-6 Launch acceptance | L6 | Not started |

## Phase 0 — Consolidation

- [x] Audit all 13 in-progress projects and record current evidence — [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md)
- [x] Resolve the conflicts and name the superseded requirement for each — PRD §4
- [x] Establish six workstreams with one owner each — ARCHITECTURE §2
- [x] Build the source register mapping every predecessor item to exactly one workstream — [`LAUNCH_SOURCE_REGISTER.md`](LAUNCH_SOURCE_REGISTER.md)
- [x] Archive the 13 predecessors under `archived/consolidated-into-total-recall-launch-plan/`, marked consolidated and never complete
- [x] Reconcile `docs/projects/README.md` to name the same single owner (R5)
- [x] Stop shipping the deleted card model: correct every document that teaches `card_layout` (R17)

## Phase 1 — LR-1: Runtime truth

**Gate L1**: `startup check --json` reports `shared_ready: true` on the sanctioned host, and `status` agrees with it.

- [x] Resolve the recorded foreign-PID daemon lock conflict — tracker LR-1 and `evidence/LR-1-remediation.md`; original conflict retained in the audit.
- [x] Resolve the recorded `server-process-unverified` cwd defect — tracker LR-1 and regression evidence; not a claim about every installed runtime.
- [x] Make `status` and `startup check` read the **same** authority for daemon state (R7) — shared canonical observer and lifecycle refusal; [source evidence](evidence/LR-1-shared-daemon-identity.md).
- [ ] Prove the surface actually written is the surface a harness reads, for both layers (R13) — inherits `SURFACE_COMPILATION_FIX`'s central defect and `TR_CORE_PLUGIN_SPLIT`'s `TR_CORE_PLUGIN_SPLIT_SURFACE_DIR_AUDIT.md`
- [x] Add the recorded startup/surface regression coverage — tracker LR-1, 5 added cases; actual harness readback remains open above.
- [x] Record the original `startup check --json` artifact, host and source — LR-1 remediation evidence. Repeat on the actual release candidate before delivery.

**Do not** treat a healthy container, a running daemon, or a 200 response as proof of one another. Each is a distinct claim.

## Phase 2 — LR-2: Release propagation

**Gate L2/L5**: the installed CLI equals the published version, independently verified, and an upgrade preserves state.

- [x] Close the recorded local `3.40.4` → `3.40.7` gap — tracker LR-2. This does not certify other consumers or a later package.
- [ ] Verify per surface, not in aggregate: published artifact, tag, installed CLI, and each registered consumer (R8) — inherits `UNIFORM_BRAIN_UPDATES`
- [ ] Report a failed or stale consumer explicitly; never print success for a partial rollout (R10)
- [ ] Prove an upgrade preserves memories, vault content, configuration and plugin state (R9)
- [ ] Prove an interrupted upgrade is recoverable (R9)
- [ ] Reconcile the `UNIFORM_BRAIN_UPDATES` open item: its rollout was executed outside its own project, so its tracker is stale rather than wrong
- [ ] Record the artifact: resolved version per consumer, with a failure list

## Phase 3 — LR-3: Memory and instruction contract

**Gate L3**: instruction surfaces report `In sync: yes`, and the capsule reaches `ready: true` within budget.

- [x] Supersede the old **D2** overflow blocker: tracker telemetry records 0% overflow at the configured 16,000 budget. This is a measured project setting, not a newly approved universal default; curation and sync remain separate work.
- [ ] Reconcile archived TR-003 and remaining stale readiness statements against telemetry; record current per-action samples for release acceptance.
- [ ] Reconcile instruction surfaces **from the scaffold as the publish source**; never hand-edit the live copy (R12). Current state: local 28,192 bytes vs remote 24,897, `In sync: no`, `never` synced, no targets (audit §2.4, C6)
- [ ] Resolve the three-way skill/entrypoint version skew recorded in TR-006
- [ ] Make the capsule name its required set and overage when it overflows (R14)
- [ ] Decide whether the duplicated `AGENTS.md` directive block (8,765 of 9,349 bytes, 94%) stays compiled into the surface
- [ ] Record the artifact: capsule token count per action, and `In sync: yes` with the sync targets named

## Phase 4 — LR-4: Packaging safety

**Gate**: no distributed artifact contains private state, proven per path.

- [ ] Publish the unpublished fix so the **installed package** stops carrying the old private-state copy behavior (R22) — currently the leak is fixed in source but not shipped
- [ ] Certify **every** path independently: export, import, scaffold, install, `skill deploy`, sharing (R21)
- [ ] Reconcile the `--from-skill` path: `src/cli/plugin/create.mjs:163` reads `SKILL.md` and parses frontmatter through a path separate from the shared exclusion predicate (audit §2.5, C3)
- [x] Reconcile the scaffolder's generated-UI claim — tracker records removal of the unreachable generator and explicit hand-authored face guidance; keep any credential-specific/per-path certification open under R21.
- [x] Make a new scaffold report its unfinished face honestly — tracker records `scaffold: true` and working creation. This does not certify a finished plugin UI.
- [ ] Relocate or remove the 46 MB `browser-profile` from the skill directory
- [ ] Add a scan that asserts no private-state path matches a distributed artifact
- [ ] Record the artifact: the per-path scan result and the installed-package hash

## Phase 5 — LR-5: Plugin, brick and card contract

Mostly satisfied. This phase **finishes and stops teaching the wrong model**.

- [x] Core contains no layout vocabulary (R16) — verified: 0 matches for `CARD_TEMPLATES`, `CARD_WIDGETS`, `WidgetKind`, `CardRegion` in `src/`
- [x] `card_layout` is a validation error (R15) — `src/core/plugin-contracts/card.mjs:109`
- [x] 0 of 34 plugins declare `card_layout` — verified
- [x] Three card faces complete and verified independently: `git-sentinel` (625 lines), `stripe` (790), `system-monitor` (655), each with `ui/DESIGN.md`
- [ ] **Correct every shipped document that teaches the deleted model** (R17): `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176–189` (the 7-template list and the `card_layout` example) is the primary offender; `PLUGIN_UI_OVERHAUL`'s Recipe Contract follows
- [x] Settle **D1**: one bespoke face may coexist with as many plugin-owned panels as needed; tracker records owner approval and regression coverage (`0062229`).
- [ ] Make `ui` optional for a **brick** while a **plugin** still requires exactly one bespoke face (the two requirement sets in ARCHITECTURE §2, LR-5) — this is the unresolved hinge from 2026-10-23T23:47Z
- [ ] Add `capability { entry, exports }` to the manifest contract, and `pluginBundleFiles(dir, {audience})` with `plugin` and `brick` selection
- [ ] Extract `capability/index.mjs` for the first brick (`stripe`): exported functions, explicit parameters, injected transport, no `example.com` placeholders, no example defaults
- [ ] Prove a vendored brick runs with `TOTAL_RECALL_BIN=/nonexistent`, contains no `ui/`, no `card.js`, and no reachable `total-recall` string
- [ ] Finish the `mesh` card face — the only card workstream with open items
- [ ] Accept the per-plugin faces as **design work in progress, not a launch gate**. 34 hand-authored faces are not required to launch (PRD §5)
- [ ] Correct the plugin count everywhere to **34** (documents currently say 29/30/32/33/34)
- [ ] Record the artifact: validator output over all manifests, and the brick exclusion proof

## Phase 6 — LR-6: Launch acceptance

**Gate L6**: one complete journey passes end to end, recorded as one artifact.

- [ ] Write and run [`LAUNCH_ACCEPTANCE_JOURNEY.md`](LAUNCH_ACCEPTANCE_JOURNEY.md): clean install → working brain → plugin use → memory written and recalled → upgrade → recall intact → runtime healthy
- [ ] Verify installation instructions against the published package **from a clean machine** (R24)
- [ ] Reconcile public claims to demonstrated behavior only; label planned integrations as planned (R23) — inherits `TR_MARKETING_LAUNCH`
- [x] **DEV-API-01 / disposition:** owner approved retaining `/v1/invoke` as an optional TR developer API, with explicit full access and restricted keys; it is not Gro's gateway, a cloud prerequisite or a DSH-bundle requirement.
- [ ] Implement and verify PRD API-1–API-6 through the batch above; keep current operation-scope checks distinct from completed downstream authority enforcement.
- [ ] Prove the ordinary local remember/recall/context path without a running HTTP server or cloud instance; add that result to the clean-install journey.
- [ ] Close `TR_LAUNCH_HARNESS_DISCOVERY` findings LH-001 (landing ownership) and LH-004 (DSH probe) or drop them as non-launch
- [ ] Verify the final working tree and upstream equality for the tested candidate. The audit's dirty-tree finding is historical; do not reuse it as a current status.
- [ ] Run the sanctioned suites on the **Mac mini** and record the host (R28)
- [ ] Record the artifact: the journey transcript with one host per stage

## Out of scope for launch

Preserved as open items in their own workstream, explicitly **not** launch gates. They must not block:

TR-007 (identity, tenancy, credits, AI gateway, app-shell, enrichment), TR-009 (monetized service contract, store, payouts, three operated products), TR-010 FC-F/FC-G (brand naming, trademark, provider logos), TR-011 Hello Phone workspace, harness discovery (Pi, Hermes, OpenCode, Goose, OpenHands, Aider), and the 34 per-plugin design folders.

## Sequencing rule

Phases 1 and 2 run first and can run in parallel with each other. Phase 4 does not wait on them. Phase 5 is mostly documentation cleanup. Phase 6 runs last and is the only phase that can declare launch.

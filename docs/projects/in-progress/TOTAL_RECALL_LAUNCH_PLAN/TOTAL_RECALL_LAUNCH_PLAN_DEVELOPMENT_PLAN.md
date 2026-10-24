# TOTAL_RECALL_LAUNCH_PLAN — Development Plan

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

## Priority order

October 24 reconciliation: the PRD scope correction and audit SCOPE-RECONCILE-01 govern this plan. Gro owns public CRM skills/gateway, integrated DSH delivery and optional seller-memory integration. No DSH bundle into TR or cloud-hosting prerequisite is added here. The existing TR invoke route is accounted for under LR-6 as a disposition task, not silently made a launch requirement. Historical evidence below is not fresh runtime certification.

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
- [ ] Make `status` and `startup check` read the **same** authority for daemon state (R7)
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
- [ ] **SCOPE-RECONCILE-01 / invoke disposition:** review the existing `69addd2` full-server dispatcher against TR's generic optional-interface boundary; record keep/extract/remove decision and authorization/brain/CLI-dispatch evidence before any new release claim. It is not Gro's CRM gateway, a cloud prerequisite or a DSH-bundle requirement. This pass changes documentation only.
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

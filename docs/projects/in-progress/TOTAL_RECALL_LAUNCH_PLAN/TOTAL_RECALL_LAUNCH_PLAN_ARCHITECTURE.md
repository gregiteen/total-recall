# TOTAL_RECALL_LAUNCH_PLAN — Architecture

PLUGIN-BOUNDARY-01: OKF owns conversion, bundle import/export, compliance, explicit index/log projection and their tests in tr-plugin-okf. Core compatibility CLI entrypoints load its declared active runtime adapter through plugin-runtime. OpenWiki owns seed pages and explicit bootstrap, hubs and ingestion in tr-plugin-openwiki. Core project brain completeness contains no wiki check; core compilation never performs an OKF projection. Generic memory read/validated-write/format services remain host contracts; no second implementation or hidden fallback is retained.

LR-1 artifact integrity: the compiler owns a disposable output manifest under memory-derived, containing relative surface paths, resolved bindings and content hashes. Required paths derive from the selected INSTRUCTIONS.md parent and connected-client registry. Configuration/path changes invalidate inputs; byte/binding mismatches invalidate output reuse. Writes use the existing atomic filesystem owner followed by exact read-back. No canonical memory/state store or plugin adapter is added.

LR-1 follow-up: the startup-health identity owner supplies a shared daemon observation consumed by lifecycle controls and startup. It compares canonical executable entries using the process cwd; unresolved identity fails closed. Status projects that same observation alongside its compatibility string. No additional state, service or plugin contract is introduced.

DEV-API-06: core composed execution resolves the selected project brain through the existing configuration owner, then consumes the static command-surface scope resolver for project, exact-member groups and global fallback. CLI and full invoke consume that same resolution. Commands retain trusted full-host authority; no restricted composed execution is introduced. Verify actual child effects with disposable auth-owned keys and temporary command files. Plugin sources remain owned by the other active agent.

DEV-API-05 implemented target path: shared auth authority → strict existing project registry/toggles → effective UUID scope → canonical project brain and matching brain.json identity → pinned credential-free memory child. UUIDs are operator-assigned existing project identities; paths and display names are not caller selectors. Discovery filters the same bindings and exposes only IDs. Revalidation compares the current canonical brain to the pinned one every250ms and before child dispatch. Registry metadata is configuration, not an additional credential authority; canonical memory writes remain validated SSSS operations. The memory-owner fact schema remains server-neutral: the route passes its resolved brain separately from sanitized fact data, never a caller path.

DEV-API-04 implemented execution: decision route → authority-checked bounded child → installed decision client/shared auth adapter (and action predictor for prediction) → structured result. The HTTP process imports no decision provider/auth client. Full mode retains trusted host authority; it is not a malicious-code sandbox. Process-group termination prevents local provider fallback/retry continuation after authority ends, without promising remote refunds or a provider quota. Decision diagnostics are never exposed in API failures. Prediction uses the selected working directory and server-brain index, retaining the existing host-authority discovery semantics.

DEV-API-03 implemented mutation path: invoke shared-auth policy → fixed server brain and exact fact schema → credential-free bounded trusted child → memory-owner creator → validated SSSS operation with a memory:create principal → local search projection. No CLI bootstrap, surface compilation, plugin generator or paid provider is involved. Paths are generated and create-only; caller metadata cannot change category, modality, target or authority. Symlink checks cover canonical, audit and derived destinations. Post-commit index failure returns explicit committed state. The adapter trusts the host operator and package source; it does not run arbitrary caller code or claim OS sandboxing. The CLI shares this owner through `remember --confined-fact`; its ordinary bootstrap is not an API confinement boundary.

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

## 1. Ownership model

### Product boundary reconciliation, October 24

Local CLI → validated SSSS vault/index/instruction operations is the baseline; no HTTP server or cloud account is required. The optional memory server exposes memory/context/instructions/rules, and the full server hosts additional generic interfaces. Full-server commit `69addd2` currently mounts `/v1/invoke` across CLI, memory, composable and decision operations; the memory-only app does not. DEV-API-01 retains this as an optional developer interface and requires authorization hardening before delivery claims.

### DEV-API-01 target dispatch contract

DEV-API-02 implementation stage uses the existing auth scope registry for explicit modes and revalidates the key and issuer chain at execution boundaries. Restricted retrieval uses a dedicated child entrypoint importing only local search and data parsing; it receives a fixed server brain and a scrubbed environment, never the generic CLI bootstrap. Unsupported restricted owner execution is refused. Full mode is explicitly trusted host administration; it retains nested CLI/plugin/composed authority and is not represented as a sandbox. Child groups, time/output ceilings and concurrency are server controlled. Discovery applies the same policy as execution.

Request → shared-auth principal/grants → registered command resolution → argument and project/brain authorization → execution under the same authority → bounded result and token-free audit. Full developer mode intentionally permits the recorded developer/admin capabilities and targets. Restricted mode exposes only permitted commands and targets; unsupported confinement fails rather than falling back to server authority. Both modes use the same operation catalog and owner implementations; do not duplicate CLI/domain logic inside HTTP handlers.

The execution context must identify the caller, explicit full/restricted mode, command/target/credential grants and lifecycle/resource ceilings. CLI and plugin owners must consume/enforce that context, including nested composed operations. Merely passing a bearer token into an otherwise unrestricted child process is insufficient. Map any native child environment and filesystem access to the grant; do not inherit unrelated server credentials. Verify composed names against the registry and bound argument schemas before execution. Preserve Gro's separate seller authorization policy.

The original implementation used the server environment/package cwd after its operation-scope check; the audit preserves that baseline. DEV-API-02 now gates full host execution with an explicit grant and a scrubbed environment, rechecks key/issuer authority, bounds child execution and denies unsupported restricted adapters. Restricted mutation/owner adapters and provider cost/cancellation acceptance remain required. Existing local/configured mesh binding is not a promise of internet access. The API remains optional and server-free CLI acceptance stays independent.

Gro's separate production graph is seller credential → Gro CRM command gateway → Gro-owned services, plus its pinned native DSH seller image. Public CRM instructions/skills, external-client onboarding and optional seller memory are Gro-owned. Vendorable capability bricks remain a TR responsibility; their use in Gro does not make Gro's endpoints, seller state, DSH image or credential policy part of TR core. See the PRD scope reconciliation and audit SCOPE-RECONCILE-01. Existing generic agent adapters, plugin work and optional private server/mesh use are preserved.

The previous consolidation failed for a structural reason: it named a single owner in prose but left nothing that would **prevent** a new project from appearing. The fix is an explicit custody rule plus a register that is checked, not a better-worded README.

```
docs/projects/
├── README.md                  ← index; names exactly one active project (R5)
├── in-progress/
│   └── TOTAL_RECALL_LAUNCH_PLAN/    ← the ONLY active plan
│       ├── TOTAL_RECALL_LAUNCH_PLAN_{AUDIT,PRD,ARCHITECTURE,DEVELOPMENT_PLAN,PROJECT_TRACKER}.md
│       ├── LAUNCH_SOURCE_REGISTER.md      ← every predecessor item → one workstream
│       ├── LAUNCH_ACCEPTANCE_JOURNEY.md   ← the R26 journey + evidence slots
│       └── evidence/                      ← recorded command output per gate
├── completed/                 ← historical; preserved, not re-certified
└── archived/
    └── consolidated-into-total-recall-launch-plan/   ← the 13 predecessors
```

**Custody rule**: a new `docs/projects/in-progress/<X>/` folder may only be created by this plan naming `<X>` as its successor, or by Greg. A folder is not a workstream. Workstreams live in this plan's tracker.

## 2. The six workstreams

Six workstreams, one owner each. The numbering is stable and is what the source register maps to.

| ID | Workstream | Launch gate | Rationale |
| --- | --- | --- | --- |
| **LR-1** | **Runtime truth** | L1, L6 | Nothing else is provable while the runtime cannot identify itself |
| **LR-2** | **Release propagation** | L2, L5 | The published release must be the running release |
| **LR-3** | **Memory and instruction contract** | L3 | The `ready:true` gate must be satisfiable |
| **LR-4** | **Packaging safety** | L4, and R20–R22 | The unpublished leak fix is a launch blocker |
| **LR-5** | **Plugin, brick and card contract** | L4 | One contract, three consumer types, no teaching of the dead model |
| **LR-6** | **Launch acceptance** | L6 | One complete journey, recorded |

### LR-1 — Runtime truth
Absorbs the daemon-lock and health-reporting findings. `startup check` is authoritative; a foreign PID is a conflict. `status` and `startup check` must agree (R7). Includes the surface-dir work (`SURFACE_COMPILATION_FIX`) because a surface writing to a directory no harness reads is the same defect class: **a success report for a no-op**.

### LR-2 — Release propagation
Absorbs `UNIFORM_BRAIN_UPDATES` and the version-skew finding. Publishing, tagging, installing and per-consumer verification are separate reported events (R8). An upgrade preserves memory and configuration, and interruption is recoverable (R9).

### LR-3 — Memory and instruction contract
Absorbs the TR-003 capsule-overflow item and the surface sync drift. Recorded telemetry supersedes the historical overflow blocker at this project's configured 16,000 budget; it does not settle a universal default. Scaffold-as-publish-source synchronization, curation and candidate readback remain open. The capsule must report overflow honestly (R14).

### LR-4 — Packaging safety
Absorbs `PLUGIN_CREATOR_SKILL`'s unpublished fix. Acceptance covers **every** path independently (R21), because the leak entered through a path other than the one previously certified. The `tokenPanelSource()` reconciliation (audit §2.5) belongs here, since it is a credential-entry pattern in generated code.

### LR-5 — Plugin, brick and card contract
Absorbs `PLUGIN_CARDS_BESPOKE`, `PLUGIN_BRICK_STANDALONE`, the remaining `PLUGIN_UI_OVERHAUL` scope, the four card-bespoke projects, and the TR-010 card items. It owns one contract with three requirement sets:

| Artifact | Card face | UI block | Runtime dependency | Validated by |
| --- | --- | --- | --- | --- |
| **Plugin** | Required, bespoke, exactly one `kind: card` | Declared in `ui.elements[]` | Total Recall host | `validateCardFace` |
| **Brick** | None | None | None in the vendored payload | `pluginBundleFiles(dir, {audience:'brick'})` |
| **Panel** | Not a face | Secondary screen | Total Recall host | `validateCardFace` (panels do not satisfy the face requirement) |

The "panel is not a card face" contract edit recorded at 2026-10-23T23:47Z lets a plugin carry secondary screens without satisfying the face requirement. D1 is resolved: the owner approved as many plugin-owned panels as needed alongside exactly one bespoke face; the tracker and `0062229` record contract/test evidence.

### LR-6 — Launch acceptance
Absorbs `TR_MARKETING_LAUNCH` and `TR_LAUNCH_HARNESS_DISCOVERY`, narrowed. Discovery stops being a live track: harness experiments (Pi, Hermes, OpenCode, Goose, OpenHands, Aider) produce **no launch dependency**. Public claims follow demonstrated behavior only (R23).

## 3. Data flow of the acceptance journey

The decisive test. Every stage must produce a recorded artifact; a green stage does not certify the next.

```
clean machine
   │
   ├─ install published package ──────────→ LR-2  (version == npm, verified)
   │
   ├─ startup check --json ───────────────→ LR-1  (shared_ready: true)
   │
   ├─ brain reaches ready ────────────────→ LR-3  (instructions in sync)
   │
   ├─ plugin installs and runs ───────────→ LR-5  (contract valid, face renders)
   │
   ├─ memory written, then recalled ──────→ LR-3  (recall returns with source)
   │
   ├─ upgrade to next release ────────────→ LR-2  (memory + config preserved)
   │
   └─ recall still returns, runtime ──────→ LR-6  (one artifact, one host)
      still healthy
```

Each arrow is an **independently verified** transition. The earlier consolidation's weakness was certifying components in isolation; this journey exists to make that impossible.

## 4. Evidence model

Reused from the existing register, so there is no second provenance system:

- Every predecessor item keeps its **original text** and a SHA-256 of the tracker it came from.
- A checked predecessor box enters the register as `claim`, never as `evidenced`.
- An item becomes `evidenced` only when the owning workstream records a command and a host.
- `local` and `sanctioned` (Mac mini) are distinct hosts; a local result never satisfies a sanctioned gate (R27, R28).

Statuses: `evidenced` · `claim` · `superseded` · `retired` · `external-owner` · `open`.

## 5. What changes versus the predecessors

| Aspect | Predecessors | This plan |
| --- | --- | --- |
| Active projects | 13 | 1 |
| Card model | Two conflicting models taught in shipped docs | One model, enforced in code, taught everywhere |
| "Blocked" | Subjective, unrecorded | Two named decisions (D1, D2), each with an owner |
| Checked box | Treated as proof | Treated as a claim until evidenced |
| Acceptance | Per-component | One end-to-end journey |
| Project creation | Ad hoc | Custody rule |
| Product roadmap | Interleaved with launch blockers | Explicitly out of launch scope (§PRD 5) |

## 6. Deliberate non-goals

- **No new abstraction.** This plan adds no runtime code. Its deliverables are custody, registers, reconciliation edits, and evidence.
- **No re-litigation.** The card architecture, memory core, and plugin host are settled and stay settled.
- **No parallel edit surface.** Documents are corrected in place; no shadow copies are maintained.
- **No second evidence system.** The existing `source-items.json` machinery is extended, not replaced.

## 7. Decision reconciliation

The original two decisions are no longer open launch blockers. Their dispositions are recorded here so agents do not request the same decisions again.

| ID | Decision | Blocks | Default if undecided |
| --- | --- | --- | --- |
| **D1** | Resolved by owner: one face, unlimited plugin-owned panels | None | Contract/tests recorded at `0062229` and in tracker |
| **D2** | Historical overflow superseded by telemetry at the configured project budget | No current overflow blocker; LR-3 sync remains open | No new universal default or curation policy is inferred |

Brand/trademark naming from TR-010 FC-F is **not** a launch decision and moves out of scope with the product roadmap.

# TOTAL_RECALL_LAUNCH_PLAN — Architecture

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

## 1. Ownership model

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
Absorbs the TR-003 capsule-overflow item and the surface sync drift. Two sub-items: the **budget decision** (blocked on Greg) and the **scaffold-as-publish-source** reconciliation. The capsule must report overflow honestly (R14).

### LR-4 — Packaging safety
Absorbs `PLUGIN_CREATOR_SKILL`'s unpublished fix. Acceptance covers **every** path independently (R21), because the leak entered through a path other than the one previously certified. The `tokenPanelSource()` reconciliation (audit §2.5) belongs here, since it is a credential-entry pattern in generated code.

### LR-5 — Plugin, brick and card contract
Absorbs `PLUGIN_CARDS_BESPOKE`, `PLUGIN_BRICK_STANDALONE`, the remaining `PLUGIN_UI_OVERHAUL` scope, the four card-bespoke projects, and the TR-010 card items. It owns one contract with three requirement sets:

| Artifact | Card face | UI block | Runtime dependency | Validated by |
| --- | --- | --- | --- | --- |
| **Plugin** | Required, bespoke, exactly one `kind: card` | Declared in `ui.elements[]` | Total Recall host | `validateCardFace` |
| **Brick** | None | None | None in the vendored payload | `pluginBundleFiles(dir, {audience:'brick'})` |
| **Panel** | Not a face | Secondary screen | Total Recall host | `validateCardFace` (panels do not satisfy the face requirement) |

The "panel is not a card face" contract edit recorded at 2026-10-23T23:47Z is the **hinge** that lets a plugin carry secondary screens without satisfying the face requirement. It is adopted here and flagged for Greg's confirmation (open decision D1).

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

## 7. Open decisions

Two, both Greg's. Neither blocks LR-1, LR-2, LR-4, or LR-5.

| ID | Decision | Blocks | Default if undecided |
| --- | --- | --- | --- |
| **D1** | May panels coexist with a card face? (The contract already allows it; needs confirmation.) | LR-5 final acceptance only | Current code behavior: yes |
| **D2** | Capsule budget: curate the 83 directives to ≤4,000, or justify and raise the default? | LR-3 completion | Raise the documented default and record why |

Brand/trademark naming from TR-010 FC-F is **not** a launch decision and moves out of scope with the product roadmap.

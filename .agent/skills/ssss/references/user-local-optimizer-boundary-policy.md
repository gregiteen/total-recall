# User-Local Optimizer Boundary Policy

**Spec Section**: §15.3 (Mutability Without Fuzziness)
**Status**: Active
**Effective**: 2026-05-16

---

## 1. Purpose

The SSSS architecture allows two distinct kinds of mutation:

- **Protocol-level evolution** — changes to the SSSS specification itself (governed by
  the Admin Protocol Evolution Policy).
- **User-local optimization** — changes to vault *content* (memory nodes, skills,
  tasks, proposals) performed by automated agents like the Dream Cycle.

This policy defines the hard boundary between the two. User-local optimizers have
broad freedom to improve vault content but MUST NOT alter the protocol itself.

---

## 2. What User-Local Optimizers May Do

User-local optimizers (Dream Cycle, pattern detectors, watchdogs, schedulers) have
full autonomy within the **content layer**:

| Action | Scope | Example |
|--------|-------|---------|
| Create memory nodes | `memory-vault/` | Dream Cycle creates a new pattern node |
| Update confidence/decay | `memory-vault/` | Decay function reduces confidence over time |
| Supersede/deprecate nodes | `memory-vault/` | Dedup replaces old node with consolidated one |
| Create tasks | `scheduler/queue/` | Watchdog creates a maintenance task |
| Create proposals | `memory-inbox/` | Dream Cycle proposes a cleanup |
| Update skill memory injection | `skills/*/SKILL.md` | `surface.mjs` recompiles injected memory blocks |
| Rebuild derived indexes | `memory-derived/` | `reindex` regenerates all derived artifacts |
| Append events | Event log | Audit entries, feedback, diagnostic events |
| Create conflict records | `memory-inbox/conflicts/` | Conflict detector quarantines contradictions |

These actions are **all performed through the Operation Contract** (§6) and are
subject to normal validation and idempotency.

---

## 3. What User-Local Optimizers Must NOT Do

The following actions are **strictly prohibited** for any automated agent:

### 3.1 Schema Mutations

| Prohibited Action | Rationale |
|-------------------|-----------|
| Modify `schema.mjs` | The Zod schema registry is a direct expression of the spec. |
| Add/remove required fields | Changes field contracts for all future documents. |
| Add new primitive types | Extends the type registry — a protocol change. |
| Modify validation logic | Changes what constitutes a valid SSSS file. |
| Modify the Operation Contract pipeline | Changes how mutations are processed. |

### 3.2 Spec Document Mutations

| Prohibited Action | Rationale |
|-------------------|-----------|
| Edit `ssss-spec.md` | The canonical spec document. |
| Edit `admin-protocol-evolution-policy.md` | This policy document. |
| Edit `user-local-optimizer-boundary-policy.md` | This policy document. |
| Edit conformance fixtures | Changes what conformance means. |
| Advance `schema-proposal` status beyond `draft` | Only Admin may review/accept. |

### 3.3 Infrastructure Mutations

| Prohibited Action | Rationale |
|-------------------|-----------|
| Modify `INSTRUCTIONS.md` structure | The Tier 1 hot memory template is protocol. |
| Modify the `surface.mjs` routing algorithm | Changes how memory is surfaced. |
| Modify the Dream Cycle's own policy files | Self-modification of governance. |
| Delete or truncate the event log | The event log is append-only and immutable (§8). |

---

## 4. The Proposal Boundary

User-local optimizers CAN and SHOULD propose protocol improvements. The mechanism:

1. The optimizer creates a `type: proposal` with `category: schema-friction`.
2. The proposal describes what spec change would improve the optimizer's work.
3. The proposal sits in `status: draft` until an Admin reviews it.
4. If the Admin agrees, they create a formal `type: schema-proposal` and route it
   through the Admin Protocol Evolution Policy pipeline.

This preserves the optimizer's ability to identify improvements while keeping
protocol evolution under human governance.

---

## 5. Enforcement

### 5.1 Static Checks

The operation validator (Phase 2) MUST enforce:

- Operations targeting spec files (`references/ssss-spec.md`,
  `references/*-policy.md`, `fixtures/`) from non-admin agents are rejected with `403`.
- Operations modifying `schema.mjs` or `schema.spec.mjs` from non-admin agents are
  rejected with `403`.
- `schema-proposal` documents with `status: accepted` MUST have a `reviewed_by` field
  that matches a registered admin.

### 5.2 Runtime Checks

The operation validator SHOULD emit a `warning` when:

- An optimizer writes a memory node with `priority: absolute` (Tier 1 promotion
  should be rare and conscious).
- An optimizer writes a memory node with `immutable: true` (immutable nodes resist
  future modification).
- A proposal references a spec section that does not exist.

### 5.3 Audit Trail

Every optimizer action is logged via the event log (§8). Admin review of optimizer
activity SHOULD be performed periodically. Suspicious patterns (e.g. an optimizer
repeatedly writing Tier 1 nodes) SHOULD trigger a diagnostic task.

---

## 6. Boundary Summary

```
┌─────────────────────────────────────────────────────────┐
│                    SSSS Architecture                     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │            Protocol Layer (ADMIN ONLY)           │    │
│  │                                                   │    │
│  │  • ssss-spec.md                                  │    │
│  │  • schema.mjs / schema.spec.mjs                  │    │
│  │  • Conformance fixtures                          │    │
│  │  • Policy documents                              │    │
│  │  • Evolution pipeline (schema-proposal → release) │    │
│  └─────────────────────────────────────────────────┘    │
│                         ▲                                │
│                         │ proposals only                 │
│                         │ (never direct mutations)       │
|  ┌─────────────────────────────────────────────────┐    |
│  │          Content Layer (OPTIMIZER OK)             │    │
│  │                                                   │    │
│  │  • Memory vault (create, update, supersede)      │    │
│  │  • Skill memory injection (via surface.mjs)      │    │
│  │  • Task queue (create, update status)            │    │
│  │  • Proposals (create, draft only)                │    │
│  │  • Conflict records (create)                     │    │
│  │  • Derived indexes (rebuild)                     │    │
│  │  • Event log (append only)                       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

*This policy is part of the SSSS Autonomous AI OS. It is a governance document that
ensures user-local optimizers cannot undermine protocol integrity while preserving
their ability to optimize content.*

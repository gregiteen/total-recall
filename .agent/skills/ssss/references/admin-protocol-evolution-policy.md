# Admin Protocol Evolution Policy

**Spec Section**: §15 (Schema Evolution)
**Status**: Active
**Effective**: 2026-05-16

---

## 1. Purpose

This policy governs how the SSSS specification itself evolves. The deterministic
layer (§11.1) must remain exact at every moment — schema evolution happens
**between** versions, never ad-hoc within a version. This document defines the
mandatory gates and authorization model for protocol changes.

---

## 2. Actors

| Role | Who | Authority |
|------|-----|-----------|
| **Admin** | Repository owner / designated maintainers | Full protocol evolution authority |
| **User-Local Optimizer** | Dream Cycle, background tasks, agents | Proposal authority only — cannot commit spec changes |
| **External Contributor** | Pull request authors | Proposal authority only — subject to admin review |

Only **Admin** actors may advance a schema proposal past the `pending` state.
User-local optimizers and external contributors may author proposals (`type: schema-proposal`)
but MUST NOT bypass the review gate.

---

## 3. The Evolution Pipeline

Every change to the SSSS specification — including new primitive types, new required
fields, field deprecations, contract modifications, or conformance rule changes —
MUST pass through these ordered stages:

### Stage 1: Proposal Authorship

- A `type: schema-proposal` file is created with `status: draft`.
- The proposal MUST specify `from_version`, `to_version`, `summary`, and `breaking`.
- If `breaking: true`, the proposal MUST include a `migration_path` reference.
- The proposal MAY be authored in plain natural language (§15.1 of the spec).

### Stage 2: Formal Review

- The proposal is advanced to `status: pending` when ready for review.
- An Admin MUST review the proposal against these criteria:
  1. **Consistency** — the delta does not contradict existing spec invariants.
  2. **Non-regression** — no existing REQUIRED field is removed without a migration.
  3. **Determinism** — the resulting schema remains deterministically validatable.
  4. **Backward compatibility** — non-breaking changes SHOULD NOT require migration.
  5. **Conformance impact** — the conformance fixture set MUST be updated simultaneously.

### Stage 3: Acceptance Gate

- An Admin sets `status: accepted` and `reviewed_by: <admin-id>`.
- If rejected, the Admin sets `status: rejected` with a `rejection_reason`.
- Acceptance is always explicit — silence is not acceptance.

### Stage 4: Version Increment

- The spec version header (§14) is incremented.
- The `schema_version` field of affected primitives is incremented.
- A `type: release` file is created documenting the change.

### Stage 5: Migration

- A `type: migration` file is created with `status: pending`.
- The migration MUST describe the exact transformation from old to new.
- A host MUST provide a `vault upgrade` command that applies the migration.
- The migration MUST be testable: the migration test harness (Phase 5) validates
  that applying the migration to a v(N) vault produces a conformant v(N+1) vault.

---

## 4. Prohibited Actions

The following are protocol violations regardless of actor:

1. **Silent spec mutation** — Changing the spec without creating a `schema-proposal`.
2. **Unversioned breaking changes** — Any breaking change without a version increment.
3. **Optimizer self-promotion** — A user-local optimizer setting `status: accepted`
   on its own proposal.
4. **Field squatting** — Adding fields to the spec's reserved namespace without going
   through the evolution pipeline.
5. **Retroactive conformance changes** — Changing conformance rules for an already-released
   version.

---

## 5. Emergency Protocol

In the event of a critical security vulnerability or data-loss bug in the spec:

1. An Admin MAY create and accept a `schema-proposal` in a single action.
2. The proposal MUST still be created — there is no path that skips documentation.
3. The emergency MUST be documented in the `release` changelog with `[EMERGENCY]` prefix.
4. A post-mortem review MUST follow within 7 days.

---

## 6. Spec Version Numbering

| Component | Convention |
|-----------|------------|
| Major | Breaking changes to the contract or type registry |
| Minor | Non-breaking additions (new optional fields, new primitive types) |
| Draft | Pre-1.0 versions may break between any minor version |

The current spec is **v0.1 — Draft**. All changes are technically breaking until v1.0.
Even so, this policy applies: proposals and review gates are mandatory.

---

*This policy is part of the SSSS Autonomous AI OS. It is a governance document, not
a schema document. It constrains how the schema is changed, not what the schema
contains.*

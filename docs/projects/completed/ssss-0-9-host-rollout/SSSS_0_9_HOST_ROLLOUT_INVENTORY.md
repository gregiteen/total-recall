# SSSS 0.9 Host Rollout — Total Recall Inventory

> Phase 8A of `ssss` project `SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL`.  
> Date: 2026-07-10

## Goal

Consume `@gregiteen/ssss-cli@0.9` (package kernel + adapters) instead of maintaining a
private Operation Contract implementation, while keeping Total Recall host policy
(memory schema_version 2, protocol-path authz, optimizer rules) as **qualified
extensions**, not core forks.

## Dependency

| Surface | Current | Target |
|---------|---------|--------|
| npm alias | `@ssss/cli` → `@gregiteen/ssss-cli@^0.9.0` | Git/main until npm 0.9.0 is published, then npm |
| Package version in tree | 0.9.0 (kernel exports present) | Stay on 0.9 |

## Copied / local core behavior (must migrate)

| Path | What it does | Classification |
|------|--------------|----------------|
| `src/core/operation-validator.mjs` | Full local §6 pipeline (idempotency, authz, lease, Zod validate, commit, audit) | **Core copy** → replace with package kernel + host adapters |
| `src/core/schema.mjs` (core types) | Zod re-implementation of core document primitives | **Core copy** for types also in `registry/core.json` |
| Local lease files under `leaseStore` | Path-keyed lease JSON | **Adapter** → map to package `FileLeaseStore` / bridge |
| In-memory idempotency cache | Process-local Map + audit warm | **Adapter** → package `MemoryIdempotencyStore` / durable file store |
| Direct `atomicWrite` in many modules | Bypass Operation Contract for tasks, scheduler, surface derived files, etc. | **Direct mutation paths** → inventory & block/detect for *canonical user data* |

## Host-only types (remain Total Recall / product extensions)

These appear in `SSSS_SCHEMAS` but are **not** in package `registry/core.json`
document primitives. They must become `total-recall:` (or product) extension
definitions rather than forked core:

- `proposal`, `schema-proposal`
- `contact`, `company`, `deal`, `brand`, `deployment`, `listing`
- `knowledge`, `knowledge_source`, `calendar_event`, `language_convention`
- `profile`, `sharing_group`, `voicemail`, `personalization_profile`
- `account_assistant`, `account_memory`, `account_workflow`
- `workspace_transfer`, `email_account`, `extension`
- `phone_number`, `domain`, `workspace`
- `commerce_catalog`, `product`, `cms_collection`, `cms_entry`
- `social`, `ticketed_event`
- Zod `event` document schema (distinct from envelope type `event`)

Many of these look UltraChat/Festech-adjacent and may later move to those hosts'
extension registries; until then they stay TR host extensions.

## Core types TR must consume from package (not re-own)

From package `registry/core.json`:

`assistant`, `conflict`, `conversation`, `memory`, `migration`, `model`, `page`,
`primitive`, `release`, `rule`, `run`, `security_role`, `skill`, `task`, `workflow`

**Gap found 2026-07-10:** TR `SSSS_SCHEMAS` was missing `primitive` after core 0.9 added it.

## Host policy that must stay TR-side (adapters / hooks)

| Policy | Where today | 0.9 placement |
|--------|-------------|----------------|
| Protocol path admin-only writes | `operation-validator` `isProtocolPath` | Authorization adapter / policy floor |
| Optimizer may write memory with warnings | Stage 5 post-validate | Host authorize + warnings hook |
| Memory `updated` / `last_accessed` stamping | Commit stage | Resource/host finalize hook or pre-commit transform |
| `schema-proposal` accept requires admin + `reviewed_by` | Stage 5 | Host policy on extension primitive |
| Role permissions from `roles/<role>/ROLE.md` | Stage 5.5 | Principal injection (`verifyPrincipal`) mapping role → capabilities |
| Memory vault path uses Zod memory v2 | `validateMemoryNode` | Host validator overlay after package base validation |

## Mutation entry points

| Entry | Uses contract? | 8A action |
|-------|----------------|-----------|
| `validated-write.writeNodeValidated` | Yes (`processOperation`) | Route memory through bridge |
| `server/routes/docs.mjs` | Yes | Route docs mutations through bridge |
| `server/routes/memory.mjs` / share | Yes via validated-write | Bridge |
| `cli/remember.mjs`, `cli/share.mjs` | Yes via validated-write | Bridge |
| `task_runner`, `scheduler`, `surface` derived | Often raw `atomicWrite` | Detect; only block **canonical vault docs**, not derived indexes |
| `fact-seeker`, `clarity-rewriter`, `post-mortem` | Mix of writeNode / atomicWrite | Later: force validated path for memory nodes |

## Rollout modes (`TR_SSSS_KERNEL_MODE`)

| Mode | Behavior |
|------|----------|
| `kernel-core` (**default**) | Package kernel for core package types **including memory + workflow** |
| `kernel-low-risk` | Package kernel for structural low-risk types only |
| `kernel` | Package kernel for all package-known types; host extension for TR-only |
| `shadow` | Legacy commits; package kernel dry-runs and logs verdict diffs |
| `legacy` | Local `processOperation` only (unit tests / emergency fallback) |

## Verification checklist (Phase 8A gate)

- [x] Inventory complete (this file)
- [x] Host extension registry loads with package core
- [x] Shadow suite compares local vs package success/valid on core fixtures
- [x] Low-risk types can commit via package kernel
- [x] Memory + workflow route through package kernel with host policy hooks
- [x] Direct-write detector flags unapproved canonical paths
- [x] Bridge tests green under `vitest`
- [x] Default production path is package kernel (`kernel-core`); legacy pipeline deleted
- [x] Clean-account, replay, recovery, scope, and privacy verification
- [x] All `writeNode()` call sites route through Operation Contract / package kernel

## Implementation (2026-07-10)

| Module | Role |
|--------|------|
| `src/core/ssss-host-extension.mjs` | Host-only types → `total-recall` extension registry |
| `src/core/ssss-kernel-bridge.mjs` | Package kernel engine, principal map, shadow, modes |
| `src/core/ssss-kernel-bridge.spec.mjs` | Inventory, low-risk commit, protocol path, shadow fixtures |
| `processOperationAsync` | Async entry for kernel / shadow modes |
| `writeNodeValidatedAsync` | Async memory write path for kernel modes |
| `prepareEnvelopeForKernel` | Universal frontmatter fill, memory stamps, v2 overlay, optimizer warnings |
| `listUnapprovedCanonicalWriters` | Heuristic list of core modules bypassing Operation Contract |
| `ssss-clean-account.spec.mjs` | Clean vault init, memory/workflow commit, idempotent replay, scope deny |
| HTTP/CLI cutover | `docs`, `memory`, `share` routes + `remember`/`share` CLI + OKF import use async kernel path |

Default mode is **`kernel-core`**. Set `TR_SSSS_KERNEL_MODE=legacy` only for emergency fallback or legacy unit tests.

### Completed cleanup (2026-07-10)

- `writeNode()` is async and always calls `writeNodeValidatedAsync` → package kernel.
- Call sites updated: fact-seeker, dream, conflict-detector, research-queue, import-rules, migrate, cli/ingest.
- `processOperationLegacy` fully removed; `processOperation` (sync) throws; use `processOperationAsync`.
- Host prep fills schema v2 fields and remaps non-enum memory categories (e.g. `instructions` → `preferences` + `folder:` tag).

### Memory / workflow host policy (kernel path)

1. Fill package universal fields (`description`, `timestamp`) when missing.
2. Stamp `updated` / `last_accessed` on memory commits.
3. Enforce TR `validateMemoryNode` (schema v2 + `sentiment_target`) before kernel.
4. Optimizer absolute/immutable writes emit warnings; capabilities expand to `ssss:memory:*`.
5. Protocol paths still require admin/system.

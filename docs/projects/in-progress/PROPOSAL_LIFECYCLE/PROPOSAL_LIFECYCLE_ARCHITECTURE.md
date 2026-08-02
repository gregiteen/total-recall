# Proposal Lifecycle — Architecture

**Status:** In Progress
**Created:** 2026-08-01
**Author:** Claude Opus 5

## Component map

| Concern | File | Role |
|---|---|---|
| Generation | `src/core/optimizer.mjs` | Produces proposals from vault state |
| Identity / dedupe | `src/core/optimizer.mjs` | `proposalKey`, `loadOpenProposalKeys`, `dedupeProposals` |
| Gate | `src/core/optimizer.mjs` | `evaluateProposalGate(proposal, runtimeConfig, vaultDir)` |
| Staleness | `src/core/optimizer.mjs` | `findStaleNodes`, `refreshStaleKnowledge` |
| Consumption | `src/core/proposal-applier.mjs` | Status machine, handlers, undo, audit |
| Orchestration | `src/core/dream.mjs` | Phase 4 generate → gate → write → apply; Phase 5 prune |
| CLI | `src/cli/proposals.mjs` | `list/show/apply/reject/revert/stale` |
| REST | `src/server/routes/proposals.mjs` | `/api/proposals*` |

## Status machine

```
        ┌─────────┐  gate cannot verify   ┌──────────┐
        │  draft  │◀──────────────────────│ generated│
        └────┬────┘                       └────┬─────┘
             │ human apply/reject              │ gate verifies
             │                                 ▼
             │                            ┌──────────┐
             │                            │ accepted │
             │                            └────┬─────┘
             ▼                                 │ handler
   ┌──────────┬──────────┐                     ▼
   │ rejected │ applied  │◀────────────────────┘
   └──────────┴────┬─────┘
                   │ revert (snapshot restores)
                   └──▶ accepted

   superseded ◀── target changed underneath the proposal
```

`superseded` exists so a proposal invalidated by the world moving on is not
recorded as `rejected`. Conflating them would corrupt the only signal we have
about gate accuracy.

## Identity

`proposalKey(p) = "<topic>::<target_path>"`.

The topic lives in `category` before the write and in `proposal_topic` after —
`prepareNodeForContract` forces `category: 'proposals'` (the vault folder) on
write. `proposalKey` normalizes both shapes so a freshly generated proposal
compares equal to its own persisted copy.

`draft` and `accepted` count as **open**. Terminal states do not, so a proposal
whose work was undone or refused can legitimately be re-filed later.

> **Trap:** duplicate detection MUST read `proposals/*.md` directly.
> `getNodes()`/`loadNodes()` return only `type: memory` nodes — `walkMd()`
> explicitly skips the `proposals/` directory. A `getNodes()`-based check sees
> zero existing proposals and suppresses nothing. This bug was written, caught by
> its own regression test, and rewritten.

## Auto-apply

`AUTO_APPLICABLE_TOPICS` gates what the daemon may run unattended. Membership
requires **mechanical verifiability**: the handler must prove the precondition
itself from live vault state rather than trusting the proposal's rationale.

Today: `memory-cleanup` only.

`applyMemoryCleanup`:
1. Re-derive the duplicate set from live nodes (the proposal may be days old).
2. Abort if the targets no longer share one `predicate:object` signature → `superseded`.
3. Abort if any target is protected (importance ≥ 5, `priority: absolute`, `category: invariants`).
4. Canonical = most `evidence_count`, then highest `confidence`, then oldest.
5. Snapshot the duplicates' exact bytes.
6. Mark duplicates `status: superseded`, `superseded_by: <canonical>`.

Non-destructive: nothing is deleted. `superseded` and `superseded_by` are
`MemoryNodeSchema`'s own vocabulary for this relationship (`archived` is not a
valid memory status — the schema allows only `active|superseded|deprecated|draft`).

## Undo

`memory-vault/.undo/<proposal_id>.json` holds the verbatim prior content of every
file the handler touched, plus `existed: false` markers so revert deletes what an
apply created. Dot-prefixed so `walkMd()` skips it — an undo snapshot is not vault
content and must never be loaded as a node or embedded.

Revert restores the bytes, returns the proposal to `accepted`, deletes the
snapshot, and appends an audit record.

## Audit

Append-only JSONL at `memory-vault/.events/proposals.jsonl`.
Actions: `apply`, `apply_failed`, `apply_error`, `revert`.

A thrown handler is recorded as `apply_error` and leaves the proposal **open** —
a bug must stay visible and retryable, not be marked done.

## Staleness

`stale-knowledge-refresh` no longer generates files. Two replacements:

- `findStaleNodes(vaultDir, {days, minImportance})` — a read-time query. This is
  what the generator was really computing; deriving it on demand costs one vault
  scan and is always current.
- `refreshStaleKnowledge(vaultDir, {limit})` — enqueues research jobs via
  `addToQueue`, which the research daemon executes and commits back to the vault.
  Rate-limited (default 3/cycle), most-stale-first. `addToQueue` dedupes by topic,
  so a queued node is never enqueued twice.

The generator (`generateStaleKnowledgeRefreshProposals`) is retained but
`@deprecated` and gated behind `ENABLE_STALE_KNOWLEDGE_REFRESH = false`, pinned by
a regression test.

## Pruning

`pruneResolvedProposals(dir, maxAgeMs)` replaces the blind age-based `pruneDir`.
Only `applied|rejected|superseded` expire. Unparseable files are left alone —
deleting a proposal we cannot read is exactly the silent data loss the function
exists to prevent.

## SSSS compliance

Proposal *creation* goes through `writeNode` → the Operation Contract, as before.
Node mutations in handlers go through `writeNode`.

Status transitions write the file directly via `atomicWrite`. Rationale: the
proposal already passed the contract at creation, and a status change must not be
able to fail on an unrelated schema change months later — that would strand a
proposal in a state no command could clear. Undo snapshots and the audit log are
operational artifacts, not vault state, and live in dot-directories outside the
node scan.

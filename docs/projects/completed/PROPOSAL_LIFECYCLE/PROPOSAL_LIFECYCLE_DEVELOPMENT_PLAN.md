# Proposal Lifecycle — Development Plan

**Status:** In Progress
**Created:** 2026-08-01
**Author:** Claude Opus 5

## Phase 1 — Stop the bleeding (shipped, uncommitted)

1. `proposalKey` / `loadOpenProposalKeys` / `dedupeProposals` in `optimizer.mjs`.
2. Wire dedupe into `dream.mjs` Phase 4.
3. `ENABLE_STALE_KNOWLEDGE_REFRESH = false`.
4. Fix `/health` node count to ask `loadNodes()` rather than counting `.md` files
   (the file count included `proposals/`, which is never embedded, producing a
   false "5% embedding coverage — degraded" alarm on a 100%-healthy brain).
5. Purge: 16,401 files backed up, then deleted. Vault 17,257 → 856 `.md`.

## Phase 2 — Make the gate mean something

1. Rewrite `evaluateProposalGate` to take `vaultDir` and verify against live state.
2. Reject non-duplicate merge sets; route protected-node merges to `draft`.
3. Stop marking unknown topics `rejected` — park them `draft` for review.
   The old behavior silently discarded legitimate findings (stalled workflows,
   skill decay) while making the accept rate look meaningful.

## Phase 3 — Build the consumer

1. `src/core/proposal-applier.mjs`: status machine, `listProposals`, `getProposal`,
   `setProposalStatus`.
2. `applyMemoryCleanup` handler with live re-verification and protected-node refusal.
3. Undo snapshots (`.undo/`) + `revertProposal`.
4. Audit trail (`.events/proposals.jsonl`).
5. `applyAcceptedProposals` for the daemon, bounded per run, logging what it skipped.

## Phase 4 — Surfaces

1. `src/cli/proposals.mjs` + registration in `bin/total-recall.mjs`.
2. `src/server/routes/proposals.mjs` + mount in `rest.mjs`.
   All routes path-bound — a bare `router.use(requireAuth)` in a root-mounted
   sub-router would 401-gate the static frontend and the login page.

## Phase 5 — Staleness as work, not paperwork

1. `findStaleNodes` (read-time query).
2. `refreshStaleKnowledge` → research queue, rate-limited, most-stale-first.
3. Wire into the dream cycle; expose via `proposals stale` and `/api/proposals/stale`.

## Phase 6 — Prevent regrowth

1. `pruneResolvedProposals` — terminal-only pruning.
2. Regression tests pinning: the disabled generator, the apply call, the staleness
   call, and the gate's `vaultDir` argument. Each of these disappearing silently
   reverts the feature to write-only.

## Phase 7 — Verification & release

1. Full suite on the Mac Mini (never locally — RAM).
2. Native boot check: `node src/server/index.mjs` must start without crashing
   before any tag or publish.
3. Live verification against the global brain.
4. Ship as **3.21.0** (feature, not the 3.20.2 bugfix — held per user decision).

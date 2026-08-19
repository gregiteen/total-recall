# Proposal Lifecycle — PRD

**Status:** In Progress
**Created:** 2026-08-01
**Author:** Claude Opus 5
**Prefix:** `PROPOSAL_LIFECYCLE`

## Problem

The optimizer's proposal system was write-only. The dream cycle generated proposals,
an evaluation gate stamped ~100% of them `accepted`, they were written to
`memory-vault/proposals/`, and a storage pruner deleted them three days later.
Between write and delete, nothing read them: no CLI command, no REST route, no UI.

Three failures compounded:

1. **No consumer.** `SSSS_SOVEREIGN_AI_OS_PRD.md:44` specified "the Dream Cycle
   stages improvements as reviewable SSSS proposals" — the staging half shipped,
   the review half never did. `HANDOFF.md:14` claimed ✅ for proposals serving as
   "future RL training data", which a 100%-accept gate cannot produce (no negatives).
2. **No identity.** Each proposal got a random slug (`prop_<hex>`), so two proposals
   requesting identical work never collided. The generators are pure functions of
   vault state, so every cycle re-filed every proposal under a new name. The global
   vault reached **16,309 proposals covering 594 distinct targets** (~28 copies each,
   ~5k/day, 64 MB) — 95% of the entire vault.
3. **A pruner that hid the problem.** Proposals were pruned by age alongside log
   files, so the queue emptied itself every three days. This kept the vault at a
   bounded equilibrium and destroyed any proposal a human might have acted on.

`stale-knowledge-refresh` was the largest generator: one ticket per high-importance
node untouched for 30 days, regenerated every cycle. It was answering a *query*
("which nodes are stale?") by writing files.

## Goals

- Every proposal reaches a terminal state through a real path.
- Mechanically-verifiable work is applied automatically, with audit and undo.
- Work requiring judgement is visible and actionable by a human.
- Staleness is handled by the research daemon, which can actually resolve it.
- The system cannot silently regrow an unbounded backlog.

## Non-Goals

- LLM-graded proposals. The gate is deterministic; a model in the accept path
  would reintroduce unverifiable acceptance.
- Auto-applying anything requiring intent (skill rewrites, model routing).
- Retroactive RL training data from the deleted 16k corpus. It was never labelled.

## Requirements

- [x] Proposals have a stable identity so duplicates cannot accumulate
- [x] Status machine: `draft → accepted → applied | rejected | superseded`
- [x] The gate can reject, and verifies against live vault state — not its own prose
- [x] Protected nodes (importance ≥ 5, `priority: absolute`, invariants) are never auto-merged
- [x] `memory-cleanup` applies automatically with a byte-exact undo snapshot
- [x] Every apply and revert appends an audit record
- [x] The pruner deletes only terminal proposals, never open work
- [x] `total-recall proposals list|show|apply|reject|revert|stale`
- [x] `GET/POST /api/proposals*` for dashboard and agent access
- [x] Staleness enqueues research instead of writing tickets
- [x] Regression tests pinning each of the above

## Success Criteria

- A vault running N dream cycles over unchanged state produces N-independent
  proposal counts (bounded, not linear in cycles).
- `proposals list` on a healthy brain shows only genuinely actionable items.
- No proposal is deleted while still open.

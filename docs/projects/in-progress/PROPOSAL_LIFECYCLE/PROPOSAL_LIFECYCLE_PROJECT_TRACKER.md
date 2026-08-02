# Proposal Lifecycle — Project Tracker

**Status:** In Progress
**Created:** 2026-08-01
**Author:** Claude Opus 5

## ✅ Phase 1: Stop the bleeding

- [x] `proposalKey` / `loadOpenProposalKeys` / `dedupeProposals` (`src/core/optimizer.mjs`)
- [x] Dedupe wired into Phase 4 (`src/core/dream.mjs`)
- [x] `ENABLE_STALE_KNOWLEDGE_REFRESH = false`
- [x] `/health` counts `loadNodes()`, not `.md` files (`src/server/index.mjs`)
- [x] Purge 16,401 proposals (backed up first); vault 17,257 → 856 `.md`

## ✅ Phase 2: Gate that can reject

- [x] `evaluateProposalGate(proposal, runtimeConfig, vaultDir)` verifies live state
- [x] Rejects merge sets that do not share one `predicate:object` signature
- [x] Routes protected-node merges to `draft` instead of accepting
- [x] Unknown topics park as `draft`, no longer discarded as `rejected`

## ✅ Phase 3: Consumer

- [x] `src/core/proposal-applier.mjs` with `draft → accepted → applied|rejected|superseded`
- [x] `applyMemoryCleanup` — live re-verification, canonical by evidence, non-destructive
- [x] Protected nodes (importance ≥ 5 / `priority: absolute` / invariants) refused
- [x] Undo snapshots in `.undo/` + `revertProposal`
- [x] Audit trail `.events/proposals.jsonl`
- [x] `applyAcceptedProposals` bounded per run, logs what it skipped

## ✅ Phase 4: Surfaces

- [x] `src/cli/proposals.mjs` (`list|show|apply|reject|revert|stale`)
- [x] Registered in `bin/total-recall.mjs` + help text
- [x] `src/server/routes/proposals.mjs`, all routes path-bound
- [x] Mounted in `src/server/rest.mjs`

## ✅ Phase 5: Staleness as work

- [x] `findStaleNodes` read-time query
- [x] `refreshStaleKnowledge` → research queue, rate-limited, most-stale-first
- [x] Wired into the dream cycle
- [x] Exposed via `proposals stale` and `GET /api/proposals/stale`

## ✅ Phase 6: Prevent regrowth

- [x] `pruneResolvedProposals` — terminal-only; unparseable files left alone
- [x] Regression tests pin the disabled generator, the apply call, the staleness
      call, and the gate's `vaultDir` argument

## ✅ Phase 7: Safety gaps found against the live vault

Running the applier against the real global brain surfaced four defects that no
unit test would have found, because they only appear in real data shapes.

- [x] **Over-broad grouping key.** `generateMemoryCleanupProposals` keyed on
      `predicate:object` and explicitly ignored `subject`. Every node sharing a
      *type marker* was grouped as one duplicate set — 15 distinct research
      projects under `tracked_research_project:knowledge_vault`, 98 under
      `documents:portfolio-site`, 156 under `remembers_fact:brain`. Now keyed on
      the full `subject:predicate:object` triple.
- [x] **No size or content guard.** A matching triple says nodes are *about* the
      same thing, not that they *state* the same thing. Added `MAX_AUTO_MERGE_SET
      = 5` (a real accidental duplicate is a pair, not fifteen) and a Jaccard
      content-similarity floor of 0.6. The gate applies the same rules so it can
      never be laxer than the applier.
- [x] **Revert fed the daemon queue.** `revertProposal` returned the proposal to
      `accepted` — the daemon's work queue — so the next dream cycle would
      re-apply exactly what was just undone. Now returns to `draft`.
- [x] **Rejected proposals were re-filed every cycle.** `rejected` is terminal, so
      dedupe stopped suppressing it, and the pure-function generator re-created it
      on every cycle: measured +5 files/cycle, indefinitely. Suppression now covers
      every status except `superseded`, and the pruner no longer ages out
      `rejected` tombstones.

### Live incident and recovery

Before the caps existed, the running daemon auto-applied two proposals
(4 and 8 nodes) and errored partway through a third (98 nodes). The undo
snapshots did their job: all three were reverted, 8 daily notes needed a
frontmatter repair afterwards, and **no node content was lost**. This is the
strongest evidence the undo requirement was correct — without it the merge would
have been unrecoverable.

## ✅ Phase 7b: Silent vector-index wipe (found while investigating `/health`)

Separate defect, same failure family, found because the corrected `/health`
metric finally reported it honestly: the project brain held **520 nodes and 0
embeddings** — keyword-only recall returning results indistinguishable from real
vector hits.

Two causes, both silent:

- [x] **`rebuild` deleted the index.** `fs.rmSync(derivedDir, {recursive: true})`
      took `embeddings.db` with it. Embeddings are not freely derivable — each is
      a provider call — and the index is content-hash incremental and self-pruning,
      so discarding it is pure loss. Now preserved across a rebuild.
- [x] **`compileSurface` rebuilt embeddings fire-and-forget** with a bare
      `.catch(() => {})`, so the CLI process exited before a single vector was
      written; and `semanticResult` was a hardcoded
      `{ indexed: 0, unavailable: true }` literal that no code path could update,
      so the return value could never reveal it. Now awaited, with real counts and
      logged failures. Awaiting costs nothing in steady state — a second compile
      reports `0 built, 520 unchanged` in 1.9s.
- [x] **`rebuild` now prints vector coverage.** "Post-build verification passed:
      0 drift" only checks the jsonl indexes; it passed happily on an empty
      vector index.
- [x] Regression spec: `src/core/surface-embeddings.spec.mjs` (6 tests).

Result: both layers now report `vector_search: on` (global 855/855 after compile,
project 520/520) and `/health` returns **healthy**.

## ✅ Phase 8: Verification & release

- [x] `src/core/proposal-applier.spec.mjs` — 21 tests passing
- [x] `src/core/dream.spec.mjs` Phase 4 wiring tests — passing
- [x] `src/server/routes/proposals.spec.mjs`, `src/cli/proposals.spec.mjs` — passing
- [x] Full test suite on the Mac Mini — **271 files / 1261 tests, 0 failures**
- [x] `route-manifest.json` regenerated for the 7 new endpoints (204 routes)
- [x] Frontend TypeScript clean (`tsc -b`, Mac Mini)
- [x] Lint report clean (1 known pre-existing `flat-cache` tooling issue)
- [x] Native boot check — `node src/server/index.mjs` boots clean on the new code
- [x] Live verification against the global brain (see log below)
- [ ] Release 3.21.0 — **awaiting explicit user authorization**

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-01 | `proposal-applier.spec.mjs` | 21/21 passed |
| 2026-08-01 | `dream.spec.mjs` + `optimizer.spec.mjs` | passed |
| 2026-08-01 | route + CLI specs | 3/3 passed |
| 2026-08-01 | Full suite (Mac Mini) | 271 files / 1261 tests, 0 failures |
| 2026-08-01 | Frontend `tsc -b` (Mac Mini) | exit 0 |
| 2026-08-01 | Native server boot | clean, all routes mounted |
| 2026-08-01 | Live gate over real vault | 8 generated → 5 rejected, 3 draft, **0 accepted** |
| 2026-08-01 | Live boundedness (3 cycles) | 459 files → 459 → 459, 8 suppressed each cycle |
| 2026-08-01 | Live staleness sweep | 58 stale, 3 queued/cycle, 55 deferred (logged) |
| 2026-08-01 | Vault integrity after incident | 864 nodes, 0 damaged, 0 content lost |

## Notes

- `archived` is **not** a valid memory status. `MemoryNodeSchema` allows only
  `active|superseded|deprecated|draft`. Caught by the contract at runtime; the
  handler now uses `superseded` + `superseded_by`, which is the schema's own
  vocabulary for this relationship.
- Duplicate detection must read `proposals/*.md` directly. `getNodes()` returns
  only `type: memory` nodes and `walkMd()` skips `proposals/` — a `getNodes()`
  based check silently suppresses nothing.

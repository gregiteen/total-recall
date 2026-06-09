# SYSTEM RESILIENCE PROJECT TRACKER

## Goal
Improve the autonomous stability and developer experience of the Total Recall OS by eliminating monolithic API files, adding fault tolerance to background tasks, and ensuring strict memory compaction.

## ✅ Phase 1: API Refactoring
- [x] Decompose `src/server/rest.mjs` into `src/server/routes/memory.mjs`
- [x] Decompose `src/server/rest.mjs` into `src/server/routes/research.mjs`
- [x] Decompose `src/server/rest.mjs` into `src/server/routes/system.mjs`
- [x] Refactor `src/server/rest.mjs` to simply assemble the Express App and load sub-routers.

## ⏳ Phase 2: Background DLQ & Compaction
- [x] Implement exponential backoff or a Dead Letter Queue for failed tasks in `src/core/daemon-loop.mjs`
- [ ] Create `runMemoryCompaction` inside `src/core/fact-seeker.mjs` to merge highly related fragmented nodes into comprehensive master nodes.
- [ ] Register `memory-compaction` as a valid idle task in `src/core/scheduler.mjs`.

## ⏳ Phase 2.5: Deterministic Slug Refactoring
- [ ] Refactor `src/core/inference-engine.mjs` to replace `crypto.randomBytes` slugs with MD5 hashes of the conclusion title.
- [ ] Refactor `src/core/clarity-rewriter.mjs` to replace `crypto.randomBytes` slugs with deterministic hashes based on the target node.
- [ ] Refactor `src/core/scheduler.mjs` idle tasks to use deterministic IDs instead of random hex generation.

## ⏳ Phase 3: Infrastructure Isolation & Parity
- [ ] Implement strict allow-list logic in `scripts/sync-scaffold.mjs` to protect local memory nodes from being leaked to the open-source repository.
- [ ] Integrate React Dashboard status indicators to stream live updates of `clarity-review` and `post-mortem` background tasks to the user UI.

## ⏳ Phase 4: Database Scalability (OOM Prevention)
- [ ] Refactor `src/core/embeddings.mjs` to use a scalable vector store (e.g. SQLite-vss) instead of loading `session-embeddings.json` into Node.js memory.

## ⏳ Phase 5: Frontend API Decomposition
- [ ] Decompose `frontend/src/api.ts` into a modular `frontend/src/api/` directory (e.g., `auth.ts`, `chat.ts`, `memory.ts`, `sandbox.ts`).

## ⏳ Phase 6: Testing & Verification
- [ ] Start daemon and verify API routes resolve correctly after decomposition.
- [ ] Force a rate-limit error and verify DLQ safely captures and retries the task.
- [ ] Trigger a memory compaction task and verify node merging works without data loss.
- [ ] Verify `sync-scaffold.mjs` prevents local `memory-vault/facts` from being copied.

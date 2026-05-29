# Development Plan: CLI Command & Cache Performance Optimization

This plan outlines step-by-step implementation phases for performance, memory, and stale cache enhancements.

---

## Phase 1: Throttled Concurrency in Semantic Index
- Implement a helper `throttledMap` in `src/core/semantic-index.mjs` to govern promise concurrency.
- Refactor the sequential loop in `buildSemanticIndex` inside `src/core/semantic-index.mjs` to fetch embeddings concurrently, capped at 6 requests.
- Assert that incremental rebuilds execute successfully and handle failovers cleanly.

## Phase 2: Dual-Tier Cache Layer
- Implement the hot process-level in-memory cache `Map` (max size 500) inside `src/core/embeddings.mjs`.
- Refactor `getCachedEmbedding` to check the hot in-memory cache map first, updating LRU access position on hit.
- Upgrade the partitioned disk cache to non-destructively support both legacy arrays and object envelopes `{ embedding, lastUsed }`.
- Implement auto-pruning/LRU eviction inside `saveCachedEmbedding` when partition file contains more than 500 keys.

## Phase 3: Stale Embeddings Clean-Up
- Add active node slug filtering in `buildEmbeddingsIndex` inside `src/core/embeddings.mjs` to remove any deleted/forgotten slugs from `embeddings.json` index.
- Validate that deleting a node unlinks its `.md` file, triggers compilation, and successfully purges its entry from the vector embeddings index.

## Phase 4: Conformance & Verification
- Execute code quality scripts:
  - `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
  - `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- Run the full Vitest suite to ensure zero regressions across other components:
  - `npm run test`
- Perform manual validation of memory compilations and check logs to ensure no hanging daemon processes or event loop freezes occur.

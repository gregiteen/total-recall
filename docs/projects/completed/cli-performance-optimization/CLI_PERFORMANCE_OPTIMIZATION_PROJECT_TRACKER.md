# Project Tracker: CLI Command & Cache Performance Optimization

- `[ ]` uncompleted tasks
- `[/]` in progress tasks
- `[x]` completed tasks

## ✅ Phase 1: Throttled Concurrency in Semantic Index
- [x] Implement `throttledMap` concurrency utility inside `src/core/semantic-index.mjs`
- [x] Refactor the incremental loop in `buildSemanticIndex` to process embedding requests in parallel chunks (limit 6)
- [x] Run test probe verification to confirm graceful fallback if the embedding provider is offline

## ✅ Phase 2: Dual-Tier Cache Layer & Partition LRU Pruning
- [x] Implement process-level in-memory cache `Map` (max size 500) inside `src/core/embeddings.mjs`
- [x] Refactor `getCachedEmbedding` to perform 0ms lookup from in-memory cache
- [x] Implement upgraded object format `{ embedding, lastUsed }` inside sharded partitions non-destructively
- [x] Implement partition cache LRU pruning (cap at 500 keys per partition, keep 400 MRU) inside `saveCachedEmbedding`

## ✅ Phase 3: Stale Embeddings Index Clean-Up
- [x] Implement automatic removal of stale/deleted slugs inside `buildEmbeddingsIndex`
- [x] Verify that unlinking/deleting memory nodes cleans up their corresponding entries in `embeddings.json` index

## ✅ Phase 4: Testing & Verification
- [x] Run typescript typechecking gate: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Run linting gates check: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Execute entire Vitest conformance suite: `npm run test`
- [x] Manually verify daemon starts cleanly and compiled surfaces reflect updates under 3 seconds

# PRD: CLI Command Performance & Cache Optimization

## 1. Goal
Maximize the performance, scalability, and stability of the Total Recall Sovereign OS memory pipeline by implementing throttled concurrent embedding generation, an in-memory cache layer, non-destructive partition cache LRU pruning, and stale embedding index clean-up.

## 2. Problem Statement
1. **Sequential Embeddings Build**: Incremental embedding rebuilds in `buildSemanticIndex` execute sequential API requests to the embedding model provider. When many nodes are added or recompiled, sequential calls are slow, wasting developer time.
2. **Disk Bottleneck**: Accessing sharded partitions from the SSD on every single query generates constant I/O overhead.
3. **Cache Key Accumulation**: Deleting or archiving memory nodes leaves orphaned embedding cache keys in the partitioned cache directory, and stale keys in `embeddings.json`.
4. **Daemon Stability & Leak-free Loop**: Ensuring the background REST daemon starts cleanly and handles event loops efficiently.

## 3. Scope & Requirements

### Requirement 1: Throttled Concurrent Embedding Generation
- **Target File**: `src/core/semantic-index.mjs`
- **Specification**:
  - Replace the sequential `for (const node of toEmbed)` loop with a throttled concurrent execution model.
  - Concurrency level must be capped to a maximum of 5–8 concurrent requests (configurable or hardcoded at a safe default of 6) to prevent API rate limits.
  - Must remain 100% dependency-free using a native JavaScript concurrency pool helper.

### Requirement 2: Server-Level In-Memory Cache Layer
- **Target File**: `src/core/embeddings.mjs`
- **Specification**:
  - Implement an in-memory cache (a simple standard `Map` with LRU eviction) capped at `500` keys inside `src/core/embeddings.mjs`.
  - Read operations must query this hot cache first, bypassing SSD reads completely for frequently requested embeddings (0ms latency).
  - Write operations must sync with the in-memory cache.

### Requirement 3: Partition Cache LRU Eviction & Auto-Pruning
- **Target File**: `src/core/embeddings.mjs`
- **Specification**:
  - Maintain a non-destructive partition structure that supports both raw arrays (legacy) and objects containing `{ embedding: number[], lastUsed: number }`.
  - When writing to a cache partition, check the number of keys. If it grows past `500` keys, sort entries by `lastUsed` and evict the oldest ones to keep the sharded JSON files extremely small and clean.

### Requirement 4: Stale Embedding Index Clean-Up
- **Target File**: `src/core/embeddings.mjs`
- **Specification**:
  - Inside `buildEmbeddingsIndex()`, ensure any orphaned slugs (slugs that are in the embeddings index but no longer present in the active vault nodes list) are automatically deleted before writing the index to disk.

### Requirement 5: Local Embedded Server Stability
- **Verification**:
  - Run typescript typechecking and linting checks.
  - Verify daemon process starts cleanly, works correctly, and does not leak event loops.

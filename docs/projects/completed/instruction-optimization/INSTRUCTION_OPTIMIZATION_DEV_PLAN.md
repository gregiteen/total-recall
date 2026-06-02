# Instruction Optimization Development Plan

This document outlines the step-by-step development strategy for minifying injected prompts, implementing hybrid semantic/lexical search, and optimizing system latency.

## Phase 1: Context Minification & Dynamic Context
1. **Refine formatting logic in `surface.mjs`**: Modify the heuristic rule summarizer (`formatNodes`) to use a clean combination of the title and first line of the body. Limit to 180 characters.
2. **Add optional LLM Rule Compacter**: Create an optional compile configuration to run a background LLM query to minify long rule descriptions when `TR_LLM_COMPACT=true` is enabled.
3. **Partition Categories**: Enforce that only `invariants`, `preferences`, and `anti-patterns` are injected into shims, leaving `facts`, `concepts`, and `decisions` strictly search-only.

## Phase 2: Hybrid Search & Scoring
1. **Develop Lexical Scorer**: Build a simple keyword density/contains-based TF-IDF approximation scorer in `search.mjs` that scores matches in slugs, titles, tags, and bodies.
2. **Implement Concurrent Hybrid Scoring**: Modify `semanticSearch` to run both cosine similarity vector search and the lexical scorer.
3. **Perform Reciprocal Rank Fusion (RRF)**: Blend vector and lexical search rankings using RRF to yield a robust final result list.

## Phase 3: Latency & Compilation Upgrades
1. **Create Pluggable Vector Index Module**: Abstract vector storage and similarity searches into a dedicated `vector-store.mjs` file, paving the way for native VSS engine integration.
2. **Async Compilation Deferral**: Modify the node-writing interface in `vault.mjs` to optionally compile shims/embeddings asynchronously, returning immediately to the caller to avoid synchronous blockages.

## Phase 4: Testing & Verification
1. **Unit Testing**: Add tests for rule compaction, hybrid RRF matching, and asynchronous node compilation.
2. **End-to-End CLI Verification**: Test `npx total-recall compile` and `npx total-recall recall` locally in the CLI.

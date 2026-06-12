# SSSS Improvements Development Plan

This plan breaks down the Total Recall-specific tasks (derived from Phase 4 of the overarching SSSS roadmap).

## Phase 1 — Secure Memory Validation
1. Hook `.agent/memory-vault/**` bypass into `TotalRecallMemoryValidator`.
2. Add schema v2 conditional validation to the `total-recall` memory toolchain.
3. Add unit tests for rejected unvalidated memory commits.

## Phase 2 — Feedback Privacy and Scopes
1. Define the 5 feedback privacy scopes (`local_thread`, `workspace`, `account`, `system_candidate`, `system_promoted`).
2. Update feedback APIs to require an explicit scope label.

## Phase 3 — Optimizer Promotion Rules
1. Implement provenance stripping utility functions.
2. Create promotion workflow for moving insights from `workspace` to `system_candidate` to `system_promoted`.
3. Add tests to ensure private thread data fails the provenance check if not properly stripped.

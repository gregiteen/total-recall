# SSSS Improvements Project Tracker

## ✅ Phase 1: Secure Memory Validation
- [x] Hook `.agent/memory-vault/**` bypass into `TotalRecallMemoryValidator`.
- [x] Add schema v2 conditional validation to the memory toolchain.
- [x] Add unit tests verifying schema rejection of invalid memory commits.

## ✅ Phase 2: Feedback Privacy and Scopes
- [x] Define the feedback privacy scopes in the type system.
- [x] Update feedback APIs to require scope.
- [x] Prevent workspace feedback from leaking into system cache.

## ✅ Phase 3: Optimizer Promotion Rules
- [x] Implement provenance stripping functions.
- [x] Create promotion workflow (`workspace` -> `system_candidate` -> `system_promoted`).
- [x] Add strict tests for provenance stripping to ensure no PII leakage.

## ✅ Phase 4: Testing & Verification
- [x] Run automated test suite using `vitest` to verify zero regression.
- [x] End-to-end integration test proving a memory node fails generic validation but passes Total Recall validation.
- [x] End-to-end test verifying feedback cannot escalate to `system` without anonymization.

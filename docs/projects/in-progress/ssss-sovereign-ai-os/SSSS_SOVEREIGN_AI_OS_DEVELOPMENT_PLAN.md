# SSSS Sovereign AI OS Development Plan

- **Plane**: Projects
- **Last Updated**: 2026-05-15
- **Summary**: Consolidated Total Recall roadmap aligned with UltraChat's SSSS Sovereign AI OS master epic.

## Phase 0: Roadmap Consolidation

- Create this master project.
- Archive previous Total Recall in-progress projects as superseded history.
- Update README and architecture docs to state that Total Recall is the canonical SSSS reference implementation.
- Keep prior task history available for mining into this tracker.

## Phase 1: Canonical SSSS Spec

- Update `.agent/skills/ssss/SKILL.md` as the canonical living spec.
- Add schema proposal and migration conventions.
- Add reusable validator exports.
- Add conformance fixtures for files, operations, patches, events, and derived indexes.
- Add versioned release metadata.

## Phase 2: Reference Kernel

- Define safe SSSS operation application.
- Add patch validation and conflict detection.
- Add file leases and idempotency keys.
- Add deterministic projection rebuild commands.
- Add drift detection between canonical files and derived artifacts.

## Phase 3: Local Brain Runtime

- Stabilize Gemma 4 runtime packaging.
- Support Ollama and llama.cpp runtime modes.
- Expose a stable OpenAI-compatible endpoint.
- Publish model/runtime metadata so UltraChat can register the brain as `MODEL.md`.
- Add health checks, runtime capability reporting, and model benchmark metadata.

## Phase 4: Dream Cycle And User Optimizer

- Convert optimizer output into proposal files.
- Add proposal categories for memory, skills, workflows, model routing, tool adapters, stale knowledge, and schema friction.
- Add local eval gates.
- Add acceptance/rejection tracking.
- Promote accepted proposals into future context.

## Phase 5: Admin Protocol Evolution

- Keep user-local optimization separate from SSSS core evolution.
- Add admin-reviewed SSSS schema proposals.
- Add migration generator and migration tests.
- Add release notes and signed release metadata.
- Add upgrade command that safely migrates user vaults.

## Phase 6: UltraChat Integration

- Provide a stable brain endpoint for UltraChat.
- Provide model registration metadata for `models/catalog/total-recall/gemma4/MODEL.md`.
- Provide conformance fixtures consumed by UltraChat tests.
- Provide export/import/sync flows that preserve user sovereignty.

## Phase 7: Testing And Verification

- Add clean-host deployment test.
- Add SSSS lint/conformance test suite.
- Add brain endpoint smoke tests.
- Add import/export round-trip tests.
- Add Dream Cycle proposal tests.
- Add model runtime health tests.

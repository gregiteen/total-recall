# SSSS Sovereign AI OS Project Tracker

- **Plane**: Projects
- **Last Updated**: 2026-05-15
- **Summary**: Single active Total Recall tracker aligned with the UltraChat SSSS Sovereign AI OS epic.

## Canonical Goal

Total Recall is the open-source canonical SSSS spec, reference kernel, local sovereign brain, and conformance suite. UltraChat is the hosted product layer that runs on top of it.

## ✅ Phase 0: Roadmap Consolidation

- [x] Create Total Recall master SSSS Sovereign AI OS PRD.
- [x] Create Total Recall master development plan.
- [x] Create Total Recall master tracker.
- [x] Create Total Recall handoff.
- [x] Archive old in-progress Total Recall projects as superseded history.
- [x] Align Total Recall docs with UltraChat's new end-state.

## ⏳ Phase 1: Canonical SSSS Spec

- [x] Update `.agent/skills/ssss/SKILL.md` with operation, patch, event, proposal, migration, and release file types.
- [x] Add formal schema version policy.
- [x] Add admin protocol evolution policy.
- [x] Add user-local optimizer boundary policy.
- [x] Add conformance fixtures for all current file types.
- [x] Add conformance fixtures for invalid examples and conflict records.

## ⏳ Phase 2: Reference Kernel

- [x] Implement safe SSSS operation validator.
- [x] Implement patch conflict detector.
- [x] Implement file lease records.
- [x] Implement idempotency keys for operation application.
- [x] Implement projection rebuild command.
- [x] Implement drift detector for derived indexes.
- [x] Implement rollback path from file/Git snapshots.

## ⏳ Phase 3: Local Brain Runtime

- [x] Fix deploy scaffold bug in `src/cli/deploy.mjs`.
- [x] Package stable Gemma 4 runtime path for fresh hosts.
- [x] Support Ollama runtime mode.
- [x] Support llama.cpp runtime mode.
- [x] Expose stable OpenAI-compatible `/v1/chat/completions`.
- [x] Expose model health/capability endpoint.
- [x] Publish model metadata for UltraChat model catalog registration.

## ⏳ Phase 4: Dream Cycle And User Optimizer

- [x] Define `type: proposal` schema.
- [x] Write memory cleanup proposals instead of direct mutations.
- [x] Write skill improvement proposals.
- [x] Write workflow repair proposals.
- [x] Write model routing proposals.
- [x] Write stale knowledge refresh proposals.
- [x] Add local eval gate for proposal promotion.
- [x] Track accepted/rejected proposals as future training data.

## ⏳ Phase 5: Admin SSSS Protocol Evolution

- [x] Define `type: schema-proposal`.
- [x] Define `type: migration`.
- [x] Define `type: release`.
- [x] Add migration test harness.
- [x] Add signed release metadata.
- [x] Add vault upgrade command.
- [x] Ensure user-local optimizer cannot silently change protocol law.

## ⏳ Phase 6: UltraChat Integration

- [x] Document Total Recall brain model registration contract.
- [x] Provide sample `models/catalog/total-recall/gemma4/MODEL.md`.
- [ ] Add UltraChat smoke-test instructions.
- [ ] Add conformance fixture package export.
- [ ] Add import/export compatibility test with UltraChat SSSS files.

## ⏳ Phase 7: Testing And Verification

- [ ] Clean-host deploy test passes.
- [ ] Brain endpoint smoke test passes.
- [ ] SSSS conformance suite passes.
- [ ] Import/export round-trip passes.
- [ ] Dream Cycle proposal tests pass.
- [ ] Projection rebuild tests pass.
- [ ] Migration rehearsal passes.

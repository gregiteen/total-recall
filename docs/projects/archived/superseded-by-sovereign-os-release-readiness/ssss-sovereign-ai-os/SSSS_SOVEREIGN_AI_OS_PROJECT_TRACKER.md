# SSSS Sovereign AI OS Project Tracker

> **⚠️ CONSOLIDATED 2026-05-18 — DO NOT TRACK NEW WORK HERE.**
> Remaining work (Phase 7 Testing & Verification, Phase 8 UltraChat session
> sync and LLM Proxy Mode) has been carried into the single active epic:
> `docs/projects/in-progress/sovereign-os-release-readiness/`.
> This file is retained as completed-phase evidence (Phases 0–6).

- **Plane**: Projects
- **Last Updated**: 2026-05-16 (Phase 1: vendored the canonical SSSS spec and the authoring-principles companion doc, byte-identical with UltraChat)
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
- [x] Vendor the canonical vendor-neutral SSSS spec — `.agent/skills/ssss/references/ssss-spec.md`, byte-identical with UltraChat.
- [x] Vendor the SSSS authoring-principles companion doc — `.agent/skills/ssss/references/authoring-principles.md`, byte-identical with UltraChat. Authoring principles (`[spec]` / `[craft]` tagged), import principles (I1–I7), and semantic-conversion principles (C1–C9); linked from `SKILL.md`.

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

## ✅ Phase 6: UltraChat Integration

- [x] Document Total Recall brain model registration contract.
- [x] Provide sample `models/catalog/total-recall/gemma4/MODEL.md`.
- [x] Add UltraChat smoke-test instructions.
- [x] Add conformance fixture package export.
- [x] Add import/export compatibility test with UltraChat SSSS files.

## ⏳ Phase 7: Testing And Verification

- [ ] Clean-host deploy test passes.
- [ ] Brain endpoint smoke test passes.
- [ ] SSSS conformance suite passes.
- [ ] Import/export round-trip passes.
- [ ] Dream Cycle proposal tests pass.
- [ ] Projection rebuild tests pass.
- [ ] Migration rehearsal passes.

## ⏳ Phase 8: Active Intelligence Engine

### Workstream 0: Session Ingestion
- [x] Implement `src/core/session-watcher.mjs` with `fs.watch()` directory monitors. → `startWatching()`, `scanAndIngest()`
- [x] Implement Claude Code adapter (`~/.claude/projects/` JSONL ingestion). → `parseClaudeCode()` in session-watcher.mjs
- [x] Implement Codex adapter (`~/.codex/sessions/` JSONL ingestion). → `parseCodex()` in session-watcher.mjs
- [x] Implement Gemini CLI adapter (`~/.gemini/tmp/` JSON ingestion). → `parseGeminiCli()` in session-watcher.mjs
- [x] Implement Antigravity adapter (`~/.gemini/antigravity/brain/*/logs/overview.txt` ingestion). → `parseAntigravity()` in session-watcher.mjs
- [x] Implement Cursor adapter (`~/.cursor/projects/` JSONL ingestion). → `parseCursor()` in session-watcher.mjs
- [ ] UltraChat session sync via Sync Fabric (VFS markdown → local sessions).
- [ ] Optional: LLM Proxy Mode (`total-recall proxy start`).

### Workstream 1: Task Scheduler
- [x] Implement `src/core/scheduler.mjs` with priority queue and layer-weighted dispatch. → `TaskQueue`, `createScheduler()`, `LAYER_WEIGHTS`
- [x] Integrate scheduler into daemon loop (replace 60s sleep with continuous dispatch). → `src/core/daemon-loop.mjs` continuous task dispatch loop
- [x] Implement idle task generation (queue is never empty). → `generateIdleTask()` round-robins across 4 strategies

### Workstream 2: Conscious Layer — Rule Enforcement
- [x] Implement Assertive Injection in `surface.mjs` (⚠️/🚫/📋 prefixes, topic→skill routing table). → `assertivePrefix()`, `buildPreamble()`, `buildSkillRoutingTable()`
- [x] Implement Rule Compliance Auditor (`src/core/compliance-auditor.mjs`). → `runComplianceAudit()`, `escalateViolatedRules()` in post-mortem.mjs
- [x] Implement Session Post-Mortem (`src/core/post-mortem.mjs`). → `runPostMortem()`, `readSessionTranscript()`, draft node writers
- [x] Implement violation tracking and automatic rule escalation (3+ violations → `priority: absolute`). → `escalateViolatedRules()` bumps importance/confidence and auto-promotes to absolute

### Workstream 3: System 2 Layer — Deliberate Reasoning
- [x] Implement Inference Engine (`src/core/inference-engine.mjs`). → `runInferenceTask()` draws conclusions from node clusters; writes draft nodes + conflict records
- [x] Implement Memory Synthesizer (LLM-powered dedup and merge proposals). → `runSynthesisTask()` MERGE/LINK/KEEP verdicts in inference-engine.mjs
- [x] Implement Conclusion Writer (Research → Active validation gate). → `validateDraftNode()`, `runConclusionWriter()` in conclusion-writer.mjs; APPROVE/NEEDS_REVISION/REJECT gate

### Workstream 4: Research Layer — Knowledge Acquisition
- [x] Wire Fact Seeker into `research.mjs` (LLM-powered knowledge gap detection). → `runFactSeeker()` in clarity-rewriter.mjs identifies gaps and queues research tasks
- [x] Implement Staleness Verifier (LLM-evaluated fact currency checks). → `runStalenessCheck()` in clarity-rewriter.mjs; STILL_VALID/POSSIBLY_STALE/LIKELY_OUTDATED
- [x] Implement Evidence Collector (background research from session post-mortem topics). → Skill-gap tasks from `runPostMortem()` + fact-seeker tasks from `runFactSeeker()` feed research queue

### Workstream 5: Memory Maintenance
- [x] Implement Clarity Rewriter (LLM-evaluated node quality proposals). → `runClarityReview()` in clarity-rewriter.mjs; quality score + rewrite proposals
- [x] Implement Smart Decay (LLM-evaluated retention vs blind half-life). → `runSmartDecay()` in optimizer.mjs; RETAINED/ARCHIVED/DECAYED verdicts per node, proposals only


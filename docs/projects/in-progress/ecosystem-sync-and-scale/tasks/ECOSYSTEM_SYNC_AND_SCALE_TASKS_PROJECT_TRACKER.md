# ECOSYSTEM SYNC AND SCALE: TASKS PROJECT TRACKER

## Goal
Audit, stabilize, and standardize the TASKS module for autonomous ecosystem sync.

## ⏳ Phase 1: Deep Audit & Data Organization
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).

## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.

## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

## Batch 1 Audit Findings
- [ ] `handleToggleExpand`: Add visible error state/toast when `readMemory` fails, instead of silent console log.
- [ ] Polling loop: Add exponential backoff to `fetchTasks`, `fetchResearch`, and `fetchDaemonLogs` to prevent spamming errors when backend is offline.

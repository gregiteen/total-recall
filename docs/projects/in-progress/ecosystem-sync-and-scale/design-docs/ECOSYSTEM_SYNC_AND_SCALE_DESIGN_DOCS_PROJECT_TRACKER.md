# ECOSYSTEM SYNC AND SCALE: DESIGN_DOCS PROJECT TRACKER

## Goal
Audit, stabilize, and standardize the DESIGN_DOCS module for autonomous ecosystem sync.

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

## Batch 4 Audit Findings
- [ ] Remove statically hardcoded `CORE_DOCS` and `DEV_GUIDES` and wire up the actual `fetchDesignDocs()` response data to the sidebar.

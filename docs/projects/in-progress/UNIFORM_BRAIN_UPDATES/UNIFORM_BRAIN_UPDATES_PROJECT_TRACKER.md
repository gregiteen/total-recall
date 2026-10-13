---
type: project_document
title: UNIFORM_BRAIN_UPDATES — Project Tracker
description: Uniform SSSS and Total Recall package updates for registered brains and installed plugin consumers.
tags: [project-management, UNIFORM_BRAIN_UPDATES]
timestamp: 2026-10-13T17:15:00Z
---

# UNIFORM_BRAIN_UPDATES — Project Tracker

Project Prefix: `UNIFORM_BRAIN_UPDATES` · Kanban State: In Progress · Author: Codex · Date: 2026-10-13

- [x] Audit existing updater and run remote baseline.
- [x] Implement uniform all-brains update function and CLI.
- [x] Verify remote regressions and quality gates (Total Recall main).
- [ ] Apply and verify the authorized local rollout.

## Action Log

- 2026-10-13T17:15:00Z — Codex: Read Total Recall context (ready:true), owner sources and instructions; audited root-only npm updater and package consumers. Verified npm/pnpm docs. Baseline updater/routes 15/15 on Mac mini. Greg selected local installations without shared dependency symlinks. Initial package rollout remains underway; no push, publication or deployment.

- 2026-10-13T17:24:00Z — Codex: Implemented explicit all-brains dry-run/apply CLI and uniform package plan, alias preservation, nested/workspace discovery, independent dependency installation, per-owner lock and rollback, and actual-resolution checks. Remote regressions initially exposed test auth setup and macOS temp-path aliasing; fixed test isolation and canonical paths. Published SSSS conformance found stale 0.10.3 fixture provenance; corrected source fixture to 0.11.0 (not republished). Stopped superseded temporary installer and all owned children. Current dry-run covers 43 consumers, 40 pending, zero planning failures.

- 2026-10-13T17:32:00Z — Codex: Audit validator exits 0; 24 updater/API tests passed on mini. Expanded checks to missing/malformed roots and updated CLI defaults regression. Fleet installation is running through updateAllBrains with per-owner logs. Exact-source snapshot exposed two verification issues: ephemeral in-repo update lock raced snapshot copying (future locks moved to OS temp), and snapshot reset file mtimes, causing the dist-freshness gate to report stale source/bundle ordering. Fixed timestamp preservation in the owning code-quality plugin and added a regression. Prior fast run passed 7/8 checks but failed dist freshness; do not count it as green.

- 2026-10-13T23:58:00Z — Claude: Scope narrowed by Greg to Total Recall main; plugin repositories and the fleet rollout are handled ad hoc. Refreshed the sanctioned mini snapshot (rsync of the hashed source set, npm ci so @ssss/cli resolves 0.11.0). Fast gates initially failed two checks: ssss-registry (mini had stale @ssss/cli 0.10.3, fixed by npm ci) and shipped-package-paths (a generated per-brain `system/plugins/mesh.md` record had been written into the scaffold vault). Root cause: `ensurePluginRecord` wrote install records for bundled scaffold-scope plugins into the package's own scaffold vault, which also failed init-scaffold-ssss in the full suite (2106/2107). Fixed at the source in plugin-store.mjs (scaffold plugin records live in the active global brain vault) with a regression test; removed the stray scaffold record. Final: fast gates 8/8 clean, full suite 343 files / 2108 tests pass on the mini, exit 0. The remaining `apply` rollout across plugin repos was not run.

---
type: project_document
title: CLI_AGENT_SKILL_UPDATE — Project Tracker
description: Verified generic terminal agent skill and targeted repository propagation.
timestamp: 2026-09-30T19:14:11Z
tags: [project-management, skills, cli-agents]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# CLI_AGENT_SKILL_UPDATE — Project Tracker

- [x] CA-001–007 audited; installed safe metadata and official docs checked.
- [x] Mac mini existing-package baseline recorded (exit 1, four structural findings).
- [x] Back up source/destinations and unrelated-skill hash baseline.
- [x] Update entrypoint/catalog and full reusable skill package.
- [x] Verify helper tests on Mac mini, controlled Codex execution and truthful auth states.
- [x] Adopt generic mis-scoped copies; update canonical registry metadata.
- [x] Review targeted skip-discover dry-run then propagate available roots/surfaces.
- [x] Verify managed hashes, unrelated skills, missing paths and process cleanup.
- [x] Record current source/runtime limits and final handoff.

Core runtime/meta-harness defects are separate implementation dependencies; this skill must direct subscription runs through the verified credential-clean helper until those paths have equivalent evidence.


## CA-008 — Targeted skill sync masks collision failure

- [x] CA-008: add real temp-registry collision regression for targeted push/sync/pull dry-run, prove red on Mac mini, then report error and set nonzero exit status before success output; prove green and no mutation.

CA-008 verification, 2026-09-30: Mac mini background focused run of `src/cli/skill-sync.spec.mjs` reproduced all three failures (exitCode 0 instead of 1); after the early error-return fix all three passed. Real temporary registry/source/divergent discovered-install fixtures exercised push, sync and pull with pinned AGENT_DIR and skip-discover dry-run; registry and both skill files stayed byte-identical. Remote logs: `/tmp/skill-sync-red.log`, `/tmp/skill-sync-green.log`. This is focused regression evidence only; full exact-tree suite remains the release gate.

## Verification Log

- September 30, 2026: Mac mini `/tmp/tr-cli-agents.k6cVIM/full-suite-3.log`, exit file `0`: **362 files / 2,228 tests passed**, 174.67 seconds. This verifies the reconciled working-tree snapshot before the subsequent shared startup implementation; it is not a release or deployed-runtime certificate.
- Mac mini `helper-final-2.log`, exit `0`: **13 tests passed**, no skipped/cancelled/todo tests; final structural package check `package-final.log`, exit `0`, no findings.
- Live Codex subscription probe produced `CLI_SUBSCRIPTION_PROBE_OK` through the credential-clean alias helper. Its default model failed as unsupported; a model selected from the current account catalog succeeded. No model pin was persisted.
- Claude authentication changed during this work: latest safe status confirms subscription login, but the actual prompt failed with its weekly quota limit. Initial missing-login observations remain historical. Agy authentication and Gemini entitlement remain unverified; neither is certified usable.
- CLI `skill status cli-agents --global` confirms **25 installs, no drift**, source version `3.0.0`, whole-package hash `2ca8b0a60042b47b`. Targeted skip-discover push dry-run confirms 26 locations including source already in sync. Available scope: **24 Git repositories and one non-Git workspace**, complete nine-file package and IDE aliases. One missing tracked workspace was reported unavailable; no phantom directory was created.
- Before/after unrelated entrypoint comparison: 362 of 364 unchanged; Total Recall repo-expert and CRM start changed concurrently. The cli-agents propagation commands did not write those files. Do not claim that all unrelated files were unchanged or attribute those edits without evidence.
- Recoverable original package/operator registry backups: global brain `backups/cli-agents-2026-09-30.tar.gz` (mode 0600), verified 260 archived regular files against byte hashes. Loose backup skill entrypoints were removed after archive verification to prevent stale skill discovery. All owned probe/test/propagation commands completed.

## Action Log

- **Retrospective, September 30, 2026 — root and delegated reviewers:** Read canonical package, active operator registry and CLI/runtime source; inventoried installed tools and official contracts; recorded CA-001–008. Archived original source and adopted generic destinations; authored catalog of 14 documented terminal agents, four tested adapter contracts, discovery/helper/evaluation/delegation resources. Commands and results appear in the verification log. Core runtime credential-injection and independent harness defects remain explicitly uncertified dependencies.
- **Retrospective, September 30, 2026 — root:** Registered and deployed only cli-agents through Total Recall CLI; reconciled available roots and IDE aliases; packed backups after finding stale entrypoints in loose backup directories. Verified managed hashes and recorded the two concurrent unrelated changes and missing destination honestly.
- **Retrospective, September 30, 2026 — root and plugin_docs_b:** Added real collision regressions and corrected targeted skill push/sync/pull error exit handling; corrected the three missing route-manifest records; ran the Mac mini complete suite after resolving snapshot/PATH artifacts. No commit, publication or production deployment.
- **2026-09-30T19:05Z — root:** Resumed CLI-first work after the user's correction. Used `node bin/total-recall.mjs skill status cli-agents --global` and targeted push dry-run: no drift, no pending copies. Used `mesh access` and `mesh exec` to re-read Mac mini exit files and summaries: full suite 2,228/2,228 and helper 13/13 passed. Updated this tracker and handoff with actual results; delegated separate shared PM and startup projects with disjoint ownership and mandatory action logs.

- 2026-10-07T16:39:48Z — Codex: Consolidated this project into TR_CORE_PLUGIN_SPLIT at Greg's request. Historical checkboxes were preserved as claims; every item is mapped in the successor source register. No implementation completion is inferred from this move.

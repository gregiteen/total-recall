---
type: project_document
title: CLI_AGENT_SKILL_UPDATE — Development Plan
description: Verified generic terminal agent skill and targeted repository propagation.
timestamp: 2026-09-30T19:14:11Z
tags: [project-management, skills, cli-agents]
---

# CLI_AGENT_SKILL_UPDATE — Development Plan

1. Audit baseline and official installed contracts; record findings before edits.
2. Back up canonical package and explicit generic scoped destination, excluding backups from exported artifacts. Author generic entrypoint/catalog, credential-clean helpers, meaningful evaluation and delegation prompts; remove active stale model/permission references.
3. Run helper evaluations in background on Mac mini; controlled authenticated Codex probe; record Claude authentication and quota separately and Agy/Gemini limits honestly.
4. Re-register global source, explicitly adopt only this generic skill, review skip-discover push dry-run, then propagate. Add missing available repo destinations with CLI; preserve IDE symlinks and user state.
5. Verify source-managed file hashes on each actual root/surface, catalog scope/provenance, unchanged unrelated scoped packages and no orphan helper processes. Record unavailable paths and completion evidence. No commit/publish/deployment.


## CA-008 — Targeted skill sync masks collision failure

- [x] CA-008: add real temp-registry collision regression for targeted push/sync/pull dry-run, prove red on Mac mini, then report error and set nonzero exit status before success output; prove green and no mutation.

CA-008 verification, 2026-09-30: Mac mini background focused run of `src/cli/skill-sync.spec.mjs` reproduced all three failures (exitCode 0 instead of 1); after the early error-return fix all three passed. Real temporary registry/source/divergent discovered-install fixtures exercised push, sync and pull with pinned AGENT_DIR and skip-discover dry-run; registry and both skill files stayed byte-identical. Remote logs: `/tmp/skill-sync-red.log`, `/tmp/skill-sync-green.log`. This is focused regression evidence only; full exact-tree suite remains the release gate.

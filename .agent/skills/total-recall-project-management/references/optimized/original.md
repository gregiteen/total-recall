---
name: total-recall-project-management
description: "Use alongside the shared project-management skill for verified Total Recall-specific planning, readiness and release constraints. Read the shared skill first; this optional overlay contains only local differences."
repo_scoped: true
---

# Total Recall — Thin Project Management Overlay

Read the shared `project-management` skill first. It owns the five-file lifecycle, tracker checkboxes and mandatory bottom append-only Action Log. Do not duplicate those mechanics here. Resolve active work from the user's current request and actual trackers; this overlay contains no current epic or completion claim.

## Verified local boundaries

Total Recall's portable memory and instruction surfaces are the core product path. Optional capabilities belong to plugins under the applicable extraction requirements. SSSS is the protocol/spec and validator dependency, not a specification owned by this overlay. For schema or persistent application-state changes, read the local `ssss` skill and inspect the actual composed registry and mutation implementation. Do not assume a planned contract is already wired into every route.

Use `node bin/total-recall.mjs` in this source checkout for supported CLI operations; installed users resolve their own `total-recall` executable. Memory operations use that CLI, never direct vault edits. Project trackers under `docs/projects` are ordinary Markdown documentation and may be edited normally when no verified append command exists. Preserve injected instruction blocks.

## Readiness for the changed path

Prioritize memory/data safety, schema integrity, instruction correctness and core workflow reliability before polish. Treat lost writes, schema failures, credential exposure and false success as blockers. Review ownership boundaries between core, plugins, host adapters and projections against current code.

A readiness walkthrough identifies snapshot/digest, date, environment, actor and observed results. Exercise only the path relevant to the change: initialize an isolated permitted fixture; save and recall validated memory; compile and inspect connected instruction surfaces; verify applicable authorization and failed-write behavior; and verify plugin/provider actions separately when included in scope. Synthetic/local tests do not prove provider execution, public exchange, deployment or sustained daemon operation. Do not prescribe a fixed model, CPU load, or an unverified universal operating-system checklist.

## Actual test and release configuration

`package.json` defines `npm test` as `vitest run`, `npm run check:dist`, and `npm run check:ssss-registry`. `vitest.config.ts` uses jsdom by default, fileParallelism false and excludes `.agent/**`, `.agents/**`, `.claude/**`, `.cursor/**`; individual test environment annotations must be inspected rather than assumed. Therefore skill helpers need separate targeted verification.

Read `.agent/skills/code-quality/config.json` and its skill for actual gates: dist freshness, open-source paths, shipped package paths, scaffold brain state, SSSS registry and remote test suite. Do not invent lint/typecheck scripts. Run suites/gates on the sanctioned Mac mini in background according to the user's instructions; resolve access through CLI/config rather than hardcoding machine details in reusable instructions. Record working-tree baselines honestly and separate post-edit checks.

Read local `push` before publishing a release and obey the user's authorization and current branch state. No direct-trunk push is authorized by this overlay. Verify the native backend boot and appropriate gates before a release; production/provider readiness requires its own evidence. The coordinator records delegated reads, decisions, writes, commands, tests, failures and verification in the shared tracker's final Action Log before completion.

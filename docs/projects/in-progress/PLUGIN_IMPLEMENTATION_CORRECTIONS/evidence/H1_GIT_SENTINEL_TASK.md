---
type: project_document
title: H1 Git Sentinel bounded DSH task
description: Test-first repair of Git Sentinel porcelain parsing and truthful upstream status.
timestamp: 2026-10-02T02:28:00Z
tags: [plugins, task, git-sentinel, parallel-work]
---

# H1 task packet

Parent dispatch prerequisites (not worker work): source audit and five-file plan/task registration complete; fresh main baseline at `/tmp/tr-plugin-parallel-20261002/baseline` finishes with captured command, completion, exit and findings, not merely matching files. Parent reports 1653 exact file hashes; record baseline result separately. Run project-management/check-audit.mjs through the sanctioned remote workflow and retain result before edits. Parent verifies authenticated DSH CLI, actual configured V4.1 Flash identifier, permissions and parser; no API key injection. Prompt through verified helper stdin, bounded runtime/concurrency; await and clean owned job. Initial source packet and file hashes must match current dirty tree. Parent owns shared tracker Action Log and integration of results.

Worker guardrails: requester Greg, repository /Users/greg/Github/total-recall. Read AGENTS.md and .agent/skills/total-recall/SKILL.md, run ready:true context for scoped edit/test (raise explicit budget after overflow). Preserve all preexisting/concurrent changes. Work only assigned files; no checkout/reset/stash, git commits, push/release, vault writes, secrets reads, model selection changes, agents, broad reformats or other repositories. Add synthetic regressions before production changes. Tests run only on configured Mac mini in background after source identity comparison; parent owns remote scheduling, so return test command if no authorized remote lane is supplied. Never substitute local tests. If parent supplies a remote lane, read local test skill before tests; fixture cleanup mandatory. Report changed files, before/after behavior, commands/exits, limitations, diff and any blocker. Do not claim full readiness from mocked tests.

## Worker prompt

Repair PIC-018 in Git Sentinel without changing other plugins or host interfaces. Own ONLY `plugins/git-sentinel/cli.mjs` and new `plugins/git-sentinel/cli.spec.mjs`. Read-only references: `plugins/git-sentinel/plugin.json`, `src/core/plugin-runner.mjs`, `src/cli/plugin/host-context.spec.mjs`, `vitest.config.ts`. Keep existing public report keys; add explicit upstream/status uncertainty fields instead of fake zero values. argv convention is `[node,total-recall,git-sentinel,verb,...flags]`; exported async run executes in host and must never process.exit(). Preserve audit default, diff verb, text output and --json.

Observed bugs: helper `.trim()` strips the leading space of the first porcelain line, turning unstaged modification into staged. All git failures collapse to null; status null becomes empty and claims clean. `git log @{u}..HEAD` failure/no upstream becomes zero and prints Up to date. Unknown action falls through to audit. Detect detached/unborn/no-upstream states explicitly and distinguish harmless missing upstream from actual command failure. Preserve success fields where known; unknown counters should be null with explanatory status, not zero. Failed essential worktree/status commands yield nonzero exit and honest structured JSON when requested. Unknown verb yields usage error/nonzero. Use bounded subprocess execution and avoid stderr leakage of unrelated private content.

Test-first regressions (node Vitest environment; isolated temp Git repo plus targeted execFileSync mocks for error paths):
1. Committed tracked file modified only in worktree: first status row starts space-M; stagedFiles=0, unstagedFiles=1.
2. Staged modification, both staged/unstaged, deletion, rename and untracked rows count correctly; filename spaces cannot change XY columns. Preserve existing totalDirty/isClean meaning.
3. Real clean repo with no upstream does not print Up to date or expose unpushedCommits=0 as known; detached HEAD and empty repo do not claim synchronized.
4. Known upstream: zero ahead is known/up-to-date; one local commit reports one ahead.
5. Status/rev-parse/log command failures are distinct; never clean or up-to-date due to failure; failed essential audit sets exitCode=1. Restore exitCode/cwd/spies in finally/afterEach; remove temp repos.
6. `diff`, `audit --json`, help/default and invalid verb; JSON parseable, error JSON honest, successful output keys preserved. Do not return text as JSON.

Use small named pure parsing/result helpers if useful; no full CLI framework. Parent verifies focused remote command:
`./node_modules/.bin/vitest run plugins/git-sentinel/cli.spec.mjs src/core/plugin-runner.spec.mjs src/cli/plugin/host-context.spec.mjs`
Tests first should expose observed failures; then pass after implementation. Remote fresh snapshot must include new spec and exact modified source. Stop after this scoped repair; extraction/default-install are separate tasks.

## Minimal source packet

Supply exact current full `plugins/git-sentinel/cli.mjs` (~100 lines), plugin.json and vitest.config.ts. Supply just host-context.spec header/fixture and plugin-runner relevant result/exit handling if budget is constrained. The observed snippets are `.trim()`, `statusOutput = git(...) || ''`, `unpushedCount = ... : 0`, and zero→Up to date. Include this complete prompt, current owned-file SHA256, baseline exit and ready context fingerprint. Do not inject all repository history or secret/config files.

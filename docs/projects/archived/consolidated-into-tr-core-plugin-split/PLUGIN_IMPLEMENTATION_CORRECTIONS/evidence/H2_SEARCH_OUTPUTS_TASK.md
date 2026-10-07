---
type: project_document
title: H2 Search outputs bounded DSH task
description: Test-first save receipt, deep-report and health repair with canonical config preserved.
timestamp: 2026-10-02T02:28:00Z
tags: [plugins, task, creative-search, parallel-work]
---

# H2 task packet

Parent dispatch prerequisites (not worker work): source audit and five-file plan/task registration complete; fresh main baseline at `/tmp/tr-plugin-parallel-20261002/baseline` finishes with captured command, completion, exit and findings, not merely matching files. Parent reports 1653 exact file hashes; record baseline result separately. Run project-management/check-audit.mjs through the sanctioned remote workflow and retain result before edits. Parent verifies authenticated DSH CLI, actual configured V4.1 Flash identifier, permissions and parser; no API key injection. Prompt through verified helper stdin, bounded runtime/concurrency; await and clean owned job. Initial source packet and file hashes must match current dirty tree. Parent owns shared tracker Action Log and integration of results.

Worker guardrails: requester Greg, repository /Users/greg/Github/total-recall. Read AGENTS.md and .agent/skills/total-recall/SKILL.md, run ready:true context for scoped edit/test (raise explicit budget after overflow). Preserve all preexisting/concurrent changes. Work only assigned files; no checkout/reset/stash, git commits, push/release, vault writes, secrets reads, model selection changes, agents, broad reformats or other repositories. Add synthetic regressions before production changes. Tests run only on configured Mac mini in background after source identity comparison; parent owns remote scheduling, so return test command if no authorized remote lane is supplied. Never substitute local tests. If parent supplies a remote lane, read local test skill before tests; fixture cleanup mandatory. Report changed files, before/after behavior, commands/exits, limitations, diff and any blocker. Do not claim full readiness from mocked tests.

## Worker prompt

Repair PIC-009/010/012 in Creative Search output handling. Own ONLY `plugins/creative-search/cli.mjs` and new `plugins/creative-search/cli.spec.mjs`. Read-only `plugins/creative-search/config.mjs`, plugin.json, `src/cli/remember.mjs` persistence success/error branch, plugin-runner.mjs host env and host-context.spec. Another lane owns config/generator/UI/manifest: do not edit those. Search config is already validated SSSS-backed; generator already returns string and does not fetch during compile. Preserve these improvements. No new network endpoint/integration or provider-call behavior in this packet. Parent provides official SearXNG current response contract before any changed provider transport; use existing `/search?format=json` integration here.

1. Save: `rememberToTR` uses TR_CLI/TR_PACKAGE_ROOT at module scope, then ignores spawn error/status/signal and returns stdout/stderr or ok. `saved` uses absence of word fail, which misreports failure. Resolve host CLI safely at call time (`TR_CLI` explicit path or existing `TR_PACKAGE_ROOT/bin/total-recall.mjs`); do not assume source-relative installed path or undefined argv. Return structured saved/error outcome. Require child status 0, no error/signal/timeout AND explicit successful persistence receipt from current remember command; it does not currently support --json, so do not invent that flag or broaden host changes. Current receipt includes `Permanent SSSS memory node created`; zero-exit empty/arbitrary output remains unconfirmed. Nonzero/error/timeout cannot become saved:true even if stdout includes success text. Empty results mean saved:false without child call. Failed save preserves displayed research results and sets nonzero CLI exit.

2. Deep: follow-up unique results are block-scoped and final report uses only top10; report constructed but never emitted/returned. Accumulate initial+follow-up candidates, dedupe by existing URL/title identity, emit report and return report plus true source count/engine list. Respect validated deepResearchSteps as bounded rounds; keep keyword extraction deterministic and request budget bounded. Preserve citations/URLs and initial query. Avoid hidden changes to autoSave/includeSnippets/engineGroups; those belong to config lane unless parent explicitly assigns them.

3. Health: current CLI always `ok:true` and healthy even when engines unresponsive; engine extraction only uses arrays. Distinguish healthy/degraded/unavailable/unknown evidence; return explicit measured state and engines from both `engine` and `engines`. No results/no observed engine is unknown evidence, not healthy. HTTP/timeout/malformed results must return honest nonzero failure through scoped run path rather than successful data. Engine availability is sampled, not complete registry. Do not add a hardcoded inventory or claim full active engine count. Preserve existing supported query/stats/categories behavior.

Write synthetic tests BEFORE patch (node environment; vi.mock config, stub fetch, mock spawnSync, restore process.exitCode/env/spies):
- Host path resolution works through TR_PACKAGE_ROOT; absent path fails without spawning; module imported before env assignment still resolves correctly.
- Child confirmed receipt/status0 gives saved:true; status1 with misleading success stdout, timeout/error/signal, status null, empty output, arbitrary zero-exit output give false/nonzero; output cannot leak secret values. Empty search results never spawn.
- Deep follow-up unique URL appears in returned/emitted report; duplicate initial/follow-up URLs appear once; counts/engines accurate; zero/empty keyword cases work; configured rounds bound request count.
- Health both engine shapes, unresponsive/degraded, zero engines unknown, 500/timeout/invalid JSON or absent results failure; no default green success. CLI outputs and structured data agree.

Focus only meaningful user-observable failures. If installed CLI receipt needs host changes, report exact prerequisite to parent rather than modify outside ownership. Focused remote command:
`./node_modules/.bin/vitest run plugins/creative-search/cli.spec.mjs plugins/creative-search/config.spec.mjs src/cli/plugin/host-context.spec.mjs src/core/plugin-runner.spec.mjs`
Parent then conducts installed CLI/save proof with isolated temporary brain and cleanup. Unit mocks are not real provider or actual canonical save proof.

## Minimal source packet

Supply current full cli.mjs (~425 lines) and config.mjs (~125 lines), plugin.json CLI block and config version. Also supply remember.mjs:340–375 actual failure/receipt output and host-context.spec relevant TR_PACKAGE_ROOT probe (~55 lines). Existing relevant segments: cli search transport 27–46, rememberToTR 79–93, deep 175–270, remember 273–313, health 363–380. Provide complete source rather than excerpts if within model context, preserving unrelated functions. Include owned-file SHA256/current dirty status, baseline exit, ready context fingerprint and the parent’s verified SearXNG contract note. No vault/config/credential dump.

---
type: project_document
title: CLI_AGENT_SKILL_UPDATE — Audit
description: Verified generic terminal agent skill and targeted repository propagation.
timestamp: 2026-09-30T19:14:11Z
tags: [project-management, skills, cli-agents]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# CLI_AGENT_SKILL_UPDATE — Audit

> **Project Prefix**: `CLI_AGENT_SKILL_UPDATE`
> **Kanban State**: In Progress
> **Date**: 2026-09-30
> **Audit Status**: Complete
> **Audited commit**: e5d9aad plus preserved concurrent working tree

Bounded skill/package/propagation review; initial observations are retained with current dispositions below.

## 1. Scope and method

read complete invoked SKILL.md, live registry, relevant runtime/registry/CLI source and metadata; inspect installed CLI version/help and safe auth status. Official headless/auth docs fetched. No live prompt or provider call in baseline. Core dispatch repair is separately identified, not certified by a skill rewrite.
## 2. Inventory

canonical source is global brain skills/cli-agents; global .agent and .codex aliases resolve there. Existing package has SKILL.md, agents.yml and outdated text references; lacks scripts/evals/subagents. Nineteen recorded installs, eighteen existing; twenty known roots include home and one missing path. Generic SSSS copy is erroneously scoped, contains no SSSS expertise and has legacy monitor data that must never propagate.
## 3. Runtime surface

installed agy 1.2.14, Claude 2.1.201, Codex 0.142.5, Gemini 0.42.0. First live registry is modules/agents/agents.yml, ahead of nested skill YAML. Core runtime is async spawn, not skill's claimed synchronous engine; meta-harness is an independent policy/parse path.
## 4. Data and state

skill package is reusable instructions/tooling; local auth stays in vendor stores, credentials in TR encrypted store. Registry mutations use TR skill CLI; no manual vault writes. Existing monitor database preserved locally, excluded from package.
## 5. Integrations

user authorizes Codex/Claude subscription workflows. Codex reports ChatGPT login; Claude reports no login. Agy auth unknown; Gemini selected OAuth type does not prove entitlement. Preserve disabled provider policy; never substitute API billing.
## 6. Security and privacy

do not print keychain/auth tokens, inherit provider keys into subscription probes, default to bypass/yolo, or shell-interpolate prompts. Verify exit and structured failure/artifact; manage bounded processes/timeouts.
## 7. Standing-rule conflicts

generic paths/config/models only; no product names/personal binary paths in portable skill. Preserve unrelated scoped skills and user files; explicit all-repo adoption applies only this generic skill.
## 8. Quality baseline

existing package structural check ran in background on Mac mini at /tmp/tr-cli-agents.k6cVIM: exit 1, three missing populated folders and missing trigger description. At the initial audit, this was a skill-only task. CA-008 subsequently required a narrow CLI error-exit correction; final Mac mini working-tree full-suite evidence is recorded in this project tracker (362 files /2,228 tests passed). Fresh helper evaluation runs on mini after update.
## 9. Debt and dead code

stale model pins, claims unlimited usage, default permission bypass, empty Claude tools, obsolete usage-model assertions and unrelated example products. Runtime injects API keys, meta-harness has parse/remote quoting gaps; skill must not falsely imply those paths preserve subscriptions.
## 10. Deploy and operations

back up source and physical destinations; inspect targeted dry run before registry propagation. Deploy does not support dry-run; push without skip-discover can mutate discovery state. Verify package hashes and aliases after updates; no npm publish/push/deploy requested.
## 11. Content and product fit

documented CLI capability differs from installation, auth, registry support and verified execution. Cover all discovered agents and extensible official catalog rather than promise exhaustive permanent tool inventory.
## 12. Findings register

CA-001 stale model/permission/billing instructions: fix skill; CA-002 stale catalog and generic-copy scope: explicit backed-up adoption; CA-003 missing installs/aliases: targeted propagation plus verification; CA-004 API injection/independent unsafe harness: document actual limit, use credential-clean direct adapter; CA-005 Claude auth absent: honest status and vendor login procedure; CA-006 broad agent coverage absent: official catalog and discovery; CA-007 incomplete skill package: real scripts/reference/evals/delegation prompts. All owner: this skill task, except core runtime defects tracked as implementation dependency.
## 13. Impact on the requested change

update package, usable subscription-safe helper and all available tracked repository surfaces. Missing paths are unavailable, not successful installs. No unrelated repo source fixes.
## 14. Decisions

subscription auth and configured supported model; scoped permissions; bounded explicit fan-out; no metered Google API; adopt generic mis-scoped copy under user's explicit propagation request. Preserve local data outside exported package.


## CA-008 — Targeted skill sync masks collision failure

Finding P1: `src/cli/skill.mjs` ignores the registry API error result for targeted push/sync/pull, prints Winner undefined/no copies needed and exits successfully. Correct output and exit status before claiming propagation.

CA-008 verification, 2026-09-30: Mac mini background focused run of `src/cli/skill-sync.spec.mjs` reproduced all three failures (exitCode 0 instead of 1); after the early error-return fix all three passed. Real temporary registry/source/divergent discovered-install fixtures exercised push, sync and pull with pinned AGENT_DIR and skip-discover dry-run; registry and both skill files stayed byte-identical. Remote logs: `/tmp/skill-sync-red.log`, `/tmp/skill-sync-green.log`. This is focused regression evidence only; full exact-tree suite remains the release gate.

## Current disposition after implementation

Initial inventories and login observations above are historical baseline evidence. Final coverage is 24 Git repositories plus one available non-Git workspace, 25 installs and complete nine-file package, verified by the CLI whole-package hash. Latest Claude subscription login is authenticated but its real prompt fails on the weekly quota limit; CA-005 remains an account availability limitation, not a claim that login is still missing. Source and all installed packages match hash `2ca8b0a60042b47b`; 13 helper tests and the Mac mini 362-file /2,228-test suite passed. Core runtime/meta-harness dependencies remain uncertified. See the tracker action and verification logs for propagation, backups, unavailable roots and concurrent-edit evidence.

## Findings register cross-reference

| ID | Existing ID | Severity | Evidence / impact | Disposition |
| --- | --- | --- | --- | --- |
| A-001 | CA-001 | P1-high | Initial skill hardcoded model/permission/billing instructions | Corrected in reusable package |
| A-002 | CA-002 | P1-high | Generic copies mis-scoped and stale | Explicit adoption with recoverable backups |
| A-003 | CA-003 | P1-high | Missing actual installs and IDE aliases | 25 available targets verified; missing path reported |
| A-004 | CA-004 | P1-high | Core/harness credential injection and independent parse policy | Uncertified dependency; verified clean helper is current execution path |
| A-005 | CA-005 | P2-medium | Initial Claude login absent; later authenticated but quota failed | Current limitation documented; no unauthorized billing fallback |
| A-006 | CA-006 | P2-medium | Narrow terminal-agent coverage | Official catalog 14 tools; discovery extensible; four adapter contracts |
| A-007 | CA-007 | P1-high | Missing real support package | Nine files, 13 helper tests and package check passed |
| A-008 | CA-008 | P1-high | CLI masked collision errors as success | Regression red/green; early failure exit corrected |

Process note: this format reconciliation preserves the initial bounded audit and historical baseline; it does not retroactively claim its original formatting passed the newer strict checker.

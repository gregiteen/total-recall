---
type: project_document
title: Plugin corrections — verification evidence
description: Preserved summary of September 30 Mac mini tests and runtime reproductions, including failed snapshot and corrected rerun limits.
timestamp: 2026-09-30T16:30:00Z
tags: [audit, evidence, plugins]
---

# Verification evidence — 2026-09-30

Audit subject: Total Recall `e5d9aad` plus inspected working tree. Runs used an isolated `/tmp/tr-plugin-audit.g5cyvh` snapshot on the Mac mini, not the laptop or production host. Dependency modules were reused from a prior mini test snapshot; no live credential or recipient was required. Test inputs and network responses below are synthetic reproduction inputs, not product data.

| Command / check | Observed result |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | Exit 1; 361 files (355 pass, 6 fail); 2213 tests (2201 pass, 12 fail); 174.60 seconds |
| Same runner, affected `skill`, `route-inventory`, `connect`, `init-scaffold-ssss`, `sync-repo`, `brain-state` specs after restoring omitted scaffold files | Exit 1; 6 files (5 pass, 1 fail); 55 tests (54 pass, 1 fail); 3.07 seconds |
| Remaining failure | `src/server/route-inventory.spec.mjs`: expected 237 routes, received 240; added plugin reviews GET/POST and conformance GET |
| Installed Code Quality copy, `node --test test/core.test.mjs` | Exit 0; 9 tests pass; no skip/todo |
| `generateUiElements` for bundled DSH / Creative Search, target web-components | Throws UI validation errors: 48 / 59 respectively |
| `sendNotification` for Telegram/Expo | Both return `status: stub`, no implementation |
| Slack/Discord configuration with literal `url` | Both fail with missing `url_secret` |
| Email with successful HTTP `{}` response | Returns `status: accepted`, without provider acceptance evidence |
| Search health with empty results and unresponsive engine timeout | Returns `data.ok: true`, results 0, engines empty |
| Search remember with nonexistent TR CLI | Prints not saved yet returns `data.saved: true` |
| `assemblePluginContexts` with installed DSH/search links and no nodes | Returns empty string because generator object results are ignored |
| `writeNodeValidatedAsync` with actual plugin_review | `success:false`, `validation_failed`, `Unknown SSSS primitive 'plugin_review'` |
| Git Sentinel on temporary repo with one unstaged modification | Actual porcelain ` M a`; reports stagedFiles 1, unstagedFiles 0; no upstream also reports unpushedCommits 0 |
| Unrelated HTTP listener on a DSH probe port | DSH status reports running; models without DSH_RUNTIME throws undefined path argument |
| DSH widget first fetch fails, fallback returns 500 | Reports online true; PID, memory and uptime remain null |
| DSH widget offline then online | Online true but grid missing; body still displays DSH is not running |

Raw logs were retained at `/tmp/total-recall-plugin-audit-2026-09-30/{suite,retry,cq}.log` on the review workstation when this summary was written. Temporary paths are evidence locations, not durable product configuration. This repository-owned summary preserves the result if those files disappear. Full log output is not converted into one green run. External plugin source review and historical test references remain separate from these results. No provider send, live browser walkthrough or independent-user sharing proof occurred.

## Documentation reconciliation checks — September 30

Checked 87 affected documentation files across Total Recall and eight standalone plugin repositories: 14 complete five-file sets (70 canonical documents), 13 plugin READMEs, root README/architecture/handoff, and this evidence summary. Every canonical document has universal project metadata. Relative/absolute local Markdown link targets resolve. All nine repository whitespace checks passed. These checks validate documentation coverage and references; they do not replace source tests, fresh external baselines or live workflow proofs. Existing concurrent source changes were preserved; no implementation repair or release occurred.

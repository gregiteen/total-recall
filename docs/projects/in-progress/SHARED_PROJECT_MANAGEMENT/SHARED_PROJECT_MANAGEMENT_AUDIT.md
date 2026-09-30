# SHARED_PROJECT_MANAGEMENT — Audit

> **Project Prefix**: `SHARED_PROJECT_MANAGEMENT`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex `/root/showcase_docs`
> **Date**: 2026-09-30
> **Audit Status**: Complete
> **Audited commit**: e5d9aad0dd7d7372363a7d5d0c97349949330446

## Process note
No PM skill edits preceded this audit. The supplied baseline covers the current working tree before this PM change, including prior authorized changes; it is not a clean export of the recorded commit. Audit completion covers this bounded skill/documentation scope, not system-wide readiness.

## 1. Scope and method
Read the complete canonical global `project-management/SKILL.md`, current Total Recall overlay, template, assistant, evals, helpers and global hooks; read package/config evidence. Scope: shared PM mechanics and this repository's thin overlay. Other repositories' overlays, deployment, live providers and unrelated code are excluded. Read-only inventory used `rg --files`, `cat`, `git rev-parse HEAD`, `git status --short`, and `node bin/total-recall.mjs --help`.

## 2. Inventory
Canonical shared package: `/Users/greg/.agent/skills/project-management/` with SKILL, scripts, references, evals, subagents and hooks. Local overlay: `.agent/skills/total-recall-project-management/` with the same directories except no audit checker. Shared SKILL duplicates architecture assumptions and demands overlay creation; overlay duplicates five-file mechanics and refers to four files. Skill files are authored instructions; injected blocks are generated and must remain byte-preserved. Global package is outside this Git checkout; local overlay had no pre-existing Git changes in the scoped status read.

## 3. Runtime surface
PM helpers use filesystem reads, cwd-derived docs paths and optional interactive folder moves. No HTTP route, scheduler or credentials added. CLI inventory/help expose memory/skill/task operations but no documented tracker-file append operation was found; tracker files under `docs/projects` are ordinary project documents, not vault nodes. Actual CLI entrypoint here is `node bin/total-recall.mjs`; `./total-recall` does not exist.

## 4. Data and state
Five project Markdown documents and their tracker Action Log hold project evidence. Vault writes continue through the TR CLI; documenting normal tracker edits does not authorize direct vault manipulation. Action logs retain timestamp, actor, path/command, result and evidence without secret values. Generated instruction blocks remain untouched.

## 5. Integrations
GitHub issue/PR integration is optional and configured by each repo. No account, provider, token, external write or new integration is required for this change. Existing helpers inspect local `.github` files; that is template existence evidence only.

## 6. Security and privacy
No credential reads performed. Logs must omit secret values, raw credential-bearing environment output and personal data unrelated to the task. Shared instructions must not automatically authorize pushes, external messages, new overlays or changes outside the user's scope.

## 7. Standing-rule conflicts
Shared skill forces a missing overlay, imposes SSSS on arbitrary repositories, and offers unsolicited push/maintenance queue work. Overlay claims spec ownership, pinned models, required CPU load and universal application-state treatment of all files. These contradict shared generic methods, verified-local differences and evidence-backed readiness. A-001 through A-003 cover corrections.

## 8. Quality baseline
Coordinator supplied fresh Mac-mini pre-edit full-suite evidence: `/tmp/tr-cli-agents.k6cVIM/full-suite-3.log`, **362 files / 2228 tests, exit 0**. This is working-tree baseline evidence, not clean-commit or post-PM verification. Raw log preservation and final verification belong to coordinator. No tests/gates ran on the laptop. `package.json` defines `npm test` as `vitest run`; `vitest.config.ts` defaults to jsdom, disables file parallelism and excludes `.agent/**`, so the main suite does not certify skill helpers. `.agent/skills/code-quality/config.json` supplies repo gates; no nonexistent lint/typecheck command is assumed. A read attempted nonexistent `vitest.config.mjs`, then corrected to the actual `.ts` file; no runtime failure inferred.

## 9. Debt and dead code
Global issue/PR hooks print validation claims and return success without inspecting input. Triage counts only `[ ]` and can call `[/]` work complete; its move path cannot prove verification. Assistant reads active phase from an overlay despite the skill forbidding hardcoded phases. Evals largely check existence/echo hooks instead of meaningful behavior.

## 10. Deploy and operations
No deployment in this assignment. Coordinator will register/propagate the complete shared package separately after checks. Preserve unrelated scoped overlays and generated blocks; roll back only reviewed changed files from backups/diff. Package parity does not prove all repo workflows executed.

## 11. Content and product fit
Shared PM must be primary. Optional overlays describe only verified product differences. Every meaningful action requires a bottom append-only Action Log; batching related repeated reads keeps it readable. Historical entries stay intact; corrections append references to earlier entries.

## 12. Findings register
| ID | Severity | Finding / evidence | Impact | Correction | Disposition |
| --- | --- | --- | --- | --- | --- |
| A-001 | P1-high | Shared SKILL Step0/overlay section forces missing overlays and global SSSS architecture | Wrong repo architecture and unsolicited work | Shared primary; optional verified thin overlay | Fix in this project |
| A-002 | P1-high | Tracker has verification-only log, no comprehensive action/delegation ledger | Missing provenance and falsely complete delegation | Bottom append-only Action Log required | Fix in this project |
| A-003 | P1-high | TR overlay four-file/spec ownership/model/CPU claims and duplicated lifecycle | Stale instructions drive incorrect readiness | Replace with verified local differences | Fix in this project |
| A-004 | P1-high | Hooks echo success; triage ignores `[/]` and absence of readiness evidence | Fake validation/completion | Remove false-success hooks; report candidates and enforce manual evidence before archival | Fix in this project |
| A-005 | P2-medium | Assistant/evals/template mapping equate existence or overlay phase with proof | Weak acceptance criteria | Evidence-based assistant/reference/evals | Fix in this project |

## 13. Impact on the requested change
Action Log and shared-primary requirements address A-001/A-002/A-005. Thin TR overlay addresses A-003. Honest helper behavior addresses A-004. No successful deployment or live runtime certification will be claimed.

## 14. Decisions
No owner-only blocker remains: requested shared-primary/optional-overlay/logging behavior is explicit. Retain injected memory content byte-for-byte, use documented CLI operations where applicable, and ordinary tracked Markdown edits for project logs. Coordinator must finish post-edit remote checks and propagation before completion.

## Completion checklist
- [x] All fourteen sections filled for bounded scope.
- [x] Supplied pre-edit working-tree baseline recorded with attribution and limits.
- [x] Every finding has severity and disposition.
- [x] Audit complete; implementation and post-edit verification remain separate.

---
type: project_document
title: PLUGIN_IMPLEMENTATION_CORRECTIONS — Audit
description: Evidence register and documentation reconciliation for incomplete plugin implementations and unsupported readiness claims.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, audit, plugins, corrections]
---

# PLUGIN_IMPLEMENTATION_CORRECTIONS — Audit

> **Project Prefix**: `PLUGIN_IMPLEMENTATION_CORRECTIONS`
> **Kanban State**: In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Audit Status**: Complete for the Total Recall implementation review and documentation reconciliation described below
> **Audited commit**: `e5d9aad0dd7d7372363a7d5d0c97349949330446` plus the inspected working tree

## 1. Scope and method

This is a correction project, not a release approval. It reconciles the September 30 Total Recall review, eight repository-owned plugin project sets, and the host's showcase/composer/extraction/distribution plans. Total Recall runtime findings were reproduced on an isolated Mac mini snapshot before this documentation change. External plugin findings are static source reviews by the assigned documentation reviewers; their fresh runtime baselines remain open in their own trackers. Complete here means the bounded audit and planning evidence are recorded, not that all plugins are comprehensively tested or repaired.

Whole implementations reviewed in the prior Total Recall audit: bundled plugin CLIs/generators/configuration, Operator Alerts dispatch, plugin context/runner/tasks, review/conformance routes, DSH/search custom elements, and host preview components. Search located registrations, config consumers, and route inventory. The sibling reviewers inspected their manifests, CLIs, relevant source/tests, and all five project documents. Existing source edits were preserved. No provider send, production deployment, public exchange, source repair, or release was performed for this documentation request.

## 2. Inventory and document custody

All eight standalone plugin repositories retain their complete, Git-tracked five-file sets. `git ls-files docs/projects` and filesystem inventory verified this on September 30. None was lost or replaced by a central copy.

| Repository | Inspected HEAD | Canonical project set | State before reconciliation |
|---|---|---|---|
| `tr-plugin-code-quality` | `c5ffedb` | `docs/projects/completed/CODE_QUALITY_PLUGIN/` | Historical core/config project completed; new UI proof remains separate |
| `tr-plugin-composable-cli` | `d8e67d5` | `docs/projects/in-progress/COMPOSABLE_CLI_PLUGIN/` | In progress; source edits present |
| `tr-plugin-decision` | `a30a25d` | `docs/projects/in-progress/DECISION_PLUGIN/` | In progress; source edits present |
| `tr-plugin-design` | `a158178` | `docs/projects/in-progress/DESIGN_PLUGIN/` | In progress; source edits present |
| `tr-plugin-domains` | `7303b1d` | `docs/projects/in-progress/DOMAINS_PLUGIN/` | In progress; source edits present |
| `tr-plugin-phone` | `e82dd92` | `docs/projects/in-progress/PHONE_PLUGIN/` | In progress; source edits present |
| `tr-plugin-signing` | `4377a8d` | `docs/projects/in-progress/SIGNING_PLUGIN/` | In progress; source edits present |
| `tr-plugin-text` | `5a77312` | `docs/projects/in-progress/TEXT_PLUGIN/` | In progress; source edits present |

Total Recall retains all five documents for `CAPABILITY_DEPLOYMENT_PLUGINS`, `PLUGIN_SHOWCASE_UI`, `OPERATOR_ALERTS_PLUGIN`, `PLUGIN_P2P`, and planned `TR_CORE_PLUGIN_SPLIT`. Its unrelated extension and skill-propagation work remains separate. Dependency sets also exist: SSSS `CAPABILITY_PROVISIONING_CONTRACT` at `7f1cc3f`, and Festech Modular `CAPABILITY_APP_EXTRACTION` at `1bfd17cbd`. Their presence is verified; their implementation readiness is not recertified here. Internal cross-repository planning links are not portable product defaults.

## 3. Runtime surfaces

Bundled commands are `alerts`, `csearch`, `dsh`, `git-sentinel`, and `system-monitor`; `config.mjs` is not a registered second Creative Search command. `src/server/routes/plugins.mjs` adds authenticated review read/write and conformance read routes. Execution uses `config:write` and a child process. Host previews are unconnected to `PluginsPage.tsx`; custom-element files and manifest declarations do not establish a dashboard mount. Scheduled health tasks run through `plugin-tasks.mjs` and record task output; that establishes scheduling, not truthful health results.

Relevant configuration comes from `SEARXNG_URL`, `TR_CLI`, `AGENT_DIR`, `DSH_RUNTIME`, `DSH_WEB_URL`, `TR_NOTIFY_HOME`, notification config fields, and provider secret references. Current browser probes address the browser's localhost or a personal mesh address instead of a configured authenticated host adapter.

## 4. Data and state

Reviews request an unknown `plugin_review` primitive and omit a category; `prepareNodeForContract` defaults it to `uncategorized`, while the reader scans `reviews/`. Search settings split between localStorage and a JSON file. Alerts directly write a JSONL dedupe ledger and Markdown log outside the SSSS operation service. These are implementation gaps, not an exception to the VFS rule. Target state is app-owned SSSS configuration, typed documents and append-only events, with disposable projections only. Credentials remain in the encrypted store and never enter project evidence.

## 5. Integrations

Operator Alerts contains desktop, SMTP2GO, Telnyx, Slack/Discord webhook, generic webhook and GitHub adapters, plus Telegram/Expo stubs. Creative Search calls SearXNG. DSH probes local processes and HTML. External plugin inventories include provider-specific clients but that is not live delivery, account ownership, runtime provisioning or UI evidence. No provider factual recommendation or integration code is introduced in this documentation task. At implementation time, verify current official API contracts before changing adapters.

## 6. Security and privacy

Keep review authorship bound to the authenticated principal; a caller-supplied `reviewer_node` and `verified_conformance` flag cannot establish identity or verification. Verification metadata must reference an artifact digest, command, date, environment and result. Manifest text is an assertion, not proof. Runtime/plugin commands may have side effects; real sends require the existing provider/recipient authorization. New tests must use synthetic inputs before production wiring, then prove the real operation path without mocking its validator. No secrets were printed or copied into the correction documents.

## 7. Standing-rule conflicts

| Rule | Conflict | Finding |
|---|---|---|
| No fake product features/status | Static host previews, invented engine count/tool inventory, successful stubs | PIC-001, PIC-007, PIC-010, PIC-016 |
| SSSS VFS persistence | Missing review primitive/storage mismatch, loose config/ledgers | PIC-002, PIC-003, PIC-022 |
| Generic product defaults | Personal mesh endpoint and browser-local hardcoded ports | PIC-011, PIC-015 |
| Verify before marking complete | Showcase phases and external tracker claims exceed observed behavior | PIC-021 |
| Public sharing for all users | Showcase mesh-only trust narrative conflicts with public P2P requirement | PIC-023 |
| Tests on sanctioned host | Historical external laptop runs are not sanctioned completion evidence | Repository reconciliation addenda |

## 8. Quality baseline

Prior-turn Mac mini snapshot: `node node_modules/vitest/vitest.mjs run`, exit 1, **361 files: 355 passed / 6 failed; 2,213 tests: 2,201 passed / 12 failed**. Five failing files were caused by the snapshot excluding `scaffold/.agent`, not by product defects. After copying the missing scaffold files, a targeted rerun of all six affected specs had **5 files passed / 1 failed; 54 tests passed / 1 failed**. The remaining genuine failure is route-manifest drift: three new plugin routes produce 240 observed routes versus 237 recorded routes. There was no corrected full-suite green run; do not combine these results into one.

Installed Code Quality copy: `node --test test/core.test.mjs`, **9 passed, 0 failed**. This does not certify a different repository checkout or its absent UI. UI generation through `generateUiElements(..., target: 'web-components')` failed with **48 DSH violations and 59 Creative Search violations**. Runtime reproductions confirmed review primitive rejection, false search/save/provider acceptance, DSH false identity and recovery, and Git porcelain misclassification. [Evidence summary](evidence/VERIFICATION_EVIDENCE.md) records commands and observed outputs. No new tests or gates were run locally for documentation edits. External repo runtime tests remain explicitly pending; historical test counts were not upgraded to current proof.

## 9. Debt and root cause

The project did not fail through lost documentation. It failed at the boundary between a desired contract and an implemented behavior:

1. The September 30 `e5d9aad` commit added 2,343 lines of DSH/search UI/CLI code without feature specs in those plugin directories. Generators and UI sources were not exercised through their actual host consumers.
2. Showcase Phase 1 checked off SSSS review support after adding route handlers and tests that mocked the write service. The registry and storage round trip were never proved.
3. Showcase Phase 2 checked off interactive previews after creating host-owned components with fixed values and absent action handlers.
4. Operator Alerts deliberately scoped stubs as non-goals, then tracked their creation as complete. That directly conflicted with the user's no-stub requirement.
5. Requirements diverged: P2P forbade social-proof fields while Showcase introduced ratings and verification badges. The default conformance endpoint reproduced the earlier unsupported trust problem.
6. Lower-level client tests, source-file existence and historical runs became ecosystem readiness claims. The unfinished composer shell and the unimplemented external runtime handlers demonstrate the missing end-to-end gate.

These are evidence-supported process causes. They do not establish intent or justify attributing every defect to a specific agent.

## 10. Deploy and operations

This task changes documentation only. Keep current app/vault/source data; never remove existing runtime files merely to conceal a finding. Before a later release: fresh Mac mini full gates, native server boot, clean installed-package walkthrough, artifact digest/provenance, real configured provider and UI proofs, and the existing push/release protocol. Public sender-to-recipient exchange is a separate gate. Rollback uses the project's normal source/runtime procedure, not deletion of user state.

## 11. Content and product fit

Every product claim must identify an implemented action and observed state. Unknown and unavailable are legitimate states; fabricated values and successful stub results are not. Test doubles remain appropriate in tests. They must not become a displayed product result or be described as live delivery. Existing user-authored branding/copy is preserved; inaccurate engineering status and acceptance claims are corrected.

## 12. Findings register

Every row remains **open for implementation**. Disposition is **fix in the named owning project**; none is silently deferred.

| ID | Severity | Confirmed issue and evidence | Required correction / owner |
|---|---|---|---|
| PIC-001 | P1-high | Eight host previews use static/simulated data; `frontend/src/components/plugins/previews/PhonePreview.tsx:99`, `CodeQualityPreview.tsx:78`; registry not consumed by PluginsPage | Remove product mocks; mount functional installed plugin-owned UI / Showcase + plugin repos |
| PIC-002 | P1-high | Actual SSSS write rejects `plugin_review`; `src/server/routes/plugins.mjs:254`, local registry lacks type | Register a valid namespaced extension and test real operation / Showcase |
| PIC-003 | P1-high | Review writer omits category; reader uses `reviews/`; routes lines 193,254 and validated-write category fallback | One canonical path and write/read round trip / Showcase |
| PIC-004 | P1-high | `ssss_conformant !== false` defaults true; `plugins.mjs:300` | Unknown until artifact-bound evidence; authenticated review identity / Showcase |
| PIC-005 | P1-high | Route inventory fails for three new endpoints | Regenerate and test route manifest / Showcase |
| PIC-006 | P1-high | Slack/Discord literal URL passes guard but requires url_secret; notify-core lines 114–132 | Consistent secret/literal resolution and malformed-config tests / Alerts |
| PIC-007 | P1-high | Telegram/Expo return stub; successful CLI exit possible; notify-core lines 138–139 | Real adapters, nonzero unavailable/failure, receipts / Alerts |
| PIC-008 | P1-high | Email accepts empty 200 object; undefined succeeded < 1 is false; line 97 | Strict provider acceptance and receipt state / Alerts |
| PIC-009 | P1-high | `saved: true` after failed child; installed path wrong; search CLI lines 12,92–95,317 | Resolve running TR install, check status/error/timeout, return real persisted evidence / Search |
| PIC-010 | P1-high | UI invented 25+ and online engine dots; CLI healthy with no results + timeout | Actual configured engine/health evidence and degraded state / Search |
| PIC-011 | P1-high | UI localStorage differs from CLI JSON; ignored controls; hardcoded endpoint; config.mjs and search CLI | One validated SSSS config + registered CLI + UI consumption / Search |
| PIC-012 | P2-medium | Deep follow-ups excluded from final collection; constructed report unused; search CLI lines 250–272 | Return/emit combined deduplicated report with citations / Search |
| PIC-013 | P1-high | DSH/search generators return objects, host accepts strings; plugin-context line 47 | One documented generator return contract + host integration tests / TR host + both plugins |
| PIC-014 | P1-high | UI adapters reject both plugins, 48/59 violations | Valid DESIGN.md/token/source contract and actual generated mounts / Composer + both plugins |
| PIC-015 | P1-high | DSH accepts unrelated listener; models/tools undefined runtime path; CLI lines 14,128,175 | Configurable endpoint/runtime discovery with identity validation and clear errors / DSH |
| PIC-016 | P1-high | Hardcoded knownTools advertised as live registry; CLI lines 192–219 | Query authoritative registry; unknown remains unknown / DSH |
| PIC-017 | P1-high | Widget treats fallback 500 as online, never populates several metrics, stale error grid after recovery | Authenticated server adapter, populate actual metrics, reconstruct recovery state / DSH |
| PIC-018 | P2-medium | Git helper trims porcelain leading space; missing upstream becomes zero; cli lines 11,38–44 | Preserve columns and distinguish no upstream/error/ahead/behind / Git Sentinel |
| PIC-019 | P1-high | standalone.mjs produces message-printing ready shell; file-existence gates | Canonical scaffolder + independent runtime + real feature gates / Composer |
| PIC-020 | P1-high | Reviews accepted from supplied reviewer/verified fields; routes lines 240,250,263 | Authenticated provenance; no caller-authored trust flag / Showcase |
| PIC-021 | P1-high | Completion boxes exceed implementation; docs lack one shared evidence standard | Reopen unsupported claims, owner/command/digest/date/results required / All owners |
| PIC-022 | P1-high | Alert JSONL/log and search config bypass SSSS operations | App-owned config/events with replayable projections / Alerts + Search |
| PIC-023 | P2-medium | P2P and Showcase disagree on reviews/trust and mesh/public scope | No invented social proof; genuine optional authored reviews separate from proven conformance; public P2P retained / Distribution + Showcase |

The [central tracker external register](PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md#external-findings--all-open), PIC-030–049, is the continuation of this audit findings register and maps every reviewer-local ID to its owning source, correction and acceptance. External plugin findings are also listed with source evidence in each repository's September 30 audit addendum. The central tracker links those owner lists and requires closure of every local finding, not merely a generic UI task. Fresh external baselines and runtime/provider proofs remain pending; static findings do not certify the unreviewed remainder of those repositories.

## 13. Impact on the request

Documentation is intact, but completion claims are unreliable until reconciled. All affected five-file sets and READMEs receive current-state notes and concrete corrective acceptance gates. This set coordinates shared contracts and sequencing; each plugin repository retains ownership of its source, data and implementation tracker. Host placeholders must not be replaced with another centrally invented copy.

## 14. Decisions and execution defaults

| Topic | Recorded execution default |
|---|---|
| Missing provider config | Truthful unavailable/error result; resolve existing secret references through TR; never a successful stub |
| UI ownership | Implement once in the plugin, validate adapters, mount by installed manifest/digest |
| Tests | Synthetic cases first; real SSSS/kernel/host integration; full gates on Mac mini; separate authorized live proofs |
| Readiness | All owned findings closed with evidence; no unsupported completion or fabricated fallback |
| Scope | This turn plans corrections and fixes documentation; implementation, commit, publish and deploy remain future execution |

## Completion checklist

- [x] Fourteen bounded audit sections completed with source/evidence and explicit limits.
- [x] Prior Mac mini baseline and actual failures recorded before documentation edits.
- [x] Every Total Recall finding assigned an owner and disposition.
- [x] Existing repository document custody verified.
- [ ] Implementation findings repaired and final readiness proved (belongs to execution, not audit completion).

## PIC-050 — JSX preview registry cannot compile

- [x] Correct the untracked preview registry's `.ts` extension while preserving its contents and existing imports, then rerun the real frontend build on Mac mini.

Evidence: Mac mini `/tmp/tr-agent-operations-20260930/frontend-build.log`, exit2, TypeScript JSX parser errors in `frontend/src/components/plugins/previews/index.ts:63–83`. Full source read confirms JSX in a `.ts` module; source search finds no explicit `index.ts` import that would need rewriting. The surrounding preview feature/readiness remains subject to existing PIC preview findings; a successful compilation will not certify those components as live integrations. This continuation was recorded before the narrow filename correction.

## PIC-051 — Fabricated phone preview call status and personal machine

- [ ] Remove the static active-call timer, connected peer claim and idle status; disable the unwired call control and label the component as a visual preview. Run the frontend build and package gates on Mac mini. This removes false evidence; actual installed calling remains open under PIC-030–032.

Evidence: full remote quality gate exited1 solely on TR-SHIP-004 at PhonePreview.tsx:100. Source contains a literal 00:42 timer, connection text, idle badge and button without handler. Full backend suite passed within the same gate. Recorded before edits.

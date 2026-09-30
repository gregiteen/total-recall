---
type: project_document
title: PLUGIN_IMPLEMENTATION_CORRECTIONS — Project Tracker
description: Owner register and concrete acceptance for all audited plugin corrections.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, project-tracker, plugins, corrections]
---

# PLUGIN_IMPLEMENTATION_CORRECTIONS — Project Tracker

State: **In progress — documentation reconciled; implementation and final verification pending.** September 30, 2026. Owners are repository/workstream roles; assign personnel before execution. Every correction remains active.

## Audit and documentation

- [x] Inventory all eight standalone Git-tracked five-file sets.
- [x] Record bounded [Audit](PLUGIN_IMPLEMENTATION_CORRECTIONS_AUDIT.md) and prior [Evidence](evidence/VERIFICATION_EVIDENCE.md).
- [x] Reconcile affected requirements, architecture, plans, trackers and README claims.
- [x] Validate final documentation links, universal metadata and five-file coverage: 87 documentation files, 14 complete sets/70 canonical documents; no missing local links; whitespace checks passed in all nine repositories.
- [ ] Fresh external runtime baselines on Mac mini; external readiness remains unverified.

## Total Recall findings — all open

| Task | Owner / files | Acceptance |
|---|---|---|
| PIC-001 (L) Real UI | Showcase + plugin owners; previews/PluginsPage/manifests | Installed actions change actual state; no fixed metrics, fake messages or inert controls |
| PIC-002 (M) Review schema | Showcase; registry/routes | Actual validator accepts registered review and rejects malformed input |
| PIC-003 (M) Review path | Showcase; writer/reader | Authorized write/list/restart round trip |
| PIC-004 (M) Conformance | Showcase; route/projection | Missing proof unknown; digest mismatch invalidates; measured evidence |
| PIC-005 (S) Route inventory | Showcase; manifest/spec | Three routes recorded and inventory spec passes |
| PIC-006 (S) Webhook config | Alerts; notify-core | Literal/secret branches work; malformed/missing fails |
| PIC-007 (M) Telegram/Expo | Alerts; adapters/CLI | Actual adapters/receipts; unavailable never successful exit |
| PIC-008 (S) Email | Alerts; adapter | Empty/malformed 200 rejected; acceptance differs from delivery |
| PIC-009 (M) Search save | Search; CLI/host resolution | Installed path works; child failure/error/timeout never saved:true |
| PIC-010 (M) Search health | Search; CLI/UI | Actual engine count/list; timeout degraded; no invented dots |
| PIC-011 (M) Search config | Search; config/manifest/UI | Registered command, one SSSS state, every control consumed |
| PIC-012 (S) Deep report | Search; pipeline | Follow-ups included/deduplicated; cited report emitted |
| PIC-013 (M) Context | Host + DSH/Search; generators | Actual consumer receives nonempty installed context |
| PIC-014 (M) UI generation | Composer + DSH/Search | generateUiElements accepts both; functional output mounts |
| PIC-015 (M) Runtime identity | DSH; CLI/config | Reject unrelated listener; unset runtime explicit; configurable discovery |
| PIC-016 (S) Tools | DSH; registry consumer | Actual registry reflected; unknown when unavailable |
| PIC-017 (M) Widget | DSH; adapter/UI | 500 failed; real metrics; recovery rebuilds/clears error |
| PIC-018 (S) Git status | Git Sentinel; CLI | Leading-space porcelain correct; no-upstream/error never up-to-date |
| PIC-019 (L) Standalone | Composer; scaffolder/gates | Independent native boot and actual operation; ready string insufficient |
| PIC-020 (M) Author | Showcase; auth/routes | Forged payload cannot change principal or verification |
| PIC-021 (M) Evidence | All owners; readiness/docs | Closure has revision/environment/command/exit/digest where applicable |
| PIC-022 (M) State | Alerts/Search; config/ledger | Actual SSSS operations/replay; existing state retained |
| PIC-023 (M) Trust | P2P/Showcase; requirements | Resolved policy, no invented proof, genuine public exchange |

## External findings — all open

Repository trackers contain remaining original scope plus file-level repairs. Local finding IDs map below; closure requires their evidence, not a generic UI task.

| Task / local ID | Owner / source | Acceptance |
|---|---|---|
| PIC-030 PHONE-C01 | Phone; runtime handlers | Five actual provision/init/cleanup/call/worker handlers; unsupported never ok:true |
| PIC-031 PHONE-C02 | Phone; events.mjs | Validated scoped event persistence/replay; no /tmp canonical ledger |
| PIC-032 PHONE-C03 | Phone; CLI/manifest/backend/UI | Installed lifecycle and actual backend/UI readiness |
| PIC-033 TEXT-C01 | Text; CLI/optout | Durable STOP enforced before send; commit failures visible |
| PIC-034 TEXT-C02 | Text; dispatch/status | Flags/exits correct; invalid signature fails; receipt states distinct |
| PIC-035 TEXT-C03 | Text; resolver/gates | Supported host secret resolution and fresh Mac mini gates |
| PIC-036 SIGNING-C01 | Signing; CLI | Actual send/list/download installed dispatch |
| PIC-037 SIGNING-C02 | Signing; vault/documenso | Generic endpoint, validated authorized state/artifacts, replay-safe recovery |
| PIC-038 DOMAINS-C01 | Domains; CLI | Actual list/records/set/all; nonzero failure |
| PIC-039 DOMAINS-C02/C03 | Domains; CLI/scheduler/docs | Real drift/state/alerts, JSON exits correct; shared credentials allowed |
| PIC-040 UI follow-up | Code Quality; preview | Plugin-owned real report/gate actions; no 42/42 fabrication |
| PIC-041 Config/install | Code Quality; CLI/schema | Correct host config/path delegation and installed proof |
| PIC-042 Rollback/state | Composable; registry | SHA matches restored bytes; canonical registry operation |
| PIC-043 Test/promotion | Composable; CLI/UI | Actual sanctioned test and manifest registration; functional terminal |
| PIC-044 Decision state | Decision; store | Registered operation/read/write/restart |
| PIC-045 Decision hash | Decision; store | Nested change alters hash; recursive canonical order |
| PIC-046 Parser/version | Decision; store/manifests | Documented YAML parsed/validated; versions consistent |
| PIC-047 Decision UI/scope | Decision; composer/Python/eval/UI | Actual data/gates and remaining scope complete |
| PIC-048 Generation | Design; CLI/designer | Actual dispatch, configured model, encrypted secrets, timeout/failure |
| PIC-049 Validator/UI/state | Design; validator/export/UI | Actual validation/formats/tokens/SSSS state; no static palette proof |

## Owning trackers

Workspace links are internal audit references, not public product defaults.

- [Phone](../../../../../tr-plugin-phone/docs/projects/in-progress/PHONE_PLUGIN/PHONE_PLUGIN_PROJECT_TRACKER.md)
- [Text](../../../../../tr-plugin-text/docs/projects/in-progress/TEXT_PLUGIN/TEXT_PLUGIN_PROJECT_TRACKER.md)
- [Signing](../../../../../tr-plugin-signing/docs/projects/in-progress/SIGNING_PLUGIN/SIGNING_PLUGIN_PROJECT_TRACKER.md)
- [Domains](../../../../../tr-plugin-domains/docs/projects/in-progress/DOMAINS_PLUGIN/DOMAINS_PLUGIN_PROJECT_TRACKER.md)
- [Code Quality](../../../../../tr-plugin-code-quality/docs/projects/completed/CODE_QUALITY_PLUGIN/CODE_QUALITY_PLUGIN_PROJECT_TRACKER.md)
- [Composable CLI](../../../../../tr-plugin-composable-cli/docs/projects/in-progress/COMPOSABLE_CLI_PLUGIN/COMPOSABLE_CLI_PLUGIN_PROJECT_TRACKER.md)
- [Decision](../../../../../tr-plugin-decision/docs/projects/in-progress/DECISION_PLUGIN/DECISION_PLUGIN_PROJECT_TRACKER.md)
- [Design](../../../../../tr-plugin-design/docs/projects/in-progress/DESIGN_PLUGIN/DESIGN_PLUGIN_PROJECT_TRACKER.md)
- [Showcase](../PLUGIN_SHOWCASE_UI/PLUGIN_SHOWCASE_UI_PROJECT_TRACKER.md)
- [Alerts](../OPERATOR_ALERTS_PLUGIN/OPERATOR_ALERTS_PLUGIN_PROJECT_TRACKER.md)
- [Composer](../CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md)
- [Public sharing](../PLUGIN_P2P/PLUGIN_P2P_PROJECT_TRACKER.md)
- [Extraction](../../planned/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md)

## Closure checklist

- [ ] Each central finding closed with source/evidence and corresponding repository task.
- [ ] All original blocking scope and additional audit findings closed.
- [ ] Fresh background full suite/repository gates pass on Mac mini.
- [ ] Native boot and clean installed-package/UI workflow pass.
- [ ] Authorized provider and independent runtime lifecycle proof attached.
- [ ] Public sender/recipient exchange, privacy and tamper rejection pass.
- [ ] No product mocks, successful stubs, invented statuses or unsupported completion in audited scope.
- [ ] Existing release protocol followed if publication is requested.

## PIC-050 — JSX preview registry cannot compile

- [x] Correct the untracked preview registry's `.ts` extension while preserving its contents and existing imports, then rerun the real frontend build on Mac mini.

Evidence: Mac mini `/tmp/tr-agent-operations-20260930/frontend-build.log`, exit2, TypeScript JSX parser errors in `frontend/src/components/plugins/previews/index.ts:63–83`. Full source read confirms JSX in a `.ts` module; source search finds no explicit `index.ts` import that would need rewriting. The surrounding preview feature/readiness remains subject to existing PIC preview findings; a successful compilation will not certify those components as live integrations. This continuation was recorded before the narrow filename correction.

## PIC-051 — Fabricated phone preview call status and personal machine

- [ ] Remove the static active-call timer, connected peer claim and idle status; disable the unwired call control and label the component as a visual preview. Run the frontend build and package gates on Mac mini. This removes false evidence; actual installed calling remains open under PIC-030–032.

Evidence: full remote quality gate exited1 solely on TR-SHIP-004 at PhonePreview.tsx:100. Source contains a literal 00:42 timer, connection text, idle badge and button without handler. Full backend suite passed within the same gate. Recorded before edits.

## Action Log

- 2026-09-30T19:37:15Z — /root: Background Mac mini frontend build failed on JSX in `.ts`; read entire registry and searched imports; recorded PIC-050 before correcting extension. No content or product runtime proof claimed.

- 2026-09-30T19:55:09Z — /root: PIC-050 build retry passed0 on Mac mini (frontend-build-2.log). Full remote gate failed1 on personal machine text in phone preview; inspected source, recorded PIC-051 before removing fabricated status and disabling unwired control. CLI instructions list returned403 with required_scopes instructions:read; no token values read aloud, scopes changed or credentials rotated.

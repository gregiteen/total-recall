# TOTAL_RECALL_LAUNCH_PLAN — Project Tracker

DEV-API-05 in progress: restricted project UUID grants, verified registry/identity/path binding, matched discovery and running-work revalidation. Broader owner adapters, provider budgets and complete API/launch acceptance remain open.

DEV-API-04 source verification complete: both decision operations use the shared child executor, with cancellation and truthful owner failures. Final Mini suite2359 tests/372 files, focused82 tests/3 files and8 quality gates pass. Provider spending and complete API/launch acceptance remain open.

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

**One project replaces 13 in-progress projects.** Archived records preserve their history and unfinished work; they are never marked complete. The [source register](LAUNCH_SOURCE_REGISTER.md) gives every predecessor item an explicit disposition; a predecessor's old checkbox is a claim, not an acceptance result.

## Six workstreams, one priority order

| ID | Priority / owner | Acceptance |
| --- | --- | --- |
| LR-1 | P0 / runtime | `startup check --json` reports `shared_ready: true` on the sanctioned host, and `status` agrees with it |
| LR-2 | P0 / release | The installed CLI equals the published version, verified per surface, and an upgrade preserves state |
| LR-3 | P0 / memory and instructions | Instructions report `In sync: yes` and the capsule reaches `ready: true` within budget |
| LR-4 | P0 / packaging safety | No distributed artifact contains private state, proven per path, with the fix shipped to the installed package |
| LR-5 | P1 / plugin contract | One contract for plugin, brick and panel; no shipped document teaches the deleted template model |
| LR-6 | P0 / launch acceptance | One complete journey passes end to end, recorded as one artifact |

## Active acceptance checklist

### October 24 scope reconciliation

PRD scope reconciliation and audit SCOPE-RECONCILE-01 are authoritative. Gro owns its seller command gateway/public skills, integrated DSH delivery and optional seller-memory integration. TR owns local memory/instructions, generic tooling and plugin bricks. Neither cloud hosting nor DSH installation is required for ordinary TR memory. No runtime code was removed, ported or released by this reconciliation.

- [x] Reconcile ownership across both five-file projects, preserving their unrelated work and history.
- [x] **DEV-API-01 disposition:** owner approved retaining `/v1/invoke` as an optional developer API; full developer authority is valid when explicitly granted. Gro seller restrictions do not define TR developer permissions.
- [x] **DEV-API-03 confined facts:** implement exact-schema server-brain fact creation, create-only SSSS authority, generator-free local indexing, filesystem permissions and truthful partial results. CLI parity is `remember --confined-fact`; see [source evidence](evidence/DEV-API-03-source-verification.md). Broader restricted owner/mutation and API resource acceptance remain open below.
- [ ] Define and implement full/restricted key grants, exact command/argument/project/brain/credential authorization, current-key treatment and enforcement through CLI/plugins/composed operations (PRD API-1–API-4).
- [ ] Implement server-controlled execution/cost limits and accurate outcomes with token-free audit (API-5).
- [ ] Verify full and restricted clients, denied escalation/foreign brains, delegation, expiry/revocation, limits and independent-agent round trip; document local/mesh/hosted use (API-6).
- [ ] Record server-free local remember/recall/context acceptance in LR-6.
- Public CRM skill URL/guide delivery and DSH runtime bundling are tracked by Gro, not new TR launch gates. Existing generic TR skills/adapters are retained.

Recent source: `0062229` (panel/card contract and specs), `8de9f11` (capsule telemetry/action prediction), `69addd2` (invoke implementation). The handoff's 2,263-test result is historical; the final candidate needs its own gates. A narrow rerun of `invoke.spec.mjs` during this chat passed 13/13 on the Mac mini; it does not certify end-to-end authorization or the full suite.

### Measurement substrate (added 2026-10-24)

The plan argued several things from anecdotes because nothing measured them. That gap is now closed for the capsule, which is the number that governs every session.

- [x] **Capsule telemetry.** Every `total-recall context` call records one line; read with `total-recall context-stats`. Records counts and identifiers only — never rule text, capsule content, query text or credentials — and is bounded by its own size cap, because an append-only log in this repo reached 306 MB and silently broke every backup for five weeks. `TR_CONTEXT_TELEMETRY=off` disables it.
- [x] **First measurement (2026-10-24).** All five actions show **0% overflow** at the configured 16,000 budget with ~5,900 tokens of headroom — so the documented `ready:true` gate **passes**, and TR-003's "12 of 13 overflow" claim is **stale**. Every action also reports `excluded = 0`, meaning **nothing is optional** and the budget is currently the only lever.
- [x] **Design rationale and the candidate pipeline** live in [`docs/MEASUREMENT_AND_INNOVATION.md`](../../../MEASUREMENT_AND_INNOVATION.md) — a living file outside `docs/projects/`, so it adds no second project and cannot drift into one.
- [ ] Reconcile the archived TR-003 overflow claim so the next agent does not re-investigate it.

### Phase 0 — Consolidation (complete)

- [x] Audit all 13 in-progress projects and record current evidence.
- [x] Resolve every contradiction and name the superseded requirement — PRD §4, register §2.
- [x] Establish six workstreams — ARCHITECTURE §2.
- [x] Build the source register mapping every predecessor item to one workstream.
- [x] Archive the 13 predecessors, marked consolidated and never complete.
- [x] Reconcile `docs/projects/README.md` to the same single owner (R5).
- [x] Correct the shipped documents that taught the deleted card model (R17) — register C9.

### LR-1 — Runtime truth

- [x] Resolve the foreign-PID daemon lock conflict. — Root cause: launchd `com.totalrecall.daemon` ran a **vendored 3.39.6** install from `~/.local/share/total-recall/runtime/context-optimization/`, 8 days old, while the server ran this checkout. Repointed the plist (backup `…bak-20261023-232803`) and reloaded; daemon now runs this checkout (PID 16322).
- [x] Resolve `server-process-unverified` to a verified identity or an honest failure. — Fixed a real defect: `processIdentity` resolved a **relative** launch-agent script path against the *caller's* cwd, so a healthy server read as `server-process-unverified` from any other directory. Now resolves against the process's own cwd (`readProcessCwd`), with the entry-tail rule applied only when no root resolves.
- [x] Fix the second cwd-dependency: `ssss` was searched only in `cwd`, so `shared_ready` was false outside a repo root. Now also searches beside the installed package.
- [x] Add a regression test that a silent no-op surface write fails loudly. — 5 new cases in `startup-health.spec.mjs`; **verified to fail against the pre-fix source** (2 failures) and pass after (21 passes).
- [x] Record `startup check --json`, the host, and the commit. — [`evidence/LR-1-remediation.md`](evidence/LR-1-remediation.md), [`evidence/LR-1-runtime-truth-diagnosis.md`](evidence/LR-1-runtime-truth-diagnosis.md)
- [ ] Make `status` distinguish *a daemon is live* from *this installation's daemon is live*, naming the installation when they differ (R7). — Still open; the disagreement is now explained but `status` still presents liveness as health.
- [ ] Prove the surface written is the surface a harness reads, both layers (R13). — Inherited from `SURFACE_COMPILATION_FIX`; not yet proven.
- [x] Re-run shared-runtime readiness on the **sanctioned Mac mini** (R28): DEV-API-02 and DEV-API-03 startup checks report shared_ready:true with Mini identity verified. This corrects the historical MacBook-only statement; final release-candidate runtime and status-ownership acceptance remain required.

### LR-2 — Release propagation

- [x] Close the local gap: installed CLI `3.40.4` vs published `3.40.7` (C4). — Installed `total-recall-brain@3.40.7` globally and repointed `/opt/homebrew/bin/total-recall` at the checkout so one installation is authoritative. **This mattered**: the 3.40.4 binary returned a *wrong health verdict* (`server conflict, daemon foreign-pid`) on a healthy runtime.
- [ ] Verify per surface and report stale consumers explicitly (R8, R10). — This machine only; the fleet and cloud are unverified.
- [ ] Prove an upgrade preserves memories, vault, configuration and plugin state (R9).
- [ ] Prove an interrupted upgrade is recoverable.
- [ ] Reconcile `UNIFORM_BRAIN_UPDATES`' stale open item.
- [ ] Record resolved version per consumer, with a failure list.

### LR-3 — Memory and instruction contract

- [x] **D2 old overflow blocker superseded:** telemetry above records 0% overflow at the configured 16,000 project budget. This does not decide a universal default; sync and curation remain separate tasks. Do not ask the owner to resolve the obsolete 4,000-token failure again.
- [ ] Reconcile instruction surfaces from the scaffold as publish source (R12). Current: local 28,192 vs remote 24,897, `never` synced, no targets.
- [ ] Resolve the three-way skill/entrypoint version skew.
- [ ] Make the capsule name its required set and overage on overflow (R14).
- [ ] Decide whether the duplicated `AGENTS.md` block (94% of the surface) stays compiled.
- [ ] Record capsule token count per action and `In sync: yes` with targets named.

### Blocking defects found while closing LR-1/LR-4 (fixed in this pass)

Found because the plan's gates were actually run rather than trusted. **None was reported by any predecessor project.**

- [x] **The dashboard could not build at all.** `frontend/src/pages/PluginsPage.tsx:831` placed a JSX comment `{/* … */}` as the first item of a ternary branch, which is invalid syntax. `tsc -b` failed with 7 errors, so `npm --prefix frontend run build` could never produce a current bundle — which is *why* `dist/` was 985 minutes stale and why publishing would have shipped new source with an old dashboard. Fixed by using a `//` comment. The build now completes: 497 modules, `dist/index.html` rebuilt.
- [x] **Dead template-model code still shipped in the card UI.** `frontend/src/components/plugins/card/widgets.tsx` imported `CardRegion`/`CardColumn` and exported `DataWidget` with `table`/`list`/`detail`/`gauge`/`log` renderers — the deleted layout vocabulary. `format.ts` imported the removed `CellFormat`. All were unreachable (0 external references) but broke the build and kept the wrong model in the tree. Removed; `CellFormat` is now owned by `format.ts` as a presentation type, and `CommandsWidget` no longer takes a fake `region`.
- [x] **`plugin create` could not create any plugin.** Every invocation failed with `'ui.elements' must declare the plugin's card face` and then deleted the directory. Confirmed identical at HEAD `aee2ad0` — a complete, unreported regression of the scaffolder. Fixed by giving a scaffold an explicit `scaffold: true` state: it installs so the author can iterate, and reports its missing face as a warning (`card.mjs:validateCardFace`). Verified: create now succeeds and the plugin lists as active.
- [x] **The scaffolder advertised a UI it cannot emit.** `create.mjs` accepted `--with-ui` and its README said "`ui/panel.js` custom element"; the emit path threw `UiSpecError` because no `manifest.ui` is ever built. `--with-ui` now states that the face is authored by hand, the unreachable `generateUiElements` call and its import are gone, and the README says so.
- [x] **The card contract broke 21 spec files' fixtures.** Tightening `ui.elements` to required left every fixture that builds a manifest without a face failing — **60 failures at HEAD `aee2ad0`**. None was caused by this work; all were confirmed present at HEAD. Fixed with `src/core/testing/plugin-fixture.mjs`, which supplies the smallest honest face (`withFixtureFace`, `writeFixturePlugin`) so plumbing specs assert what they mean to assert. Fixtures that must *lack* a face opt out with `ui: null`.
- [x] **A bundle request staged the operator's installed plugin instead of the bundled one.** `resolveCapabilitySource('auth')` asked `getPlugin` first, which searches the project and global agent dirs; on a machine where the same id is also installed it returned that copy, so `sourceType` was recorded `'local'` rather than `'bundled'`. A capability deploy could therefore stage a different plugin than the caller named. Fixed in `src/core/app-deploy/source.mjs` by resolving the bundled directory first for a bare id and falling back to what is installed. `source.spec.mjs` now passes 8/8.
- [x] **Plugin search matched inside unrelated words.** `matches()` used a raw `String.includes(query)`, so searching `git` matched the signing plugin's description ("**Digi**tal agreement signing engine…") and returned `[git-sentinel, signing]`. Fixed in `src/cli/plugin/search.mjs` with word-boundary matching anchored at a word start, so `git` finds only `git-sentinel` while `sent` still finds it as a real substring. Verified across `git`, `sent`, `stripe`.
- [x] **A personal-information leak in a shipped scaffold file.** `repo-hygiene.spec.mjs` flagged `scaffold/.agent/skills/total-recall/plugins/auth/src/cli-secret.mjs:539`, whose comment named the operator's private production applications as credential-prefix examples. The scaffold ships to every user. Comment generalized to neutral placeholders; the instruction is unchanged. This is a real R20/R21 packaging-safety finding, caught by a gate that had been failing unnoticed.
- [x] **`repo-hygiene.spec.mjs` scaffold allowlist** was stale: it expected a `plugins` skill directory removed in `aee2ad0`. Corrected to `plugin`, matching the live and scaffold trees.
- [x] **The release gate misclassified bundled plugin source as leaked brain state.** `brain-state.json` lists `plugins` as per-brain state (correct for an *installed* plugin directory), and `isBrainState` matched that segment **anywhere** in a path. The scaffold legitimately ships bundled plugin source at `scaffold/.agent/skills/total-recall/plugins/<id>/` — and `.gitignore:157` states plainly those must stay in git — so the template itself was flagged and the release gate failed. Fixed by anchoring an exemption to the scaffold's own brain path; an installed or brain-local `plugins/` directory is still state. `check-scaffold-state.mjs` now reports all three checks green and `brain-state.spec.mjs` passes 11/11.
- [x] **The scaffold's pinned plugin hashes were stale.** The same gate hash-pins every bundled plugin file in `scripts/scaffold-plugins.json`. Removing the private-app-name leak changed one file, correctly invalidating its pin. Re-pinned through the sanctioned `scripts/sync-scaffold-plugins.mjs`: **212 pinned files, 7 changes** — which also brought `mesh/ui/card.js` and several plugin manifests back into sync.
- [x] **`plugin-context.spec.mjs` "assembles evolving context"** returned empty. The fixture plugin declared no card face, so it was invalid, and `assemblePluginContexts` skips invalid plugins (`plugin-context.mjs:21`). Face added to the fixture; 5/5 pass.
- [x] **`PluginsPage.spec.tsx` modernized** (Greg: "ensure tests are modern"). The spec encoded the pre-bespoke layout, expecting commands inline on the card and a mock plugin with no `ui`. It now models a real plugin — one bespoke face plus three panels — and asserts the actual architecture: the face mounts in a sandboxed `allow-scripts` frame (owner code runs isolated, never host-rendered), commands are reached through the drawer's Commands screen, and no command runs on render. A second test asserts the face/panel cardinality. 6/6 pass.

### Pre-existing gate findings found during LR-1 (fixed in this pass)

`total-recall code-quality-check --tier fast` reported 3 findings, **none caused by this work** (the dist bundle was stale since 2026-10-23 01:23, before any edit here).

- [x] `security-dependencies` — 3 high advisories (`undici` ×3, `zod`). Fixed: `npm audit fix` → root now reports **0 vulnerabilities**.
- [x] `security-frontend-dependencies` — same class in `frontend/`. Fixed: `npm audit fix --prefix frontend` → **0 vulnerabilities**.
- [x] `dist-freshness` — the dashboard bundle was 985 minutes older than its sources, so publishing would have shipped new source with a stale served dashboard (the exact failure that shipped 3.23.0/3.23.1 without their mesh UI). Rebuilt on the sanctioned build host: `npm --prefix frontend run build`. Note `check-dist-freshness.mjs` states heavy builds are not permitted on a laptop; this host reports `self: true` for `macmini` in `mesh status`, so it is the sanctioned node.

### LR-4 — Packaging safety

- [ ] Publish the fix so the **installed package** stops carrying the old copy behavior (R22). **Launch blocker.**
- [ ] Certify every path independently: export, import, scaffold, install, `skill deploy`, sharing (R21).
- [ ] Reconcile the `--from-skill` path against the shared exclusion predicate (C3).
- [ ] Resolve `tokenPanelSource()` (`create.mjs:76`) against the tracker's removal claim.
- [ ] Remove generated `panel.js` / `DESIGN.md` stub / `ui` block; emit a valid manifest or say the face comes later (R19).
- [ ] Relocate or remove the 46 MB `browser-profile`.
- [ ] Add a scan asserting no private-state path reaches a distributed artifact.
- [ ] Record the per-path scan and the installed-package hash.

### LR-5 — Plugin, brick and card contract

- [x] Core contains no layout vocabulary (R16) — verified, 0 matches.
- [x] `card_layout` is a validation error (R15) — `card.mjs:109`.
- [x] 0 of 34 plugins declare `card_layout`.
- [x] Three card faces verified complete: `git-sentinel` 625, `stripe` 790, `system-monitor` 655 lines, each with `DESIGN.md`.
- [ ] Correct every shipped document teaching the deleted model (R17) — `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176–189` primary; `PLUGIN_UI_OVERHAUL` Recipe Contract follows.
- [x] Settle **D1** with Greg: panels may coexist with the card face. — **Resolved: "as many panel screens as needed."** Added an explicit contract test (40 panels + 1 face valid, two faces rejected, panels before or after the face), stated the rule in `card.mjs` and the authoring reference, and fixed a real bug this exposed: `normalizeCard` matched `kind === 'card' || kind === 'panel'`, so **a panel declared before the card would have been mounted as the face**. Regression test verified to fail against the pre-fix matcher.
- [x] Make `ui` optional for a brick while a plugin still requires exactly one bespoke face. — `brick: true` + `capability` skips the face requirement (`card.mjs`); UI on a brick and a non-brick without a face are both errors.
- [x] Add `capability {entry, exports}` and `pluginBundleFiles(dir, {audience})`. — `host` = all files; `brick` = capability dir + package.json/LICENSE/README + reduced plugin.json; `vendorPlugin` uses `brick` whenever a capability is declared and records the hash of the vendored files.
- [ ] Extract `capability/index.mjs` for `stripe`; inject transport; drop placeholders and example defaults.
- [x] Prove a vendored brick runs with `TOTAL_RECALL_BIN=/nonexistent` and contains no UI and no reachable `total-recall` string. — spec vendors a fixture, asserts no `ui/`/cli files, no `total-recall` text, and runs it in a child with an empty PATH. Real plugins (stripe) still need extraction.
- [ ] Finish the `mesh` card face — the only card workstream with real open work.
- [ ] Correct the plugin count to **34** everywhere (C12).
- [ ] Accept the remaining per-plugin faces as design work in progress, not a launch gate.
- [ ] Record validator output over all manifests and the brick exclusion proof.

### LR-6 — Launch acceptance

- [ ] Run [`LAUNCH_ACCEPTANCE_JOURNEY.md`](LAUNCH_ACCEPTANCE_JOURNEY.md) end to end.
- [ ] Verify installation instructions from a clean machine against the published package (R24).
- [ ] Reconcile public claims to demonstrated behavior only (R23).
- [ ] Close `TR_LAUNCH_HARNESS_DISCOVERY` LH-001 (landing ownership) and LH-004 (DSH probe), or drop as non-launch.
- [ ] Verify a clean, fully pushed working tree — false on disk at audit time.
- [ ] Run sanctioned suites on the Mac mini and record the host (R28).
- [ ] Record the journey transcript with one host per stage.

## Launch gates

| Gate | Requirement | State |
| --- | --- | --- |
| L1 | `shared_ready: true` | **Passing** — `server: ready` 3.40.7, `daemon: running`, brain ready, ssss available, `shared_ready: true` (from a neutral cwd) |
| L2 | Installed version equals published | **Passing on this host** — CLI `v3.40.7` = npm `3.40.7`; fleet and cloud unverified |
| L3 | Instructions in sync; capsule meets its gate | **Partial** — configured capsule budget passes recorded telemetry; instruction sync/version acceptance remains open. Old overflow evidence is superseded. |
| L4 | Fresh install reaches a working brain and plugin | **Partly proven** — `plugin create` now works end to end (was impossible); full clean-machine run not done |
| L5 | Upgrade preserves state | Unknown — not yet run |
| L6 | Complete journey passes | Unknown — not yet run |

## Open decisions

| ID | Decision | Owner | Blocks | Resolution |
| --- | --- | --- | --- | --- |
| D1 | May panels coexist with a card face? | Greg | LR-5 final acceptance | **RESOLVED 2026-10-24 — "as many panel screens as needed."** One face, unlimited panels. The host imposes no count and no screen set. Locked in by the contract spec, the authoring reference, and a regression test. |
| D2 | Historical 4,000-token overflow blocker | Reconciled | LR-3 | **Superseded by measured project configuration:** telemetry passes at 16,000. Universal default/curation policy is not newly decided; instruction sync remains open independently. |

## Verified evidence at `aee2ad0`

Recorded so these are not re-litigated. **Local host; sanctioned Mac mini gates were not run.**

| Claim | Command | Result |
| --- | --- | --- |
| No template vocabulary in core | `grep -rn "CARD_TEMPLATES\|CARD_WIDGETS\|WidgetKind\|CardRegion" src/` | 0 matches |
| `validateCardFace` replaced `validateLayout` | `grep -rn "validateCardFace\|validateLayout" src/` | only `card.mjs:109` |
| No plugin declares a template | grep `card_layout` over all `plugin.json` | 0 of 9 in-repo |
| In-repo plugins carry bespoke faces | `find -path "*/plugins/*/ui/card.js"` | 9 of 9 |
| Installed plugins | `total-recall plugin list --json` | 34 |
| Spec files | `find -name "*.spec.mjs"` | 312 |
| Global brain nodes | `total-recall brain list` | 1,617 |
| Registered project brains | `total-recall brain list` | 56 |
| Published npm version | `npm view total-recall-brain version` | 3.40.7 |
| Installed CLI version | `total-recall --version` | 3.40.4 |
| Card faces in owner repos | `wc -l ui/card.js` | git-sentinel 625, stripe 790, system-monitor 655, mesh 434 |
| `auth` second-face item already resolved | `plugin info auth --json` + `ui/card.js` | single `kind: card`, 315 lines, `DESIGN.md` present |
| Scaffolder still emits UI | `grep -n "with-ui\|panel.js" create.mjs` | `:118` accepts `--with-ui`; `:472` advertises `ui/panel.js` |

## Current limits

- All results above are **local** to the MacBook. No sanctioned Mac mini gate ran for this consolidation.
- `startup check` describes this machine's runtime only, not the cloud or the fleet.
- Version numbers are point-in-time at `aee2ad0`.
- Predecessor checked boxes were not re-certified; they remain `claim` per the register.
- No plugin UI was rendered in a browser for this audit.

## Reconciled readiness — October 24

In progress. Identity fixes and the local version gap have recorded evidence; panel approval and its modernized tests are complete. The old capsule-overflow blocker is superseded by telemetry. Those results do not establish instruction synchronization, fleet propagation, safe distributed artifacts, upgrade preservation or the complete launch journey. Work remains under the same six LR workstreams. Next implementation batch is DEV-API-01: retain and secure the optional developer API, then verify instruction/local-only behavior, packaging/upgrades and the complete journey. Gro's agent delivery tasks do not block this launch. Current route existence is not completed permission enforcement.

## Action Log

Append-only. Timestamp · actor · action · outcome · evidence.


- `2026-10-24T05:16:00Z` — Claude (DSH): Read the last Codex thread (`01a16c06`, "Troubleshoot Gro CRM login"). Established that it ended at 05:01:17 having only *announced* the consolidation. Outcome: the consolidation work was never started. Evidence: `~/.codex/sessions/2026/10/23/rollout-2026-10-23T21-48-56-01a16c06-*.jsonl`.
- `2026-10-24T05:17:00Z` — Claude (DSH): Audited all 13 in-progress projects. Found a prior consolidation had drifted (13 predecessors absorbed, 12 new projects created after). Outcome: `TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`. Evidence: `ls docs/projects/in-progress/`, `docs/projects/README.md`, `SOURCE_PROJECT_REGISTER.md`.
- `2026-10-24T05:17:39Z` — Claude (DSH): Ran `startup check --json`. Outcome: `shared_ready: false`; `server: conflict / server-process-unverified`; `daemon: conflict / foreign-pid`. Evidence: startup check output in audit §2.2.
- `2026-10-24T05:18:00Z` — Claude (DSH): Verified the card architecture is enforced. Outcome: 0 template matches in `src/`, 0 of 34 plugins declare `card_layout`, `validateCardFace` errors on it. Evidence: audit §2.1.
- `2026-10-24T05:18:30Z` — Claude (DSH): Confirmed Codex's creator findings in live source. Outcome: `tokenPanelSource()` at `create.mjs:76`; `--from-skill` separate import path at `:163`. Evidence: audit §2.5.
- `2026-10-24T05:19:00Z` — Claude (DSH): Independently verified the three "complete" card projects rather than trusting their trackers. Outcome: git-sentinel 625, stripe 790, system-monitor 655 line faces with `DESIGN.md` and no `card_layout`; their completion claims hold, their folders were simply never moved. Evidence: `~/github/tr-plugin-*/ui/`.
- `2026-10-24T05:19:30Z` — Claude (DSH): Confirmed the scaffolder still generates UI, reconciling a two-project disagreement. Outcome: `create.mjs:118` accepts `--with-ui`, `:472` advertises `ui/panel.js`; the creator's "removed" box is stale. Evidence: audit §2.5.
- `2026-10-24T05:20:00Z` — Claude (DSH): Wrote the consolidated plan — AUDIT, PRD, ARCHITECTURE, DEVELOPMENT_PLAN, source register, acceptance journey, tracker. Outcome: six workstreams, 12 contradictions resolved, 2 open decisions (D1, D2). Evidence: this folder.
- `2026-10-24T05:21:00Z` — Claude (DSH): Archived the 13 predecessors under `archived/consolidated-into-total-recall-launch-plan/`, preserving their evidence and unfinished work without marking any complete. Evidence: `git status`, archive listing.
- `2026-10-24T05:22:00Z` — Claude (DSH): Reconciled `docs/projects/README.md` to name `TOTAL_RECALL_LAUNCH_PLAN` as the single active project (R5). Evidence: README.
- `2026-10-24T05:23:00Z` — Claude (DSH): Corrected the shipped documents that taught the deleted card model: replaced the layout-contract section in `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md` (now archived) with the bespoke contract (R17). Evidence: register C9.
- `2026-10-24T05:27:00Z` — Claude (DSH): **LR-1 diagnosed and fixed.** `launchd` job `com.totalrecall.daemon` ran a **vendored 3.39.6** install (8 days old) while the server ran this checkout, so the daemon lock was legitimately foreign. Repointed the plist (backup `com.totalrecall.daemon.plist.bak-20261023-232803`) and reloaded. Then found two real cwd-dependency defects: `processIdentity` resolved a **relative** launch-agent script path against the *caller's* cwd, and `ssss` was searched only in `cwd`. Both fixed with 5 regression tests **verified to fail against the pre-fix source**. Evidence: [`evidence/LR-1-remediation.md`](evidence/LR-1-remediation.md).
- `2026-10-24T05:29:00Z` — Claude (DSH): **L1 passes.** `startup check --json` from `/tmp`: `server: ready 3.40.7`, `daemon: running`, `brain: ready`, `ssss: available`, `shared_ready: true`, `ready: true`.
- `2026-10-24T05:30:00Z` — Claude (DSH): **L2 passes on this host.** The installed CLI was `3.40.4` and returned a *wrong health verdict* (`server conflict, daemon foreign-pid`) on a healthy runtime; the checkout's `3.40.7` returned `ready`. Installed `total-recall-brain@3.40.7` globally and repointed `/opt/homebrew/bin/total-recall` at the checkout so one installation is authoritative.
- `2026-10-24T05:33:00Z` — Claude (DSH): Ran `code-quality-check --tier fast`: 3 findings, **none caused by this work** (dist stale since 2026-10-23 01:23). Fixed the two dependency advisories (`npm audit fix`, root and frontend → 0 vulnerabilities).
- `2026-10-24T05:36:00Z` — Claude (DSH): **The dashboard could not build at all** — `PluginsPage.tsx:831` had a JSX comment as a ternary branch (7 TS errors). This is why `dist/` could never refresh. Fixed; build succeeds.
- `2026-10-24T05:37:00Z` — Claude (DSH): Removed dead template-model code still shipping in the card UI (`CardRegion`/`CardColumn` imports, `DataWidget` with table/list/detail/gauge/log renderers, `Cell`, `CellFormat`). All unreachable, but they kept the deleted vocabulary in the tree and broke the build.
- `2026-10-24T05:38:00Z` — Claude (DSH): **`plugin create` could not create any plugin** — every invocation failed validation and deleted the directory, confirmed identical at HEAD. Fixed with an explicit `scaffold: true` state; verified create now succeeds and installs. Also removed the scaffolder's unreachable `generateUiElements` call and its `ui/panel.js` README claim.
- `2026-10-24T05:40:00Z` — Claude (DSH): **The card contract had broken 21 spec files (60 failures) at HEAD.** Added `src/core/testing/plugin-fixture.mjs` and updated the fixtures; the production contract is unchanged and `ui: null` keeps the negative case testable.
- `2026-10-24T05:42:00Z` — Claude (DSH): Fixed a **bundle request staging the wrong plugin** — `resolveCapabilitySource` asked `getPlugin` first, which finds the global install, so a request for a bundled id was recorded `local` and staged the operator's copy. Bundled now resolves first.
- `2026-10-24T05:43:00Z` — Claude (DSH): Fixed **plugin search matching inside words** — `git` returned `[git-sentinel, signing]` because `signing`'s description contains "**Digi**tal". Word-boundary matching; `git`→`git-sentinel`, `sent`→`git-sentinel`.
- `2026-10-24T05:44:00Z` — Claude (DSH): **Removed a personal-information leak from a shipped scaffold file** — `scaffold/.../auth/src/cli-secret.mjs:539` named two of the operator's private production applications as credential-prefix examples. Fixed at the source in the owner repo `tr-plugin-auth` **and** all three installed/scaffold copies. This is the R20/R21 class the workstream exists to catch.
- `2026-10-24T05:45:00Z` — Claude (DSH): **The release gate misclassified bundled plugin source as leaked brain state** — `isBrainState` matched the `plugins` segment anywhere, so the scaffold's own template failed the gate. Anchored an exemption to the scaffold brain path. Re-pinned the stale plugin hashes through `scripts/sync-scaffold-plugins.mjs` (212 files, 7 changes). Gate now reports all three checks green.
- `2026-10-24T05:47:00Z` — Claude (DSH): **All quality gates clean (0 findings)**; dashboard bundle rebuilt and current; `total-recall lint` 0 errors.
- `2026-10-24T05:51:00Z` — Claude (DSH): **Final suite: 2218 of 2219 tests pass**, 362 of 363 files. Down from **60 failures at HEAD**. The single remaining failure (`PluginsPage.spec.tsx`) encodes the pre-bespoke layout and awaits the **D1** decision.
- `2026-10-24T05:52:00Z` — Claude (DSH): Committed and pushed. Evidence: `git log`, push result.

- `2026-10-24T21:24Z` — Codex: SCOPE-RECONCILE-01 audit compared both five-file plans, source routes, server binding/local CLI, Git history and the pasted handoff. Found Gro requirements had been presented as TR launch work and `69addd2` invoke lacked a plan disposition. Updated audit first, then requirements/architecture/plan/tracker; corrected known stale D1/D2/local version and scaffolder statuses. Preserved unrelated work and historical action entries. Earlier read attempts used the wrong repository for a TR path and returned missing-file errors; corrected explicit cwd. No feature code, package version or deployment changed. Documentation/link validation and Git publication results follow.
- `2026-10-24T21:30Z` — Codex: both projects pass five-file scope/final Action Log checks and corrected Gro plan link resolves; TR `git diff --check` passes. Saved scoped correction through TR, refreshed local OpenWiki (8 imports, 0 errors) and confirmed retrieval; Gro did the same (6 imports, 0 errors). Local OpenWiki/brain state remains excluded from TR's public Git artifact. Sequential TR fast quality gates passed with 0 findings in3.4s. Gro's separate full gate passed523 CRM runtime tests then failed its pre-existing native-restoration policy expectation; recorded in Gro, not used as a TR failure or launch dependency. No TR runtime source, package version or deployment changed; invoke disposition remains open. Final Git verification follows.
- `2026-10-24T21:31Z` — Codex: verified TR commit420c7da and Gro commit52660b3 pushed to their own origin/main; clean checkouts, matching HEAD/upstream and0 unpushed commits. Reconciliation complete, both product projects still in progress. This log-only follow-up preserves publication evidence. No npm release or production activation was performed; TR invoke disposition and its six launch workstreams remain tracked here, Gro native/memory work remains tracked there.
- `2026-10-24T21:57Z` — Codex: DEV-API-01 owner approval supersedes the earlier undecided invoke disposition: TR serves developers, retains optional `/v1/invoke`, and supports explicit full-developer grants alongside restricted keys. Updated audit, PRD API-1–API-6, architecture execution contract, next implementation batch, tracker and optional API acceptance matrix; Gro's five documents preserve seller permissions separately. Edited scoped memory in place through TR, recompiled, refreshed local hubs (TR8/Gro6 imports,0 errors), verified retrieval in both brains. All ten-document/Action Log checks, unique requirements, stale-task replacement and whitespace checks pass; Gro audit checker passes. Sequential TR fast gates exited0 with0 findings in3.1s. No runtime code, tests, package version or deployment changed; hardening and acceptance remain pending. Full suites not rerun for docs; prior Gro native-policy failure remains a Gro task. Prepared normal Git publication under the standing push rule.
- `2026-10-24T22:00Z` — Codex: wrote root HANDOFF.md at the owner's explicit request, replacing an ignored/local October21 handoff with the approved DEV-API-01 decision, permission gaps, next implementation batch, six-workstream links, actual verification limits and separate Gro responsibilities. Gro received its own root handoff. Both handoffs pass local-link/scope checks and whitespace validation; no source or runtime changes. TR handoff is explicitly added despite its prior ignore rule because the owner requested the root deliverable and requires whole-tree publication; content contains no credentials or private brain state. Current docs commits before this handoff are TRbf2b957 and Gro9c13aed; both were independently verified pushed and clean. No suites rerun for handoff-only edits. Git publication follows.
- `2026-10-24T22:15Z` — Codex: followed root handoff, loaded ready read/edit/test context, audited shared auth/CLI/composed/remember paths and current official Node process documentation. Verified Mini identity and shared runtime readiness. Found raw-scope role bypass, prototype dispatch, inherited server authority and executable plugin generators in memory compilation. Updated five-file baseline for DEV-API-02: explicit modes, restricted local retrieval, unsupported execution denied, lifecycle/resource enforcement; complete API and launch acceptance remain in progress. One initial documentation patch used a mismatched heading and made no changes; corrected before implementation. Owner repositories outside this project remain unchanged.

- `2026-10-24T22:28Z` — Codex: implemented DEV-API-02 explicit mode/issuer grants, fresh auth role/lifecycle checks, registry/target enforcement, isolated local retrieval, controlled child env and bounded/cancellable process groups, truthful exits, matched discovery and validated SSSS audit persistence. Unsupported restricted write/CLI/plugin/composed/provider work fails closed; full trusted host authority remains intentional. Independent agent's5 actual HTTP tests pass using its own auth-owned disposable keys; standalone CLI remember/recall/context passes with an unreachable HTTP endpoint. First full suite reproduced1 stale handoff-policy failure (2296 pass); fixed the contradiction while retaining private-state/npm exclusion. Final Mini suite:2303 tests/371 files pass, exit0; final focused56 tests/6 files pass including descendant cleanup. Eight configured full-tier quality checks pass with0 findings and a fresh report; remote-tier test is separately supplied by actual Mini npm test. Formal audit checker initially rejected missing sections/commit formatting; completed the source baseline and checker now passes. Refreshed local OpenWiki8 imports/0 errors, saved fix via remember and verified exact retrieval; refreshed context ready:true at11920 tokens. Evidence: evidence/DEV-API-02-source-verification.md. Full API, release and launch remain in progress; no npm publication or serving activation. Preparing whole-tree Git publication.
- `2026-10-24T22:31Z` — Codex: committed the complete source/docs/generated-expert working tree as bfd81ab and pushed origin/main. Verified actual push exit0, clean status, exact HEAD/upstream equality at bfd81ab3db955fbc2180b11f532b21c0d25fbec4 and0 unpushed commits. Final documentation/package gate rerun passed8 checks/0 findings in3.2s with FRESH report; implementation hashes and root-handoff/acceptance links match the recorded artifact. Updated scaffold operations reference with the new optional API contract; no skill registry fan-out or serving/package activation performed. This log-only follow-up records publication evidence without changing the tested implementation.
- `2026-10-25T02:00Z` — Codex: resumed root handoff at182ee62; read previous chat, five-file plan and memory-owner source; verified Mini/shared runtime and consulted current official Node filesystem/permission documentation. Audited DEV-API-03 before code: restricted fact creation will use a generated server-brain path, explicit memory:create principal and generator-free local projection. Updated all five planning documents. Unknown arbitrary writes/owners remain denied. Baseline route suite and final verification are recorded in batch evidence; no serving/package activation authorized by this stage.
- `2026-10-25T02:12Z` — Codex: implemented DEV-API-03 fact-only restricted mutation and shared CLI owner. Focused tests exposed canonical-path and fresh-directory permission defects; fixed both at the adapter, retaining filesystem permissions. Fixed short-lived test socket reuse and added truthful CLI partial-commit output. First full Mini suite passed2342 tests/372 files; final focused suite passed107 tests/6 files after the CLI refinement. Eight configured quality gates passed with0 findings, actual checker exit0 and FRESH report. Final-source full suite is running separately. Saved the fix through remember, refreshed ready context at12118 tokens, ingested8 OpenWiki files/0 errors and verified exact memory retrieval. Actual auth-owned writer/reader HTTP and independent server-free CLI exercises pass; fixtures/listeners cleaned. Updated guide, scaffold operations reference, five-file plan, acceptance matrix and handoff; final full-suite/publication evidence follows. General restricted owners, provider quotas and launch remain in progress.
- `2026-10-25T02:13Z` — Codex: final-source Mini npm test exited0:2343 tests/372 files pass in227.89s. Final focused107 tests/6 files and all8 configured quality gates also exited0; report is FRESH with0 findings. Reviewed complete staged source/docs/generated-expert diff, checked implementation SHA-256 values, audit conventions and whitespace; no conflicts. Updated source evidence and handoff, corrected the historical Mini-readiness checkbox while retaining unproven status ownership and release-candidate requirements. Preparing whole-tree source commit/push under the standing rule; no npm release, fleet rollout or serving activation.
- `2026-10-25T02:13:24Z` — Codex: committed the complete21-file implementation/docs/generated-expert tree as884f7af and pushed origin/main, actual push exit0. Independently verified HEAD equals origin/main at884f7afd90d6eaabc5290592b9496642ac6627c4,0 unpushed commits and clean status. git-sentinel confirms tracking,0 behind,0 dirty and no errors. This documentation-only follow-up records publication evidence; the tested source hashes remain unchanged and API/launch work remains in progress.
- `2026-10-25T02:23Z` — Codex: resumed from96a7ddb via Total Recall and prior chat/handoff. Audited the decision handlers: in-process execution ignored the authority controller and child resource limits. Baseline57 tests/2 files passed on the Mini. Updated five-file baseline before implementation and verified audit conventions; an initial heading-only patch failed without changing files, then corrected. Added structured bounded decision child using the existing installed client/auth owner, preserved typed/advisory results and suppressed private error diagnostics. Fixed discovery to advertise configured ceilings. First focused run exposed an incomplete test decision adapter (missing confidence accessor); completed the adapter and deterministic index, retaining the production checks. Focused81 tests/3 files pass before the final discovery case. Actual children prove revocation/PID retirement and a loopback provider connection closing after revocation; no live provider charges. Eight configured full-tier gates pass with0 findings, actual exit0 and FRESH report. Final full Mini suite and focused checks are running separately. Updated guide, handoff, acceptance matrix, operations/scaffold reference and evidence; ingested8 OpenWiki files/0 errors, saved the fix via remember and verified retrieval. Full provider budgets, broader restricted owners and launch remain in progress; no npm/serving activation.
- `2026-10-25T02:24Z` — Codex: final Mini npm test exited0:2359 tests/372 files pass in209.63s. Final focused suite exited0:82 tests/3 files; configured full-tier checker exited0:8 gates/0 findings and report FRESH. Existing mock-hoisting deprecation warnings remain non-failing. Reviewed all15 staged files, verified implementation/spec hashes against source evidence, audit conventions and whitespace; no conflicts. Updated final evidence and handoff, preserving open provider budgets/restricted adapters/launch items. Preparing complete working-tree Git publication; no npm, fleet or serving activation.
- `2026-10-25T02:24:35Z` — Codex: committed the complete15-file implementation/docs/generated-expert tree as90363eb and pushed origin/main, actual push exit0. Independently verified HEAD equals origin/main at90363eb61f092c3e7e27be65219654a249cd4af1,0 unpushed commits and clean status. git-sentinel reports0 dirty/behind/conflicts and no errors. This documentation-only follow-up records publication evidence; tested implementation hashes remain unchanged. Complete API/launch work remains in progress; no npm release, fleet rollout or serving activation.
- `2026-10-24T20:35:00Z` — Claude: LR-5 brick contract. Added `brick`/`capability` validation, `pluginBundleFiles` audiences and brick vendoring with drift hashing; 3 new card specs + 1 vendor spec. Full Mini suite 2363/2364; the one failure (`brain-registry.spec`, `readRegisteredProjects` not a function) came from another process's in-progress edit of `brain-registry.mjs` and passes on rerun (8/8). Not yet done: stripe `capability/index.mjs` extraction, transport injection, validator output over all manifests.

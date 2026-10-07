---
type: project_document
title: PLUGIN_P2P — Audit
description: Audit with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# PLUGIN_P2P — Audit

> **Project Prefix**: `PLUGIN_P2P`
> **Kanban State**: In progress — corrections and verification pending
> **Date**: 2026-09-30
> **Reconciliation author**: Codex
> **Based on audit**: [PLUGIN_P2P_AUDIT.md](PLUGIN_P2P_AUDIT.md), current reconciliation

## Current audit reconciliation

**Audit Status:** Complete for this scoped reconciliation of current source and prior baseline; live public exchange remains unverified. **Audited commit:** `e5d9aad0dd7d7372363a7d5d0c97349949330446` plus reviewed working-tree changes. This section supersedes historical readiness claims below. See [central correction audit](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_AUDIT.md) for PIC-001–005 and PIC-021.

Current source contains `plugin-public.mjs` parsing hash-pinned HTTPS links, `plugin-bundle.mjs` validating decoded checksums, `plugin-store.mjs` recording public/mesh share state and install provenance, and separate public/mesh routes. Focused tests exercise these boundaries with controlled dependencies. Their existence proves implementation/tests exist, not successful independent-user exchange. `plugin-store.mjs:142–149` distinguishes public and mesh share state and reports current/installed checksums plus modification status. `plugin-store.mjs:133` passes through manifest authorship; it is a publisher claim, not authenticated attribution.

The current review route introduces an unregistered primitive, mismatched write/read storage, caller-controlled reviewer/verified fields, and manifest-only conformance defaults. These defects conflict with both the original no-fake-social-proof intent and the later genuine-review goal. Root causes are contradictory requirements, mock tests at the persistence boundary, and success claims disconnected from installed artifacts and walkthroughs.

Prior Mac mini baseline: full Vitest run 361 files, 355 passed/6 failed; five failures came from snapshot omissions. Corrected rerun of the affected files had five pass and route inventory fail (54 tests pass/1 fail). No single full green run exists for the current snapshot. Historical 2026-09-25 green evidence below remains historical, not current certification.

| Finding | Impact | Disposition |
|---|---|---|
| P2P requirements contradict showcase review/badge scope | Agents cannot apply a single honest trust contract | Resolve documented proposal before exposing additional social features |
| Independent-user live exchange lacks current evidence | Public sharing readiness cannot be certified | Keep public sender/recipient install/run walkthrough pending |
| Checksums are confused with authorship or conformance | Users may infer trust beyond measured facts | Display integrity, claimed author, authenticated review provenance, and measured evidence separately |
| PIC-002–005 / PIC-021 | Broken review state and overstated verification | Track corrections centrally; no deployment claim |

Scope includes distribution state, checksum/provenance display, privacy exclusions, tests, and documentation. Credentials remain in the secrets store; application state uses registered SSSS documents/core operations. Sharing must remain explicit, unsharing must remove public access, and installation must not export sender credentials, private vault data, or unrelated files. Existing bundle guards and outbound restrictions must be preserved and verified against the packaged/installed artifact. Deployment/rollback remain governed by repo skills and the prior verified artifact; this documentation makes no source or runtime change. All open findings have a correction disposition; no external API recommendation or new provider integration is introduced.

## Requirement conflict and reviewable resolution (PIC-023)

Historical P2P requirements prohibited all ratings, reviews, and verified fields. The later showcase requirements requested real user reviews and conformance displays. Those documents gave agents contradictory instructions. The proposed resolution is genuine opt-in, authenticated authored review text, separate from artifact-bound measured conformance evidence. Neither publisher assertions nor user opinion may generate a verified badge. Invented stars, download numbers, review totals, fabricated status, and manifest-only verification remain prohibited. This is a documented proposal for review, not a claim that Greg approved additional product scope. Numerical ratings and aggregate stars remain outside the agreed correction scope until this conflict is explicitly resolved.

Public person-to-person sharing among independent Total Recall users is the requirement. Private mesh sharing is an additional own-device capability and cannot substitute for the public sender-to-recipient path. A checksum establishes byte integrity; it does not establish author identity, safety, live capability, or independent verification.

---

**Finding mapping:** PIC-020 owns authenticated review identity and rejection of caller-controlled verification/provenance; PIC-023 owns the cross-project requirements conflict and public-sharing scope. PIC-004 owns measured conformance evidence. See the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

---

## Historical record — superseded where inconsistent

Original text is retained for traceability. Dated source/test assertions are historical evidence, not certification of the current installed artifact. The reconciliation above controls current planning; no additional product scope is approved by its existence.

# PLUGIN_P2P — Audit

> **Project Prefix**: `PLUGIN_P2P`
> **Kanban State**: In progress
> **Date**: 2026-09-22
> **Trigger**: User request — "finish setting up the plugins — it should be p2p, they should be for customizing total recall for different uses — make sure no fake shit like review stars or download numbers."

The plugin system shipped in 3.27.0 (`8a45ece`) / 3.28.0 (`eba1afb`, `7f8e9a3`, `6c950df`) and its project was moved to `docs/projects/completed/TOTAL_RECALL_PLUGIN_SYSTEM/`. This audit records what is actually there.

## 1. Files involved

| Area | File | Lines |
|---|---|---|
| Loader / validation | `src/core/plugin-loader.mjs` | 210 |
| Context assembly | `src/core/plugin-context.mjs` | 206 |
| REST | `src/server/routes/plugins.mjs` (mounted at `src/server/rest.mjs:245`) | 517 |
| CLI | `src/cli/plugin/{index,install,remove,list,search,create}.mjs` | ~640 |
| Dashboard | `frontend/src/pages/PluginsPage.tsx`, `frontend/src/api/plugins.ts` | 1331 + 167 |
| Manifest schema | `metadata.plugin.schema.json` | — |
| Bundled plugins | `.agent/plugins/{code-quality,git-sentinel,meta-harness,system-monitor}/` (git-tracked) | — |

## 2. Fabricated data (the user's explicit complaint)

`src/server/routes/plugins.mjs:36-121` hardcodes a `CURATED_CATALOG` with invented social proof:

| id | rating | reviewCount | installCount | verified |
|---|---|---|---|---|
| scientific-frontiers | 4.9 | 142 | "3.2k" | true |
| meta-harness | 4.8 | 98 | "2.4k" | true |
| code-quality | 5.0 | 310 | "8.2k" | true |
| system-monitor | 4.9 | 56 | "1.5k" | true |
| git-sentinel | 4.8 | 73 | "2.1k" | true |
| chrome-devtools | 4.7 | 84 | "1.8k" | true |

None of these numbers come from anywhere. There is no telemetry, no review store, no install counter. Additionally:

- `GET /api/plugins` (`plugins.mjs:139-151`) invents a fallback of **rating 4.8, 12 reviews, "1.0k" installs** for any plugin not in the catalog — including one the user just scaffolded locally.
- A user's own rating increments the fake `reviewCount` by one (`plugins.mjs:151`), so the UI "confirms" the fabricated total.
- `src/cli/plugin/search.mjs:32` prints `★ 4.9 (142 reviews) | Installs: 3.2k` and a `[Verified]` badge to terminals and to `--json` consumers (agents).
- `frontend/src/pages/PluginsPage.tsx:19-95` renders star widgets, review counts, install counts, and a "Thank you! Your rating has been recorded." toast; list sorting defaults to rating (`:105`, `:261-284`).
- The "verified" flag has no verification process behind it.

## 3. Catalog sources that do not work

Checked with `gh api` on 2026-09-22:

- `https://github.com/total-recall-plugins/chrome-devtools.git` → **404, repository does not exist.**
- `https://github.com/gregiteen/scientific-frontiers-engine.git` exists, but has **no `plugin.json` at its root** (`contents/plugin.json` → 404), so `install` fails validation after cloning.
- Remaining entries point at `./.agent/plugins/<id>`, which only resolves inside this repository's checkout. The npm package's `files` list does not include `.agent/`, so on any other install those four entries are dead links too.

Result: **0 of 6 catalog entries install on a fresh machine.**

## 4. Not P2P at all

- Distribution is "git URL or local path". There is no path by which one Total Recall node can see or fetch a plugin from another.
- The mesh already has everything a P2P transport needs: live peer listing (`getMeshPeers()` in `src/core/mesh.mjs:115`), a shared-bearer + CGNAT-source guard (`requireMeshSyncAuth` in `src/core/mesh-auth.mjs:40`), and a proven pull pattern (`pullSecretsFromLeader` in `src/core/secrets-sync.mjs:31` with `meshUrl()` range validation). None of it is used by plugins.

## 5. Declared-but-dead capabilities

- **`tasks`**: every bundled manifest declares `{"intent": "Periodic health verification…", "schedule": "0 * * * *"}`. `grep` shows `manifest.tasks` is read only by the validator (`plugin-loader.mjs:52`) and displayed in `plugin info`/UI. **Nothing ever executes them.**
- **`hooks`**: printed by `plugin info` (`src/cli/plugin/index.mjs:118`), never invoked.
- **`openwiki_hubs`, `tools`**: surfaced in the REST shape, never consumed.

## 6. Correctness and security defects

1. **Server kill via plugin runner.** `POST /api/plugins/:id/run` (`plugins.mjs:432-476`) `import()`s the plugin handler **into the brain server process**. `git-sentinel/cli.mjs` calls `process.exit(1)` outside a git repo → the whole server exits. Any plugin that exits or throws asynchronously takes down the daemon.
2. **Global `console.log` monkey-patch.** The same route replaces `console.log`/`console.error` process-wide while an `await` is pending. Concurrent requests (and every other subsystem logging meanwhile) interleave into the wrong response or lose output.
3. **Code execution under a read scope.** `/run` is gated by `config:read`, but it executes arbitrary plugin code.
4. **Caller-chosen roots.** Every route accepts `req.query.root` / `req.body.projectRoot`, so a caller can point discovery (and `/run`) at any directory on disk containing `.agent/plugins/*/plugin.json`.
5. **`const` reassignment.** `plugin-context.mjs:37-39` declares `const generatorPath` then assigns to it when the file is missing → `TypeError: Assignment to constant variable`, thrown **outside** the `try`, which aborts the whole surface compile for every plugin.
6. **Mislabelled telemetry.** `system-monitor/generator.mjs` reports "Monitored SSSS Metrics Nodes: 566" — that is the count of *all* vault nodes passed in, not `system-metrics` nodes. It appears in the compiled `CLAUDE.md` today.
7. **Path-dependent bundled plugin.** `meta-harness/cli.mjs` imports `../../../src/core/meta-harness.mjs`; any copy outside this checkout (global install, peer install) fails to load.
8. **Non-atomic install from git.** Clone → validate → `cpSync`; a crash mid-copy leaves a half-installed plugin that `discoverPlugins` reports.

## 7. Invariant violations

- **`.agent/` layout invariant** ("`.agent/` strictly contains only `skills/` and `secrets.enc`; everything else inside `skills/total-recall/`"): plugins live at `.agent/plugins/` and `~/.agent/plugins/`; ratings at `.agent/config/plugin-ratings.json`.
- **SSSS VFS-first state**: ratings are a loose JSON file written with `fs.writeFileSync` (`plugins.mjs:27-34`); install/remove leave no audit trail (no `event` envelopes).

## 8. What does work (keep)

- Manifest validation (`validatePluginManifest`) and discovery shape.
- Custom compile generators (`compile.generator`) — the System Monitor block in the compiled `CLAUDE.md` proves the path works end to end.
- SSSS category mounting (`getPluginCategories`) and `compile.watch` paths.
- `plugin create` scaffolding, README viewer, CLI dispatch (`total-recall <plugin-command>`).

## 9. Root causes

1. The catalog was built as a storefront mock-up before a distribution mechanism existed, then shipped.
2. The runner was built for convenience (in-process import) rather than isolation.
3. No test asserted that catalog entries install or that tasks execute.

## 10. Implications

- **Stability (P0 per TR prioritization):** defect 6.1 can terminate the brain server from the dashboard.
- **Trust:** fabricated ratings are surfaced to agents via `plugin search --json` and would be repeated to users as fact.
- **Security:** 6.3/6.4 let a `config:read` token execute code from an arbitrary directory.

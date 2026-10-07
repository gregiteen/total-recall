> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.

# SKILL_PROPAGATION_REPAIR — Audit

> **Project Prefix**: `SKILL_PROPAGATION_REPAIR`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Audit Status**: Complete
> **Audited commit**: `e5d9aad`

---

## Process note

The root `HANDOFF.md` recorded preliminary code findings before this audit. No skill propagation code was changed. Three unrelated source files were already modified; this project leaves them intact.
The remote quality gate later exposed A-005 and A-006. They were added to this audit and tracker when found.

## 1. Scope and method

This audit covers registration, deployment, status, discovery, and push/pull/two-way synchronization of skill packages in `src/core/skills-registry.mjs`, their CLI entry in `src/cli/skill.mjs`, the separate scaffold sync path, and their specs. I read the relevant functions and tests, inspected Git state, and prepared an isolated export of commit `e5d9aad` for the Mac mini baseline. No external repository is modified by this audit.

## 2. Inventory

| Area | Path | Size | Authored / generated | Tracked |
|---|---|---:|---|---|
| Registry and propagation | `src/core/skills-registry.mjs` | ~52 KiB | Authored | Yes |
| Registry tests | `src/core/skills-registry.spec.mjs` | ~32 KiB | Authored | Yes |
| Skill CLI | `src/cli/skill.mjs` | Authored | Authored | Yes |
| Template sync | `scaffold/.agent/skills/total-recall/scripts/sync-repo.mjs` | Authored template | Yes |

Entry points are `total-recall skill register/deploy/status/sync/push/pull` via `bin/total-recall.mjs` and `src/cli/skill.mjs:494,649`. The local `.agent/skills` tree is ignored by Git; it is user state, not the source for this code change. No binaries, backups, credentials, or personal data were identified in the touched tracked paths.

## 3. Runtime surface

| Command | Caller | Implementation | Notes |
|---|---|---|---|
| `skill deploy` | Local CLI user | `src/cli/skill.mjs:494`, `src/core/skills-registry.mjs:366` | Copies a registered package to a repo. |
| `skill status` | Local CLI user | `src/core/skills-registry.mjs:481` | Compares saved and live hashes. |
| `skill sync/push/pull` | Local CLI user | `src/cli/skill.mjs:649`, `src/core/skills-registry.mjs:1165` | Selects a winner and copies to known locations. |

No scheduled job is changed. `TR_SYNC_REPOS` and `TR_SKILL_SYNC_REPOS` add candidate roots in `src/core/skills-registry.mjs:690`; paths come from flags, registry, environment, or cwd. This project introduces no new environment variable.

## 4. Data and state

| State | Location | Format | Writer | Personal data | Propagated |
|---|---|---|---|---|---|
| Skill catalog and install map | Brain `skills-registry/index.yaml` | YAML registry | `saveRegistry()` | Local paths possible | No |
| Skill packages | Repo `.agent/skills/<id>/` | Files | `replaceSkillDir()` | User content possible | Yes, by explicit command |

The registry is existing application state. This repair changes hash and copy logic, not the persistence route or format.

## 5. Integrations

N/A. The affected path uses local filesystem and CLI operations. No provider or credential is required.

## 6. Security and privacy

CLI invocation is the authorization boundary. `deploySkill()` rejects a repo-owned source sent to another repo (`src/core/skills-registry.mjs:377-396`). `isRepoScopedSkill()` checks catalog, tracked installs, and discovered copies before sync (`:637-680`). `replaceSkillDir()` stages a copy, rejects destination symlinks, and rolls back failed replacement (`:1012-1084`). Package content may contain user-authored files, so winner selection and removal of destination-only files need explicit regression coverage. Cookie, token, and network handling are N/A.

## 7. Standing-rule conflicts

| Rule | Conflict | Evidence | Finding |
|---|---|---|---|
| Repo-owned skills must not cross repositories | Direct deploy checks source ownership, but a global catalog collision with an existing local same-name skill can replace its entrypoint | `skills-registry.mjs:377-410` | A-003 |
| Packages must propagate complete support files | Only `SKILL.md` is hashed and timed | `skills-registry.mjs:93-98,999-1008` | A-001 |

## 8. Quality baseline

- Host: Mac mini, isolated `git archive` of `e5d9aad` at `/tmp/tr-skill-baseline-e5d9aad`.
- First `npm test` attempt: exit 127, Vitest unavailable because the existing Mac mini checkout did not provide usable `node_modules`. `npm ci` in the isolated export succeeded.
- Valid baseline `npm test`: exit 1; 360/361 test files and 2,207/2,209 tests passed in 169.14 seconds. The two failures are `src/cli/plugin/plugin.spec.mjs` cases `filters bundled plugins by use case` and `searches bundled plugins and mesh peers together`. The assertions expected only `system-monitor` and no bundled search hits, respectively, while this commit includes `dsh` and `creative-search`. They predate this repair and are outside skill propagation. The registry spec passed.
- The first full quality gate on the isolated archive reported two setup limits and one additional source finding: the archive omitted the ignored dashboard bundle, and `scripts/launch-active-workers.mjs` contained three forbidden personal or third-party repository references. The script is a one-off worker launcher with no references elsewhere in `scripts/`, `src/`, or `package.json` (`rg` search, 2026-09-30). Its removal is tracked as A-005.
- Lint/type: no backend ESLint or TypeScript gate in this repository. The sanctioned remote gate includes the full Vitest suite.
- Coverage gaps: current tests cover entrypoint drift, package replacement rollback, repository scoping, and layered `core/` drift; no test covers support-file-only drift or a global-source collision with a local same-name skill.

## 9. Debt and dead code

`hashSkillLayer()` already walks its full subtree (`skills-registry.mjs:101-132`), while the legacy package hash only reads one file. `sync-repo.mjs` copies scaffold packages by file (`:176-199`); it is a separate template path. No dead code is claimed in this audit.

## 10. Deploy and operations

Registry logic ships in the npm package. Actual skill synchronization is a local, explicit operation. A mistaken winner can overwrite user skill instructions or scripts across registered repositories. Existing staged replacement supports rollback before commit of an individual copy; a multi-repo sync has no transaction across all repos. The repair must be verified in isolated repositories before any real skill install is changed.

## 11. Content and product fit

The user reported a downstream validator finding 33 errors and two warnings in legacy skill copies. The downstream checkout was repaired separately and passed its validator. This audit does not assume that validator defines Total Recall's schema. The product outcome is trustworthy propagation of entire packages while preserving repository ownership.

## 12. Findings register

| ID | Severity | Finding | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| A-001 | P1-high | Legacy hash and mtime ignore support files. | `skills-registry.mjs:93-98,999-1008` | Changed scripts or references can remain stale and status can report clean. | Hash and time package files. | Fix in this project |
| A-002 | P1-high | Equal entrypoint hashes short-circuit sync; preserved destination-only files can remain stale. | `skills-registry.mjs:1190-1218,1012-1057` | Missing or removed support files are not reconciled. | Define safe package-copy semantics and test both directions. | Fix in this project |
| A-003 | P1-high | A globally registered package may replace an existing local same-name skill. | `skills-registry.mjs:377-410` | Repo instructions can be overwritten by deploy. | Reject unadopted collisions; preserve layered adoption. | Fix in this project |
| A-004 | P2-medium | Template sync is a separate package path. | `sync-repo.mjs:176-199` | Its behavior must be verified independently. | Run its existing focused test and keep scope separate unless reproduced. | Verify in this project |
| A-005 | P1-high | An unused one-off worker launcher hardcodes personal repository paths, named integrations, and a model. | `scripts/launch-active-workers.mjs:12-22`, remote open-source gate | Shipped core violates the open-source path rule. | Remove the unreferenced launcher. | Fix in this project |
| A-006 | P1-high | Plugin CLI tests assert a fixed bundled-plugin list that predates `dsh` and `creative-search`. | `src/cli/plugin/plugin.spec.mjs:63-81`, baseline test output, current bundled manifests | Full gate fails despite correct use-case filtering. | Assert filter behavior and representative known results without fixing the total catalog size. | Fix in this project |

## 13. Impact on the requested change

| Change | Shaped by | Findings |
|---|---|---|
| Complete, safe skill propagation | Whole-package drift and collision ambiguity | A-001 to A-003 |
| Scope of template changes | Separate scaffold mechanism | A-004 |
| Full quality gate | Existing hardcoded-path violation | A-005 |
| Full test suite | Stale plugin catalog expectations | A-006 |

## 14. Decisions

No owner-only decision currently blocks isolated regression and repair. The recommended default is to preserve existing repository-owned skills and require explicit adoption when identities collide.

## Completion checklist

- [x] Sections 1–14 populated, with N/A explained
- [x] Valid Mac mini baseline recorded
- [x] Every finding has severity and disposition
- [x] Audit marked Complete

## Continuation finding A-007 — global skill misclassified through home install ownership

September 30, 2026: the shared PM source was explicitly registered globally with `repo_scoped:false`, and no discovered same-name copy had a scoped flag. Nevertheless `skill push project-management --global --skip-discover --dry-run` returned `repo_scoped`. Read-only API diagnostic found the source path also recorded as a home-root install. `repoForSkillPath()` treats that install-map root as a repository owner; divergent generic repo installs consequently trigger the repository-owned fallback in `isRepoScopedSkill()`. Direct deploy also refuses that global source as repo-owned. This blocks the authorized generic update and is distinct from protecting real repo-owned overlays.

| ID | Severity | Finding | Evidence | Impact | Recommendation | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| A-007 | P1-high | Canonical global skills can acquire a false home repository owner from the install map | `repoForSkillPath`, `isRepoScopedSkill`; CLI dry-run and safe diagnostic | Shared PM propagation is skipped despite generic source/copies | Recognize actual configured global skill roots before home install metadata, preserve true project ownership, add isolated regressions | Fix now before real propagation |

Pre-edit core baseline is the verified Mac mini working-tree 362-file /2,228-test run (exit0). Add a failing isolated regression before the narrow ownership repair, then verify the full changed tree. No scope exception permits a foreign local skill overwrite.

---
type: project_document
title: TR_CORE_FOCUS — Development Plan
tags: ["project-management", "TR_CORE_FOCUS"]
timestamp: 2026-07-10T20:00:00Z
---

# TR_CORE_FOCUS — Development Plan

## Status snapshot (2026-07-10)

| Phase | Name | Status |
|-------|------|--------|
| 0 | Freeze scope / docs | ✅ Done (superseded by comprehensive refresh) |
| 1 | Nested skills → modules | ✅ Done |
| 2 | Openwiki ships with TR | ✅ Done |
| 2b | Modules jettison to operational minimum | ✅ Done |
| 3 | Skills registry + deploy | ✅ Landed 2026-07-10 |
| 4 | Secrets & usage | ✅ Landed 2026-07-10 |
| 5 | Memory loop: dream REM + open daemon tasks | ✅ Core path landed 2026-07-10 |
| 6 | Slim runtime + README | ✅ Landed 2026-07-10 |
| 7 | Verify / testing | ✅ Automated + smoke 2026-07-10 (commit remaining) |

> Phase numbers reordered for product truth: **memory loop (dream + open tasks) is core**, not a demotion footnote under “slim runtime.” Skills registry and secrets remain sequential product pillars; memory-loop work may interleave when touching `daemon-loop` / `dream`.

---

## ✅ Phase 0 — Freeze scope

- [x] Write PRD + architecture + tracker
- [x] Product thesis: portable memory + instructions + openwiki + skills + secrets
- [x] Comprehensive refresh: dream core + open agent tasks (this revision)

## ✅ Phase 1 — Nested skills → modules

- [x] Move nested `tr-*` out of agent-skill semantics
- [x] Sole advertised skill: root `total-recall/SKILL.md`
- [x] init no longer symlinks nested packages as IDE skills
- [x] Update skill.spec / runtime agents path

## ✅ Phase 2 — Openwiki ships with TR

- [x] Default openwiki templates in package/scaffold
- [x] `init` ensures openwiki (global + project)
- [x] Document wiki vs vault in skill/master docs (operational)

## ✅ Phase 2b — Operational minimum modules

- [x] Remove research module bulk and ssss docs dump from modules
- [x] Keep only `skill-deploy/scripts/*` + `agents/agents.yml`
- [x] API/docs point at `references/ssss-reference.md` + `@ssss/cli`

---

## ✅ Phase 3 — Skills registry + deploy — landed 2026-07-10

- [x] Global skills registry: `skills-registry/index.yaml` (`src/core/skills-registry.mjs`)
- [x] CLI: `register|registry|deploy|status|sync-registry|unregister` (+ list/install)
- [x] Deploy into `<repo>/.agent/skills/<id>/`
- [x] Optional `--adapt` (package.json stack + openwiki page names)
- [x] Cross-repo install map + drift via `skill status`
- [x] Install path auto-registers into catalog when SKILL.md discovered

## ✅ Phase 4 — Secrets & usage — landed 2026-07-10

- [x] Secrets store: list metadata without values; optional AES (`TR_SECRETS_PASSWORD`)
- [x] CLI: `secret set|get|list|rotate|delete|audit|usage|check-surfaces`
- [x] Usage JSONL + budget.yml daily/weekly cap report
- [x] Conformance: leak detection for surfaces/openwiki

---

## ✅ Phase 5 — Memory loop (dream + open daemon tasks) — landed 2026-07-10

### 5A — Dream completeness

- [x] Real REM candidates from sessions / memory-inbox
- [x] Conflict → quarantine path exercised in tests
- [x] Promote path uses writeNode + compile (deep sleep)
- [x] Dream as system task on empty-queue cadence
- [x] Phases 0/1/3/5 deterministic without LLM; 4 optional

### 5B — Open task envelope

- [x] Task envelope schema + CLI `task add|list|show|cancel|executors`
- [x] Executor registry; daemon-loop v3 dispatches via registry
- [x] System executors: dream, session-ingest, surface-compile, prune, custom
- [x] Research via research-queue adapter / legacy executor
- [x] Capability policy (shell/net-post denied)
- [x] Fail loud on unknown executor
- [x] Idle fill OFF unless `TR_IDLE_TASKS=1`
- [x] Portfolio / system2 / self-diagnosis demoted

### 5C — Agent ergonomics

- [x] Documented in `total-recall` SKILL.md §4b + HANDOFF
- [ ] REST `POST/GET /api/tasks` (optional follow-up)
- [x] Origin/audit fields on envelope

---

## ✅ Phase 6 — Slim runtime + README — landed 2026-07-10

- [x] CLI inventory: `docs/reference/CLI_INVENTORY.md`
- [x] README: portable memory product + memory loop
- [x] Default story without LLM / research autopilot
- [x] Root fix/patch scripts classified as non-surface (delete/move follow-up)
- [x] HANDOFF + CLI help aligned

---

## ✅ Phase 7 — Testing & verification — 2026-07-10

- [x] Clean-machine smoke: ensureFullProjectBrain + remember + compile + dream (no LLM)
- [x] Secrets isolation tests + check-surfaces smoke
- [x] Dream REM / task envelope / unknown executor / scheduler tests
- [x] Skills registry track/deploy/sync tests
- [x] **76 vitest green** across TR_CORE_FOCUS suites
- [x] Custom task dispatch → inbox draft E2E
- [ ] Operator: commit/push; optional daemon soak; init --yes non-interactive fix

---

## Execution complete for implementation phases 1–7

Remaining operator work: commit large branch; optional hygiene (`fix-*.mjs`); optional init hang fix.

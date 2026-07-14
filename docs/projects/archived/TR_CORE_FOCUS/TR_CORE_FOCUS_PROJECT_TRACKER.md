> **⚠️ ARCHIVED — SUPERSEDED by TR_STABILIZATION project (2026-07-13)**
> All remaining work from this project has been consolidated into `docs/projects/in-progress/TR_STABILIZATION/`.
> This project tracker is preserved for historical reference only. Do not modify.

---
type: project_document
title: TR_CORE_FOCUS — Project Tracker
tags: ["project-management", "TR_CORE_FOCUS"]
timestamp: 2026-07-10T23:35:00Z
---

# TR_CORE_FOCUS — Project Tracker

> **Project Prefix**: `TR_CORE_FOCUS`  
> **Kanban State**: 🏗️ In Progress (verify complete; ship/commit remaining)  
> **Date**: 2026-07-10  

## Goal

Portable personal memory for any IDE — write → dream → read → open tasks; openwiki; skill deploy; secrets. Open source: no host-product repo special-casing.

## Phase status overview

- [x] Phase 0 — PRD / architecture / plan
- [x] Phase 1 — Nested skills → modules
- [x] Phase 2 — Openwiki ships with TR
- [x] Phase 2b — Modules jettison (operational minimum)
- [x] Phase 0/docs refresh
- [x] Phase 3 — Skills registry + deploy + any-repo sync
- [x] Phase 4 — Secrets & usage
- [x] Phase 5 — Memory loop (dream + open tasks)
- [x] Phase 6 — Slim runtime + README
- [x] Phase 7 — Testing & verification

---

## ✅ Phase 7 — Testing & verification (2026-07-10)

### Automated (vitest)

- [x] `task-envelope.spec.mjs` — envelope + fail-loud unknown executor + custom draft
- [x] `dream-rem.spec.mjs` / `dream.spec.mjs` — REM candidates + promote/conflict
- [x] `scheduler.spec.mjs` — idle-off default + TR_IDLE_TASKS
- [x] `skills-registry.spec.mjs` / `skill.spec.mjs` — registry, track, sync, deploy
- [x] `project-brain.spec.mjs` — full project brain any path
- [x] `secrets-store.spec.mjs` — set/list/rotate/leak/usage
- [x] `remote-vault-sync.spec.mjs` — generic remote vault
- [x] **76/76** tests passed across 9 suites (2026-07-10)

### Clean-machine / smoke (temp HOME + project)

- [x] Full project brain via `ensureFullProjectBrain` (openwiki + vault present)
- [x] `remember fact` → node written project vault
- [x] `compile` → processed nodes, post-build verification
- [x] `dream` → success without LLM (REM 0 candidates OK on empty inbox)
- [x] `secret set|list|check-surfaces`
- [x] `task add|list` (open envelope)
- [x] `skill track` any path
- [x] Custom task `dispatchTask` → inbox draft (programmatic E2E)

### Known gaps (non-blocking)

- [ ] `npx total-recall init --project --yes` can hang (interactive wizard paths) — use `brain ensure` / ensureFullProjectBrain for non-interactive bootstrap
- [ ] `recall` may return empty without embeddings/API keys on bare install (TF-IDF/index warm-up); write path + compile still OK
- [ ] REST `/api/tasks` not required for Phase 7 CLI path
- [ ] Root `fix-*.mjs` / `patch-*.mjs` hygiene still open
- [ ] Large uncommitted branch not yet pushed

### UI / onboarding (2026-07-10)

- [x] Dashboard rebrand: Sovereign → portable memory (Login, Help, Graph, Skills, Settings, Usage, Files, Graph3D, index/manifest)
- [x] `/onboarding` wizard (write → dream → connect → secrets) + nav link
- [x] First-login redirect to `/onboarding` until complete (local flag; vault profile / ≥5 nodes soft-complete)
- [x] `templates/onboarding-interview.md` + chat system prompt + empty-vault suggestions → portable memory
- [x] `frontend/dist` rebuilt (server serves static SPA)

### Manual remaining (operator)

- [ ] Commit + push when ready
- [ ] Restart dashboard server process to pick up `api.mjs` prompt changes
- [ ] Hard-refresh browser (or clear service worker) to load new `dist`
- [ ] Optional: full `daemon start` soak with pending task

## Verification log

- **2026-07-10** — Phases 1–6 implementation.
- **2026-07-10** — Phase 7: 76 vitest green; clean-machine smoke; custom task dispatch E2E.
- **2026-07-10** — UI rebrand + onboarding route/redirect + interview template; vite build green.

## Definition of done (product)

| Criterion | Status |
|-----------|--------|
| Portable memory loop documented | ✅ |
| Dream core | ✅ |
| Open agent tasks | ✅ |
| Skills any-repo | ✅ |
| Secrets separate from vault | ✅ |
| No host-product repo hardcoding in src/frontend | ✅ |
| README core story | ✅ |
| Automated tests for core paths | ✅ |

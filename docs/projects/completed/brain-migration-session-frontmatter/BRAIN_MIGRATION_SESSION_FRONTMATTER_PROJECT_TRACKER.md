# Brain Migration + Session SSSS Frontmatter — Project Tracker

> **Epic**: Brain Migration + Session SSSS Frontmatter
> **Status**: ⏳ In Progress
> **Start Date**: 2026-05-25
> **Priority**: P0-critical (Data Safety & VFS Integrity)
> **Owner**: gregiteen

---

## ✅ Phase 1: Data Migration (Global → Project Brain)

- [x] Delete all old sessions from global brain (`~/.agent/skills/total-recall/sessions/`)
- [x] Move 7 `research-project-*.md` fact nodes from global → project `memory-vault/facts/`
- [x] Move `research-queue.jsonl` from global → project brain
- [x] Copy `never-implement-no-backup-flag.md` from project → global brain
- [x] Copy `proactively-flag-gaps.md` from project → global brain
- [x] Copy `always-use-project-management-skill.md` from project → global brain
- [x] Copy `always-use-and-announce-skills.md` from project → global brain

---

## ✅ Phase 2: Session SSSS Frontmatter

- [x] Define SSSS session schema (frontmatter fields: type, slug, title, source, date, project, category, schema_version)
- [x] Update `relay.mjs` `shipFile()` to detect project name from path
- [x] Update `sessions.mjs` `/api/sessions/ingest` to write `.md` with SSSS frontmatter instead of raw `.jsonl`
- [x] Generate slug from `date-source-title-hash`
- [x] Store sessions in `brainDir/sessions/` as `.md` files
- [x] Update frontend session list to read title/date from frontmatter (Sessions tab in MemoryPage)

---

## ✅ Phase 3: Clean Up Stale `.agent/` Root

- [x] Remove `.agent/memory-vault/`
- [x] Remove `.agent/config/`
- [x] Remove `.agent/sessions/`
- [x] Remove `.agent/memory-derived/`
- [x] Remove `.agent/memory-inbox/`
- [x] Remove `.agent/scheduler/`
- [x] Remove `.agent/secrets.enc`
- [x] Remove `.agent/logs/`

---

## ✅ Phase 4: Testing & Verification

- [x] Run full test suite — all tests pass
- [x] Verify global brain has only identity nodes
- [x] Verify project brain has research facts + research queue
- [x] Ship a test session via relay — verify SSSS frontmatter
- [x] Verify session appears in UI with proper title and date
- [x] Run Obsidian backup — verify project brain syncs
- [x] Run GitHub backup — verify global brain pushes


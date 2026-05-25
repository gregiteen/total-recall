# Brain Migration + Session SSSS Frontmatter — PRD

> **Status**: ⏳ In Progress
> **Priority**: P0-critical (Data Safety & VFS Integrity)
> **Start Date**: 2026-05-25
> **Owner**: gregiteen

---

## Problem Statement

Two critical issues are degrading the Total Recall memory system:

### 1. Layered Brain Data Misplacement

The Layered Brain Architecture (May 24) introduced global vs project brain separation but never migrated existing data. As a result, all 971 sessions, 7 research fact nodes, and the research queue are sitting in the global brain (`~/.agent/skills/total-recall/`) when they belong in the project brain (`~/Github/total-recall/.agent/skills/total-recall/`).

The global brain should only contain universal identity data (invariants, preferences, corrections, lore). Currently it's polluted with project-specific content.

### 2. Sessions Lack SSSS Frontmatter

Sessions are stored as opaque JSONL files with hash-based filenames (e.g. `006a0e588676.jsonl`). They have:

- No SSSS frontmatter (no type, slug, title, category, date)
- No meaningful filenames (just random hex hashes)
- No dates visible without parsing the JSONL content
- No project association metadata
- No way to search, filter, or display them meaningfully in the UI

Sessions should be first-class SSSS citizens with proper frontmatter, dates, meaningful filenames, and UI presence.

## Goals

1. **Clean separation**: Global brain = identity only. Project brain = project-specific knowledge, sessions, research.
2. **SSSS-compliant sessions**: Every session file has proper YAML frontmatter with type, slug, title, source, date, project, category, schema_version.
3. **Meaningful filenames**: `2026-05-25-antigravity-total-recall-refactor.md` not `006a0e588676.jsonl`.
4. **UI readability**: Session list displays title and date from frontmatter, not hash filenames.
5. **Clean `.agent/` root**: Remove stale directories that shouldn't exist at the `.agent/` level.

## Non-Goals

- Migrating or converting old sessions (user confirmed: delete them)
- Changing the relay daemon's per-project routing (known limitation, separate epic)
- Dream Cycle session distillation changes

## Success Criteria

- [ ] Global brain contains ONLY identity nodes (invariants, preferences, corrections, lore, universal concepts)
- [ ] Project brain contains project-specific facts, research queue, and sessions
- [ ] New sessions are saved as `.md` files with SSSS frontmatter
- [ ] Session filenames include date, source, and descriptive slug
- [ ] Frontend session list shows title and date from frontmatter
- [ ] No stale data directories at `.agent/` root level
- [ ] All tests pass
- [ ] Obsidian and GitHub backups work correctly after migration

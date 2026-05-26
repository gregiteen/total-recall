# Brain Migration + Session SSSS Frontmatter — Development Plan

> **Status**: In Progress
> **Priority**: P0-critical (Data Safety & VFS Integrity)
> **Start Date**: 2026-05-25

---

## Goal

Fix the broken brain data layout (all project data sitting in global brain) and make sessions first-class SSSS citizens with proper frontmatter, dates, and meaningful filenames.

## Why This Matters for the OS

1. **Data integrity**: Project-specific knowledge is polluting the global identity brain, breaking the layered architecture.
2. **Session usability**: Sessions stored as opaque JSONL hashes are unsearchable, unnamed, and undated — useless for memory recall.
3. **Backup correctness**: The global brain backs up to GitHub but contains project data that doesn't belong there.

---

## Phase 1: Data Migration (Global → Project Brain)

### Problem
The layered brain architecture (May 24) never migrated existing data. All 971 sessions, 7 research facts, and the research queue are in the global brain (`~/.agent/skills/total-recall/`) when they belong in the project brain (`~/Github/total-recall/.agent/skills/total-recall/`).

### Actions
1. **Delete** all old sessions from global brain (user confirmed they don't want them)
2. **Move** 7 `research-project-*.md` fact nodes from global → project `memory-vault/facts/`
3. **Move** `research-queue.jsonl` from global → project brain
4. **Copy** `never-implement-no-backup-flag.md` and `proactively-flag-gaps.md` from project → global (universal rules that should apply everywhere)
5. **Clean up** stale directories at `.agent/` root: `memory-vault/`, `config/`, `sessions/`, `memory-derived/`, `memory-inbox/`, `scheduler/`, `secrets.enc`, `logs/`

### What Stays in Global
- `operating-instructions.md` — core operating protocol
- `cli-help-reference.md` — CLI reference
- `skill-research-project.md` — concept about research
- `topic-research-sop.md` — research SOP preference
- The 2 copied universal nodes above

---

## Phase 2: Session SSSS Frontmatter

### Problem
Sessions are stored as raw JSONL files with hash-based filenames (e.g. `006a0e588676.jsonl`). No metadata, no dates, no titles, no SSSS schema compliance.

### Target Format

Sessions will be stored as `.md` files with SSSS YAML frontmatter and the conversation content in the body:

```yaml
---
type: session
slug: "2026-05-25-antigravity-total-recall-refactor"
title: "Backup refactor and path regression fixes"
source: antigravity
date: 2026-05-25T12:05:00Z
project: total-recall
category: sessions
schema_version: 2
---

# Session: Backup refactor and path regression fixes

**Source**: Antigravity | **Date**: 2026-05-25 | **Project**: total-recall

## Conversation

<raw JSONL content or structured summary>
```

### Filenames

Change from hash IDs to date-prefixed meaningful names:
```
2026-05-25-antigravity-total-recall-refactor.md
2026-05-25-claude-code-backup-fix.md
```

### Title Generation

Use the first user message as the initial title. The Dream Cycle can refine it later.

### Files to Modify

#### `src/cli/relay.mjs`
- Update `shipFile()` to extract a title from the first user message
- Generate SSSS-compliant frontmatter before shipping

#### `src/server/rest.mjs` — `/api/sessions/ingest`
- When receiving a session, write it as `.md` with SSSS frontmatter instead of raw `.jsonl`
- Generate slug from `date-source-title`
- Store in `brainDir/sessions/`

#### Frontend — Session list UI
- Read `title` and `date` from frontmatter for display
- Show meaningful names instead of hash filenames

---

## Phase 3: Clean Up Stale `.agent/` Root

Remove leftover directories at `.agent/` root that were created by regressions:
- `.agent/memory-vault/`
- `.agent/config/`
- `.agent/sessions/`
- `.agent/memory-derived/`
- `.agent/memory-inbox/`
- `.agent/scheduler/`
- `.agent/secrets.enc`
- `.agent/logs/`

---

## Phase 4: Testing & Verification

1. Run full test suite (`npm test`) — all 316 tests pass
2. Verify global brain has only identity nodes
3. Verify project brain has research facts + research queue
4. Ship a test session via relay and verify it has SSSS frontmatter
5. Verify session appears in UI with proper title and date
6. Run Obsidian backup — verify project brain syncs correctly
7. Run GitHub backup — verify global brain pushes correctly

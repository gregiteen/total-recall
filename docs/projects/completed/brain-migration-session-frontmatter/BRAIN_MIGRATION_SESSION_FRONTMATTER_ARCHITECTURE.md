# Brain Migration + Session SSSS Frontmatter — Architecture

> **Status**: ⏳ In Progress
> **Priority**: P0-critical
> **Start Date**: 2026-05-25

---

## System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                        IDE (Antigravity, Claude, Codex, etc.)    │
│                              ↓ raw session JSONL                 │
│                        ┌─────────────┐                           │
│                        │ relay.mjs   │                           │
│                        └──────┬──────┘                           │
│                               ↓ POST /api/sessions/ingest       │
│                        ┌─────────────┐                           │
│                        │ rest.mjs    │ ← adds SSSS frontmatter  │
│                        └──────┬──────┘                           │
│                               ↓                                  │
│              ┌────────────────┴────────────────┐                 │
│              ↓                                 ↓                 │
│     Global Brain                        Project Brain            │
│  ~/.agent/skills/total-recall/    <cwd>/.agent/skills/total-recall/│
│  ├── memory-vault/                ├── memory-vault/              │
│  │   ├── invariants/  ← ONLY     │   ├── facts/                 │
│  │   ├── preferences/   THESE    │   ├── concepts/              │
│  │   └── corrections/            │   ├── patterns/              │
│  ├── config/                      │   ├── decisions/             │
│  └── sessions/ (empty)            │   └── invariants/ (project)  │
│                                   ├── sessions/  ← ALL HERE     │
│                                   │   ├── 2026-05-25-antigrav... │
│                                   │   └── 2026-05-25-claude-c... │
│                                   ├── research-queue.jsonl       │
│                                   └── config/                    │
└──────────────────────────────────────────────────────────────────┘
```

## Session File Format (SSSS-Compliant)

### Before (broken)

```
sessions/006a0e588676.jsonl
```
```json
{"id":"9526a693","parentId":null,"type":"observation","ts":"2026-05-25T17:15:24.286Z","content":"...","role":"assistant","source":"antigravity"}
{"id":"a1b2c3d4","parentId":"9526a693","type":"task","ts":"2026-05-25T17:15:30.000Z","content":"fix the backup","role":"user","source":"antigravity"}
```

### After (SSSS-compliant)

```
sessions/2026-05-25-antigravity-backup-refactor.md
```
```markdown
---
type: session
slug: 2026-05-25-antigravity-backup-refactor
title: "Backup refactor and path regression fixes"
source: antigravity
date: 2026-05-25T17:15:24Z
project: total-recall
category: sessions
schema_version: 2
message_count: 47
---

{"id":"9526a693","parentId":null,"type":"observation","ts":"2026-05-25T17:15:24.286Z","content":"...","role":"assistant","source":"antigravity"}
{"id":"a1b2c3d4","parentId":"9526a693","type":"task","ts":"2026-05-25T17:15:30.000Z","content":"fix the backup","role":"user","source":"antigravity"}
```

The body remains raw JSONL for machine readability. The SSSS frontmatter enables search, display, and classification.

## Data Flow Changes

### Ingest Path (Modified)

1. **Relay** ships raw JSONL to `POST /api/sessions/ingest` (unchanged)
2. **REST endpoint** receives raw JSONL and:
   - Parses first user message for title
   - Extracts source IDE and date from first entry
   - Detects project from CWD or relay metadata
   - Generates slug: `{date}-{source}-{title-kebab}`
   - Writes `.md` file with SSSS frontmatter + JSONL body
3. **Session stored** in `brainDir/sessions/` as `.md`

### Frontend Display (Modified)

1. Session list reads `.md` files from `/api/sessions`
2. Parses YAML frontmatter for title, date, source
3. Displays title and formatted date instead of hash filename
4. Sort by date descending

## Files Modified

| File | Change |
|---|---|
| `src/server/rest.mjs` | Session ingest: add SSSS frontmatter, `.md` format, slug-based filename |
| `src/cli/relay.mjs` | Pass source metadata in ingest request |
| `frontend/src/pages/MemoryPage.tsx` | Read frontmatter for session display |
| `src/server/rest.mjs` | Session list API: parse frontmatter for title/date |

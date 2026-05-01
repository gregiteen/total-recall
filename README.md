# Total Recall

> **Local-only, Markdown-first cognitive memory system for AI coding agents.**

A four-layer cognitive architecture that remembers everything, recalls instantly, and evolves agent behavior from accumulated experience. No vector databases, no cloud APIs, no proprietary lock-in. Just Node.js, SQLite, and Markdown.

## Why

AI coding agents forget everything between sessions. They repeat mistakes, ignore user preferences, and behave like they woke up 30 seconds ago — despite having thousands of learnings stored in logs.

**Root cause:** Data goes in but never comes back out at the right time.

Total Recall fixes this with a layered memory architecture that:
- **Stores** every session as an immutable episode (Layer 1)
- **Indexes** all memory for sub-50ms full-text search (Layer 2)
- **Structures** knowledge as a linked Zettelkasten wiki (Layer 3)
- **Shapes** agent behavior through an auto-compiled personality surface (Layer 4)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│            LAYER 4: BEHAVIORAL SURFACE                  │
│         (system prompt — always in context)              │
│   Auto-compiled rules + attitude + triggers              │
│   Analogy: instinct / Core Memory                        │
├─────────────────────────────────────────────────────────┤
│            LAYER 3: KNOWLEDGE GRAPH                     │
│         (.agent/memory-wiki/ — Zettelkasten)            │
│   Atomic notes with backlinks, provenance, confidence    │
│   Analogy: semantic memory / Archival Memory             │
├─────────────────────────────────────────────────────────┤
│            LAYER 2: SEARCH INDEX                        │
│         (SQLite FTS5 — disposable, rebuilt)              │
│   Full-text search across all tiers in <50ms             │
│   Analogy: associative recall / Recall Memory            │
├─────────────────────────────────────────────────────────┤
│            LAYER 1: EPISODE ARCHIVE                     │
│         (append-only .md files)                          │
│   Raw session logs — nothing ever deleted                │
│   Analogy: episodic memory / Conversation History        │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install
npm install -g total-recall

# Initialize in your repo
cd ~/my-project
total-recall init

# Steer agent behavior (takes effect immediately)
total-recall steer --type never "Never use templates"
total-recall steer --type always "Always do deep research before planning"
total-recall steer --type correct "GPT Image 2 is SOTA, not DALL-E"

# Search all memory
total-recall search "branding architecture"
total-recall search "user preferences" --source wiki

# Explore knowledge graph
total-recall graph "no-templates" --depth 2

# Compile behavioral surface into system prompt
total-recall compile-surface

# Maintenance
total-recall reindex        # Rebuild FTS5 from filesystem
total-recall lint           # Wiki integrity check
total-recall dream          # Consolidation cycle
total-recall stats          # Memory system health
```

## Design Principles

| Principle | Implementation |
|---|---|
| **Markdown is truth** | Every memory is a `.md` file. SQLite is a disposable index. |
| **Zero dependencies** | Node.js + SQLite + Markdown. No cloud APIs, no vector DBs. |
| **No data destruction** | Raw data always remains. Curation, not compression. |
| **Emotion is signal** | Both praise and frustration are the strongest importance indicators. |
| **Provenance everywhere** | Every rule traces back to a wiki node → episode → user's exact words. |
| **Universal portability** | Works with any IDE. Git-versionable. `.md` files are the brain. |

## Configuration

Drop a `totalrecall.config.mjs` in your repo root:

```javascript
export default {
  dataDir: '.agent',                    // Where memory lives
  systemPromptFile: 'INSTRUCTIONS.md',  // System prompt to inject into
  ranking: {
    halfLife: {
      preference: 90,    // Days — user tastes are durable
      'anti-pattern': 60,
      pattern: 30,
      project: 14,       // Context ages fastest
    },
    surfaceCap: 30,      // Max rules in behavioral surface
    hotSlots: 5,         // Reserved for real-time steering
  },
};
```

## How It Works

### Signal Scoring

Wiki nodes are ranked by:
```
signal_score = intensity × (access_count + 1)^0.5 × max(0.1, 0.5^(days / half_life))
```

This means:
- High-intensity experiences (user anger or praise) rank highest
- Frequently accessed knowledge stays load-bearing
- Old, unaccessed knowledge decays but never disappears
- Different knowledge types decay at different rates

### Behavioral Steering

When a user says "NEVER do X", run:
```bash
total-recall steer --type never "Never do X"
```

This atomically:
1. Appends to `USER.md` (permanent record)
2. Creates a wiki node in `anti-patterns/` (knowledge graph)
3. Hot-patches `INSTRUCTIONS.md` (system prompt — immediate effect)
4. Updates the FTS5 search index

The behavior change takes effect **within the same session**.

### Wiki Node Format

```markdown
---
type: anti-pattern
confidence: high
sentiment: negative
sentiment_intensity: 9
last_verified: 2026-05-01
provenance:
  - "episode:2026-05-01/session-c4cd19a3"
related:
  - "[[zero-shot-generation]]"
---

# No Templates

> [!CAUTION]
> All generation must be zero-shot, dynamically created by AI.

## Evidence
> "NOTHING IS TEMPLATED ANYMORE"
> — User, 2026-05-01 (🔴 intensity: 9)
```

## IDE Support

Total Recall works with any IDE that reads a system prompt file:

| IDE | Watcher | System Prompt |
|---|---|---|
| Antigravity (VS Code) | `overview.txt` | `INSTRUCTIONS.md` → `AGENTS.md` |
| Claude Code | `~/.claude/projects/` | `CLAUDE.md` |
| Cursor | Internal DB | `.cursorrules` |
| Cline | Conversation logs | `.clinerules` |
| Generic | User-specified path | Any file |

## Roadmap

- [x] **Layer 2**: FTS5 Search Index
- [x] **Layer 3**: Wiki Knowledge Graph
- [x] **Layer 4**: Behavioral Surface Compiler
- [x] **Steering**: Immediate behavioral cascade
- [x] **Thread Isolation**: Project-scoped memory
- [ ] **Layer 5**: Memory Co-Processor (autonomous background daemon)
- [ ] **Layer 1**: Episode Archive (structured session storage)
- [ ] **CLI Agent Pipeline**: Automated extraction during session handoff
- [ ] **Dream Daemon**: Background consolidation and confidence decay
- [ ] **System 2 Researcher**: Web-backed fact checking

## License

MIT

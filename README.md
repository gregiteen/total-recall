# Total Recall

> **Local-only, Markdown-first cognitive memory system for AI coding agents.**

A four-layer cognitive architecture that remembers everything, recalls instantly, and evolves agent behavior from accumulated experience. No vector databases, no cloud APIs, no proprietary lock-in. Just Node.js, SQLite, and Markdown.

## The Problem

AI coding agents forget everything between sessions. They repeat mistakes, ignore user preferences, and behave like they woke up 30 seconds ago — despite having thousands of learnings stored in logs.

**Root cause:** Data goes in but never comes back out at the right time.

Total Recall fixes this with a layered memory architecture inspired by how human memory actually works.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│            LAYER 4: BEHAVIORAL SURFACE                      │
│         (system prompt — always in context)                  │
│   Auto-compiled rules + personality + triggers               │
│   Analogy: instinct / muscle memory                          │
├─────────────────────────────────────────────────────────────┤
│            LAYER 3: KNOWLEDGE GRAPH                         │
│         (.agent/memory-wiki/ — Zettelkasten)                │
│   Atomic notes with backlinks, provenance, confidence        │
│   Analogy: semantic memory / "I know that..."                │
├─────────────────────────────────────────────────────────────┤
│            LAYER 2: SEARCH INDEX                            │
│         (SQLite FTS5 — disposable, always rebuilt)           │
│   Full-text search across all tiers in <50ms                 │
│   Analogy: associative recall / "this reminds me of..."      │
├─────────────────────────────────────────────────────────────┤
│            LAYER 1: EPISODE ARCHIVE                         │
│         (append-only .md files)                              │
│   Raw session logs — nothing ever deleted                    │
│   Analogy: episodic memory / "remember when we..."           │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/yourusername/total-recall.git
cd total-recall
npm install
npm link
```

### 2. Choose Your IDE

Total Recall works with **any** IDE that uses a system prompt file. Run `total-recall sync-prompts --list` to see which IDEs are detected in your repo.

| IDE | Watcher | System Prompt | Rule File | Status |
|-----|---------|---------------|-----------|--------|
| **Antigravity** (Gemini) | `overview.txt` | `.agent/rules/graph-context.md` | Standalone rule file | ✅ Full support |
| **Claude Code** | `~/.claude/projects/` JSONL | `CLAUDE.md` | Symlink or section | ✅ Full support |
| **Cursor** | Internal DB | `.cursorrules` | `.cursor/rules/total-recall.mdc` | ✅ Full support |
| **Aider** | `.aider.chat.history.md` | Custom rules file | Section injection | ✅ Full support |
| **Windsurf** | Hooks.json | `.windsurfrules` | `.windsurf/rules/total-recall.md` | ✅ Full support |
| **Roo Code** | Internal | `.roorules` | `.roo/rules/total-recall.md` | ✅ Full support |
| **Continue** | Internal | Custom rules | `.continue/rules/total-recall.md` | ✅ Full support |
| **VS Code Copilot** | Session state | `.github/copilot-instructions.md` | Section injection | 🔄 Planned |
| **Generic** | User-specified path | Any file | Any file | ✅ Full support |

### 3. Install into your project

```bash
cd ~/my-project
total-recall install
# → Registers repo in ~/.total-recall/config.mjs
# → Scaffolds .agent/ memory directories
# → Creates docs/projects/ Kanban structure

# Sync behavioral surface to all detected IDE rule files
total-recall sync-prompts
```

### 4. Start using memory

```bash
# Steer agent behavior (takes effect immediately)
total-recall steer --type never "Never use templates — all generation must be zero-shot"
total-recall steer --type always "Always do deep research before planning"
total-recall steer --type correct "GPT Image 2 is SOTA, not DALL-E"

# Search all memory
total-recall search "branding architecture"

# Compile behavioral surface into your system prompt
total-recall compile-surface

# Synchronous graph consultation (returns tailored context for a specific prompt)
total-recall consult --prompt "deploy the API"

# Reindex after manual wiki edits
total-recall reindex
```

## What Each Layer Does

### Layer 1: Episode Archive

Every conversation session is archived as a structured Markdown file:

```
.agent/memory/episodes/
  2026/
    05/
      01/
        session-abc12345.md
        session-def67890.md
```

Each episode has YAML frontmatter (session ID, date, files modified, decisions made, user mood) and a summary of the conversation. Episodes are append-only — nothing is ever deleted.

### Layer 2: Search Index (FTS5)

A SQLite FTS5 full-text index across *all* memory tiers — wiki nodes, episodes, learnings, and handoffs. Sub-50ms search across thousands of entries.

The index is **disposable**. Delete `learning.db` and run `total-recall reindex` — it rebuilds entirely from the filesystem. Markdown is truth; SQLite is just the search engine.

### Layer 3: Knowledge Graph (Wiki)

A Zettelkasten-style wiki where each atomic concept gets its own `.md` file with rich YAML frontmatter:

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

**Node types:** `pattern`, `anti-pattern`, `concept`, `preference`, `decision`, `project`, `conclusion`

### Layer 4: Behavioral Surface

The **compiled output** — a curated block of rules, attitudes, and triggers injected directly into the system prompt. This is what the agent actually *reads* every turn.

Generated automatically by ranking wiki nodes using the signal score formula:

```
signal_score = intensity × (access + 1)^0.5 × max(0.1, 0.5^(days / half_life))
```

This means:
- **High-intensity experiences** (user praise or frustration) rank highest
- **Frequently accessed knowledge** stays load-bearing
- **Old, unaccessed knowledge** decays but never disappears
- **Different types decay at different rates** (preferences = 90 days, projects = 14 days)

## Advanced Features

### Memory Co-Processor (Daemon)

A background daemon that watches conversations in real-time and runs 5 parallel analysis checks:

1. **Steering Detection** — Identifies "always", "never", "correct" directives
2. **Sentiment Analysis** — Detects user mood shifts (praise, frustration)
3. **Relevance Check** — Surfaces related memories via FTS5 search
4. **Contradiction Detection** — Flags statements that conflict with wiki knowledge
5. **System 2 Research** — Background web-backed fact-checking of uncertain claims

```bash
tr-coprocessor start    # Start the daemon
tr-coprocessor status   # Check status
tr-coprocessor stop     # Stop
```

The daemon automatically writes the compiled graph surface to `.agent/rules/graph-context.md`. IDEs that support auto-injecting rule files (like Antigravity) will pick this up on every turn without any tool calls.

### System 2 Researcher

When the daemon detects uncertain claims ("I think...", "IIRC...", "probably...") or verifiable technical statements, it dispatches background research via Gemini CLI and persists results as `conclusion` wiki nodes.

If a fact-check reveals a correction, the agent gets a macOS notification and the correction is injected into the active context.

### Dream Daemon

A consolidation cycle (like sleep) that runs during `/start`:

- **NREM Phase** — Reads daily logs, extracts durable patterns, deduplicates against wiki
- **REM Phase** — Cross-references wiki nodes, detects duplicates, flags orphans
- **Confidence Decay** — Type-differentiated: preferences decay slowly (90 days), project context decays fast (14 days)
- **Pruning** — Zero-access, low-confidence nodes past 2× their threshold are moved to `.trash/` (never hard-deleted)
- **MEMORY.md Regeneration** — Auto-generates a human-readable summary from the wiki

### CLI Agent Pipeline

During session handoff (`/switch`), three specialized CLI agents run in parallel:

| Agent | Engine | Job |
|-------|--------|-----|
| **Archivist** | Gemini Flash | Archive conversation as episode, extract wiki nodes |
| **Synthesizer** | Claude | Recompile behavioral surface from updated wiki |
| **Fact-Checker** | Codex | Verify wiki claims against actual codebase |

```bash
# Run the pipeline manually
node src/agents/switch-memory-pipeline.mjs --root ~/my-project --dry-run
```

### Multi-IDE Prompt Sync

Automatically detect which IDEs are in use and sync the behavioral surface to each one's native rule format:

```bash
# List detected IDEs
total-recall sync-prompts --list

# Sync to all detected IDEs
total-recall sync-prompts

# Preview without writing
total-recall sync-prompts --dry-run
```

This writes:
- **Cursor**: `.cursor/rules/total-recall.mdc` (MDC format)
- **Windsurf**: `.windsurf/rules/total-recall.md`
- **Roo Code**: `.roo/rules/total-recall.md`
- **Continue**: `.continue/rules/total-recall.md`
- **Antigravity**: `.agent/rules/graph-context.md` (standalone rule file, auto-injected every turn)
- **CLAUDE.md**: Section injection (detects symlinks automatically)

## Configuration

Drop a `totalrecall.config.mjs` in your repo root:

```javascript
export default {
  dataDir: '.agent',                      // Where memory lives
  systemPromptFile: 'INSTRUCTIONS.md',    // Primary system prompt
  systemPromptFiles: [                    // Multi-IDE injection targets
    'INSTRUCTIONS.md',
    'CLAUDE.md',
  ],
  activeContextHeader: '## ACTIVE CONTEXT',
  behavioralSurfaceHeader: '## DISTILLED MEMORY (SUBJECT STATES)',

  watchers: ['antigravity'],              // Active IDE watchers
  // Available: antigravity, claude-code, cursor, aider, windsurf, generic

  ranking: {
    halfLife: {
      preference: 90,      // User tastes are durable
      'anti-pattern': 60,  // Bad patterns remembered well
      pattern: 30,         // Good patterns decay moderately
      concept: 30,
      decision: 45,        // Decisions somewhat durable
      project: 14,         // Project context ages fastest
    },
    decayFloor: 0.1,       // Never fully forget (10% floor)
    accessExponent: 0.5,   // Diminishing returns on access count
    surfaceCap: 30,        // Max rules in behavioral surface
    hotSlots: 5,           // Reserved for real-time steering
  },

  coprocessor: {
    enabled: true,
    intervalMs: 15000,     // Check every 15 seconds
    analysisModel: 'gemini-2.5-flash',
    researchEnabled: true,
    notificationsEnabled: true,
  },

  notifications: {
    channels: ['macos'],   // Also: 'slack', 'discord', 'email'
  },

  agents: {
    default: null,         // Override ALL pipeline roles
    archivist:   { binary: 'gemini', model: 'gemini-2.5-flash' },
    synthesizer: { binary: 'claude', model: 'claude-sonnet-4-20250514' },
    factChecker: { binary: 'codex',  model: 'o4-mini' },
  },
};
```

## File Structure

```
your-project/
├── totalrecall.config.mjs          # Configuration (optional)
├── INSTRUCTIONS.md                 # System prompt (auto-injected)
├── docs/
│   └── projects/                   # Project tracking Kanban
│       ├── in-progress/            # Active work
│       ├── backlog/                # Queued for later
│       ├── planned/                # Designed but not started
│       ├── completed/              # Done
│       └── archived/               # Historical reference
└── .agent/
    ├── learning/
    │   └── learning.db             # SQLite FTS5 index (disposable)
    ├── memory-wiki/                # Layer 3: Knowledge Graph
    │   ├── SCHEMA.md               # Node format specification
    │   ├── patterns/               # Positive patterns
    │   ├── anti-patterns/          # Things to avoid
    │   ├── concepts/               # Core knowledge
    │   ├── preferences/            # User preferences
    │   ├── decisions/              # Architecture decisions
    │   ├── projects/               # Project context
    │   └── conclusions/            # Research fact-checks
    ├── memory/
    │   ├── episodes/               # Layer 1: Session archive
    │   │   └── 2026/05/01/         # Organized by date
    │   ├── daily-logs/             # Ephemeral daily notes
    │   └── handoffs/               # Session handoff archives
    ├── MEMORY.md                   # Human-readable memory summary
    ├── USER.md                     # User preferences & identity
    ├── SOUL.md                     # Agent behavioral rules
    ├── IDENTITY.md                 # Agent persona
    └── DREAMS.md                   # Dream cycle journal

~/.total-recall/                    # User-global brain (cross-repo)
├── config.mjs                      # Registered repos + global settings
├── .env                            # API keys (mode 0600)
├── notifications/                  # Directory-based notification queue
├── threads/                        # Thread-to-project tags
├── thread-registry.md              # All threads across all repos
├── active-context.md               # Real-time context injection target
└── knowledge/                      # Global knowledge files
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `total-recall install [path]` | Register a repo in the global brain + auto-init |
| `total-recall install --list` | Show all registered repos with health status |
| `total-recall install --remove` | Unregister current repo |
| `total-recall init` | Scaffold `.agent/` + `docs/projects/` without registering |
| `total-recall search "terms"` | Full-text search across all memory (BM25 ranked) |
| `total-recall graph "slug"` | Knowledge graph traversal (backlinks) |
| `total-recall steer --type TYPE "text"` | Create wiki node + steer behavior immediately |
| `total-recall compile-surface` | Compile and inject behavioral surface |
| `total-recall sync-prompts` | Sync surface to all detected IDE rule files |
| `total-recall reindex` | Rebuild FTS5 index from filesystem |
| `total-recall lint` | Wiki integrity check |
| `total-recall dream` | Run consolidation cycle |
| `total-recall stats` | Memory system health report |
| `total-recall setup` | Initialize `~/.total-recall/` global config |
| `total-recall setup --share` | Encrypt and export config |
| `total-recall setup --config <URL>` | Import config (decrypts if needed) |
| `total-recall status` | Show integrations, channels, agents |
| `total-recall notify "title" "msg"` | Enqueue notification |
| `total-recall consult --prompt "text"` | Synchronous graph query — returns tailored context |

**Short aliases** (via `package.json` bin entries):

| Alias | Expands To |
|-------|------------|
| `tr-steer` | `total-recall steer` |
| `tr-query` | `total-recall search` |
| `tr-surface` | `total-recall compile-surface` |
| `tr-reindex` | `total-recall reindex` |
| `tr-coprocessor` | `total-recall coprocessor` |
| `tr-episodes` | `total-recall episodes` |
| `tr-notify` | `total-recall notify` |

## Security

- **AES-256-GCM** encryption for shared configs (PBKDF2 600K iterations, SHA-512)
- **No shell interpolation** — all CLI agent dispatches use `spawn()` with argument arrays
- **File permissions** — `~/.total-recall/` is created with `0o700`, `.env` with `0o600`
- **Secrets never committed** — `.env`, `*.key`, `*.pem` in `.gitignore`
- **Password minimum** — 8 characters for encrypted config sharing

## Design Principles

| Principle | Why |
|-----------|-----|
| **Markdown is truth** | Every memory is a `.md` file. SQLite is a disposable index. Delete the DB and rebuild — zero data loss. |
| **Zero cloud dependencies** | Node.js + SQLite + Markdown. No APIs, no vector DBs, no subscriptions. |
| **No data destruction** | Raw episodes are append-only. Wiki nodes are versioned. Pruned nodes go to `.trash/`, never deleted. |
| **Emotion is signal** | User praise and frustration are the strongest importance indicators. Intensity 9 + negative sentiment = this rule stays forever. |
| **Provenance everywhere** | Every compiled rule traces back: behavioral surface → wiki node → episode → user's exact words. |
| **Universal portability** | Git-versionable `.md` files. Switch IDEs freely. No proprietary lock-in. |

## Testing

```bash
npm test
# Runs: node --test src/tests/*.test.mjs
# 73 tests across 29 suites: utils, ranking, wiki, episodes, dream, fts5, crypto, watchers, notifications
```

## License

MIT

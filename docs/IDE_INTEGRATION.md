# Total Recall — IDE & Agent Integration Guide

> Total Recall is the memory OS. Claude Code, Cursor, Codex, Antigravity, VS Copilot, Pi, Hermes, and OpenClaw are **interfaces** on top of it. This document explains how to wire each one to Total Recall's brain.

---

## The Core Principle

Every IDE/agent has its own native memory file it reads at startup. Total Recall's job is:

1. **Watch** — relay daemon captures every session those tools write to disk
2. **Process** — Gemma 4 brain extracts patterns, facts, decisions from those sessions
3. **Compile** — dream cycle produces a single `INSTRUCTIONS.md` that is better than anything any individual tool could produce on its own
4. **Inject** — symlink or write that compiled memory into each tool's expected file location

The user does nothing. It is automatic.

---

## What Makes Total Recall's Memory Different

Every tool below has some form of memory. None of them have:

| What they have | What Total Recall adds |
|---|---|
| Static markdown files you write manually | A local AI that **continuously improves** those files autonomously |
| Session summaries (basic auto-capture) | **3-cognitive-layer** processing: Conscious → System 2 → Research |
| A single memory file | **3-tier hierarchy**: Hot (INSTRUCTIONS.md) → Progressive (SKILL.md) → Full vault |
| Memory that stays the same between sessions | Memory that **gets smarter every hour** via the dream cycle |
| Tool-specific memory (siloed per IDE) | **Cross-IDE memory**: what you learn in Claude Code improves your Cursor sessions too |
| Manual conflict resolution | **Automatic conflict resolution** with O(1) SPO ontology check |

---

## Integration Map

### 1. Claude Code

**Native memory files Claude reads:**
```
/etc/claude-code/CLAUDE.md          ← enterprise policy (highest priority)
~/.claude/CLAUDE.md                 ← user-level personal preferences
~/.claude/rules/*.md                ← user-level modular rules
./CLAUDE.md                         ← project root (shared via git)
./.claude/CLAUDE.md                 ← project .claude dir
./.claude/rules/*.md                ← path-scoped rules (glob frontmatter)
./CLAUDE.local.md                   ← local-only, not committed
AGENTS.md                           ← also read (interop with Codex)
```

**Auto memory:** Claude writes learned preferences to `~/.claude/memories/` and triggers an "Auto Dream" cycle every 24h + 5 sessions to consolidate them.

**Total Recall integration:**
```bash
npx total-recall connect claude-code
# Symlinks: CLAUDE.md → ~/.agent/INSTRUCTIONS.md
# Relay watches: ~/.claude/projects/*.jsonl
```

**Key advantage:** Total Recall's INSTRUCTIONS.md is far richer than Claude's auto-memory because it's compiled by Gemma 4 with conflict resolution, tier promotion, and cross-session pattern extraction — not just a simple note-taker.

---

### 2. OpenAI Codex

**Native memory files Codex reads:**
```
~/.codex/AGENTS.md                  ← global user-level instructions
./AGENTS.md                         ← project root
./subdir/AGENTS.md                  ← hierarchical, closer dir wins
~/.codex/memories/                  ← auto-generated session summaries
~/.codex/config.toml                ← memories = true/false toggle
```

**Auto memory:** Codex summarizes prior sessions into `~/.codex/memories/` automatically. Accessible via `/memories` in TUI.

**Total Recall integration:**
```bash
npx total-recall connect codex
# Symlinks: AGENTS.md → ~/.agent/INSTRUCTIONS.md
# Relay watches: ~/.codex/sessions/*.jsonl
```

---

### 3. Antigravity (Google DeepMind)

**Native memory files Antigravity reads:**
```
AGENTS.md                           ← project instructions
.agents/skills/                     ← mounted skill files
```

**Native memory system:** Knowledge Items (KIs) — automatically captured insights stored as artifacts. Antigravity uses conversation summaries and artifact references injected into future sessions.

**Total Recall integration:**
```bash
npx total-recall connect antigravity
# Symlinks: AGENTS.md → ~/.agent/INSTRUCTIONS.md
# Each skill in .agent/skills/ also becomes visible
# Relay watches: ~/.gemini/antigravity/brain/*/overview.txt
```

**Note:** Antigravity and Total Recall are deeply complementary. Antigravity's Knowledge Items feed the relay; Total Recall's Gemma 4 brain processes them into durable SSSS vault nodes that survive across sessions and machines.

---

### 4. Cursor

**Native memory files Cursor reads:**
```
.cursorrules                        ← legacy (deprecated, still works)
.cursor/rules/*.mdc                 ← modern modular rules (glob-scoped)
```

**Community memory patterns:**
```
.cursor/memory/MEMORY.md            ← persistent facts (community standard)
.cursor/memory/SESSION.md           ← current task progress
```

Cursor has no built-in auto-memory — users must instruct the agent to update memory files as part of task completion.

**Total Recall integration:**
```bash
npx total-recall connect cursor
# Writes: .cursor/rules/total-recall.mdc → points to ~/.agent/INSTRUCTIONS.md
# Relay watches: ~/.cursor/projects/*.jsonl
```

**Cursor-specific advantage:** Total Recall fills the gap Cursor doesn't solve — the relay automatically captures what you do in Cursor sessions and feeds it into the brain, so the next session already knows what happened last time without you writing a single note.

---

### 5. VS Code Copilot

**Native memory files Copilot reads:**
```
.github/copilot-instructions.md     ← repo-level always-on instructions
~/.vscode/copilot-instructions.md   ← user-level instructions
```

**Native memory system:** Copilot Memory (opt-in) — auto-captures preferences at user, repo, and session scope. Enable via `github.copilot.chat.tools.memory.enabled`. Manage with `Chat: Show Memory Files`.

**Total Recall integration:**
```bash
npx total-recall connect vscode
# Writes: .github/copilot-instructions.md → imports from ~/.agent/INSTRUCTIONS.md
# Relay watches: ~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.jsonl
```

---

### 6. Pi Coding Agent

**Native memory files Pi reads:**
```
~/.pi/agent/AGENTS.md               ← global user-level (injected every session)
./AGENTS.md                         ← project-specific (layered on top)
~/.pi/agent/sessions/               ← JSONL tree sessions (branching, forkable)
```

**Extensions for memory:** Pi core is minimal by design. Long-term memory is handled via extensions (`gentle-engram`, `honcho-memory`, `pi-memory`) that hook into `session_start`/`session_shutdown` lifecycle events and persist to SQLite or markdown.

**Total Recall integration:**
```bash
npx total-recall connect pi
# Symlinks: ~/.pi/agent/AGENTS.md → ~/.agent/INSTRUCTIONS.md
# Relay watches: ~/.pi/agent/sessions/*.jsonl
```

---

### 7. Hermes Agent (Nous Research)

**Native memory files Hermes reads:**
```
~/.hermes/memories/MEMORY.md        ← world facts (2,200 char limit, frozen snapshot)
~/.hermes/memories/USER.md          ← user profile (1,375 char limit, frozen snapshot)
~/.hermes/state.db                  ← SQLite FTS5 full-text session search
~/.hermes/skills/                   ← agent-authored skill documents
```

**Curator daemon:** Runs on 7-day inactivity check (2h idle threshold). Archives unused skills (`active → stale → archived`), consolidates near-duplicates, prevents skill graveyard effect.

**Total Recall integration:**
```bash
npx total-recall connect hermes
# Writes: ~/.hermes/memories/MEMORY.md ← compiled from Total Recall vault
# Relay watches: ~/.hermes/state.db (via export) or session JSONL if available
```

**Key synergy:** Hermes has strict character limits that force consolidation. Total Recall's dream cycle is the perfect engine to produce a tight, high-signal `MEMORY.md` from the full vault — Gemma 4 compresses thousands of nodes into the best 2,200 characters for Hermes to use.

---

### 8. OpenClaw

**Native memory files OpenClaw reads:**
```
MEMORY.md                           ← curated long-term facts (loaded every session)
memory/YYYY-MM-DD.md                ← daily logs (today + yesterday auto-loaded)
SOUL.md                             ← persona, tone, behavioral guardrails
AGENTS.md                           ← operational rules and workflow policies
~/.openclaw/memory/{agentId}.sqlite ← hybrid BM25 + vector search index
```

**Pre-compaction flush:** Before context window clears, OpenClaw triggers a silent agentic turn to save critical context to memory files.

**Total Recall integration:**
```bash
npx total-recall connect openclaw
# Writes: MEMORY.md ← compiled from Total Recall vault
# Writes: AGENTS.md ← symlinked to INSTRUCTIONS.md
# Relay watches: ~/.openclaw/sessions/ (or configurable path)
```

---

## The Memory File Compatibility Matrix

| Tool | Reads | Total Recall writes/symlinks | Relay watches |
|------|-------|------------------------------|---------------|
| Claude Code | `CLAUDE.md`, `AGENTS.md`, `.claude/rules/` | `CLAUDE.md → INSTRUCTIONS.md` | `~/.claude/projects/*.jsonl` |
| Codex | `AGENTS.md`, `~/.codex/memories/` | `AGENTS.md → INSTRUCTIONS.md` | `~/.codex/sessions/*.jsonl` |
| Antigravity | `AGENTS.md`, `.agents/skills/` | `AGENTS.md → INSTRUCTIONS.md` | `~/.gemini/antigravity/brain/` |
| Cursor | `.cursor/rules/*.mdc` | `.cursor/rules/total-recall.mdc` | `~/.cursor/projects/*.jsonl` |
| VS Copilot | `.github/copilot-instructions.md` | `.github/copilot-instructions.md` | `workspaceStorage/*/chatSessions/` |
| Pi | `AGENTS.md`, `~/.pi/agent/AGENTS.md` | `~/.pi/agent/AGENTS.md` | `~/.pi/agent/sessions/*.jsonl` |
| Hermes | `MEMORY.md`, `USER.md` | `~/.hermes/memories/MEMORY.md` | `~/.hermes/state.db` |
| OpenClaw | `MEMORY.md`, `AGENTS.md`, `SOUL.md` | `MEMORY.md`, `AGENTS.md` | `~/.openclaw/sessions/` |

---

## The Self-Improving Loop

The critical differentiator: Total Recall's Gemma 4 doesn't just store memory — it **improves the quality of memory continuously**, including improving the improvement process itself.

```
IDE Sessions (any tool)
        │
        ▼ relay (automatic, every 60s)
Brain receives raw session files
        │
        ▼ post-mortem engine
Extracts: patterns, facts, decisions, skill gaps
        │
        ▼ memory-inbox/pending/
Conflict detector checks new nodes against vault
        │
        ▼ auto-resolution (O(1) SPO + fuzzy similarity)
Nodes promoted to memory-vault/
        │
        ▼ dream cycle (every 20 tasks)
  Light Sleep → scan modified nodes
  REM         → pattern recognition, score decay/promotion
  Deep Sleep  → recompile INSTRUCTIONS.md
        │
        ▼ surface.mjs (BM25 + TF-IDF router)
Top 7 relevant nodes injected into each SKILL.md
INSTRUCTIONS.md compiled from priority:absolute nodes
        │
        ▼ Every tool gets a better context next session
        │
        └─ AND: Gemma 4 also schedules tasks to IMPROVE THE ENGINES:
              - clarity-rewriter improves old vault nodes
              - fact-seeker researches gaps the post-mortem found
              - inference-engine draws new conclusions from node clusters
              - skill-engineering tasks write new SKILL.md files
              - cutoff-audit flags stale knowledge for refresh
```

**The improver improves the improver:** Gemma 4 generates `skill-engineering` tasks to improve `surface.mjs` routing weights, `memory-maintenance` tasks to tune decay parameters, and `system2-deliberation` tasks to reconsider old decisions in light of new evidence. The system never stops getting smarter.

---

## Quick Setup: Connect Everything

```bash
# Install and init
npm install -g total-recall
npx total-recall init

# Connect each tool you use (picks up automatically which ones are installed)
npx total-recall connect claude-code
npx total-recall connect codex
npx total-recall connect cursor
npx total-recall connect vscode

# Install relay as system service (starts on boot, runs forever)
npx total-recall relay install

# Point relay at your brain
npx total-recall connect --brain https://your-brain.duckdns.org --token YOUR_PAT

# Done. Every session in every tool now feeds and benefits from Total Recall.
```

---

## Compatibility & Coexistence: Will Total Recall Break Anything?

**No. You do not need to disable any tool's native memory system.** They operate on different layers and are designed to feed each other.

### Why They Don't Conflict

Total Recall and each tool's native memory occupy **different roles**:

| Layer | Owner | What it is |
|-------|-------|------------|
| **Curated / Durable** | Total Recall | `INSTRUCTIONS.md`, `CLAUDE.md`, `AGENTS.md` — distilled, high-signal, continuously improved by Gemma 4 |
| **Ephemeral / Session** | Each tool's native system | Auto-memories, session summaries, inline notes — recent context that helps the tool feel oriented |

These layers are **additive**. The tool reads both at startup. More signal = better outputs.

### Tool-by-Tool Compatibility

#### ✅ Claude Code — Full Coexistence, No Conflict

Total Recall writes `CLAUDE.md`. Claude Code's auto-memory writes to `~/.claude/memories/` — a completely separate location. Claude reads both. They stack.

**The virtuous cycle:** Claude's auto-memory writes preferences → relay captures those sessions → Gemma 4 extracts the patterns → promotes them into `INSTRUCTIONS.md` → next session Claude gets an even stronger `CLAUDE.md` that already contains those learned preferences at tier-1 priority.

**Do NOT disable Claude auto-memory.** It feeds Total Recall.

#### ✅ Codex — Full Coexistence, No Conflict

Total Recall controls `AGENTS.md`. Codex's memories live in `~/.codex/memories/` — separate. Same virtuous cycle applies.

**Do NOT disable Codex memories** (`memories = false` in config.toml). They feed Total Recall.

#### ✅ Antigravity — Full Coexistence, No Conflict

Total Recall controls `AGENTS.md`. Antigravity's Knowledge Items are stored as artifacts in its own system. They don't touch the same files.

The relay watches Antigravity session logs. KI artifacts are exactly the kind of high-signal observations that Gemma 4 promotes into durable vault nodes.

#### ✅ Cursor — No Native Memory to Conflict With

Cursor has no built-in auto-memory. Total Recall fills this gap entirely. Total Recall writes `.cursor/rules/total-recall.mdc` and that's the only memory Cursor has. Nothing to conflict with.

#### ✅ VS Code Copilot — Full Coexistence, No Conflict

Total Recall writes `.github/copilot-instructions.md`. Copilot's native Memory system writes to its own scoped storage. They're separate. Stack cleanly.

**Keep Copilot Memory enabled.** Captured user/repo preferences become relay input.

#### ✅ Pi Coding Agent — Full Coexistence, No Conflict

Total Recall symlinks `~/.pi/agent/AGENTS.md`. Pi's session tree lives in `~/.pi/agent/sessions/*.jsonl`. Pi memory extensions (gentle-engram, honcho-memory) write to their own SQLite databases. No overlap.

**Keep Pi memory extensions running.** They capture session context that the relay ships to Total Recall's brain.

#### ⚠️ Hermes — Managed Coexistence (Total Recall takes ownership of MEMORY.md)

Hermes writes its own auto-generated `MEMORY.md`. Total Recall also writes to `~/.hermes/memories/MEMORY.md`.

**Strategy:** Total Recall wins. Total Recall's Gemma 4 produces a far higher-quality, curated `MEMORY.md` than Hermes's auto-generation (which is just naive summarization). The dream cycle re-writes `MEMORY.md` every time it fires.

**What to do:** After running `total-recall connect hermes`, Hermes should be configured to treat `MEMORY.md` as read-only (don't let Hermes overwrite it). Hermes's SQLite `state.db` is unaffected and continues to provide session search — the relay reads it as a source.

**Concrete setting:** In Hermes config, set `memory.autoWrite = false` or `memory.curated = true` if the option exists. This tells Hermes to stop auto-generating the file and trust what's already there.

#### ⚠️ OpenClaw — Managed Coexistence (Total Recall takes ownership of MEMORY.md + AGENTS.md)

OpenClaw's pre-compaction flush writes to `MEMORY.md` and daily log files. Total Recall also writes `MEMORY.md`.

**Strategy:** Total Recall owns `MEMORY.md` and `AGENTS.md`. OpenClaw's daily logs (`memory/YYYY-MM-DD.md`) are *untouched* by Total Recall and continue to work. The relay watches them.

**The flow:**
```
OpenClaw session happens
    │
    ▼ OpenClaw writes today's log: memory/2026-05-19.md
    │
    ▼ Relay ships it to brain every 60s
    │
    ▼ Gemma 4 extracts facts from daily log
    │
    ▼ Dream cycle updates MEMORY.md with distilled facts
    │
    ▼ Next OpenClaw session starts with an even better MEMORY.md
```

**What NOT to do:** Don't disable OpenClaw's daily logging — that's the raw input that feeds Total Recall. Only `MEMORY.md` write-back should be disabled if OpenClaw offers the option.

---

### The Summary Rule

> **If the tool writes to a file Total Recall also writes to → Total Recall takes ownership. Everything else the tool writes is input to Total Recall, not competition.**

| File | Who owns it | Other tool's writes |
|------|-------------|---------------------|
| `CLAUDE.md` | Total Recall | Claude auto-memories → separate location, relay captures |
| `AGENTS.md` | Total Recall | Tool's session memory → separate location, relay captures |
| `MEMORY.md` (Hermes) | Total Recall | Disable Hermes auto-write; its state.db still works |
| `MEMORY.md` (OpenClaw) | Total Recall | Daily logs continue untouched; relay captures them |
| `copilot-instructions.md` | Total Recall | Copilot native memory → separate scoped storage |
| `~/.pi/agent/AGENTS.md` | Total Recall | Pi extensions → their own SQLite, relay captures |
| `.cursor/rules/total-recall.mdc` | Total Recall | Cursor has no native memory |

**Bottom line:** Leave all native memory systems running. Total Recall is additive to every one of them except where it explicitly takes ownership of a specific file (Hermes MEMORY.md, OpenClaw MEMORY.md). In those cases, it produces a substantially better output than the tool's native system anyway — and it uses the tool's session data as input to do so.

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — full system topology
- [SSSS Skill](../.agent/skills/ssss/SKILL.md) — memory schema specification
- `npx total-recall relay status` — check what's being watched
- `npx total-recall status` — brain health and vault stats

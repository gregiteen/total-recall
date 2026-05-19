# Total Recall — Architecture

> Verified against source code: `relay.mjs`, `session-watcher.mjs`, `daemon-loop.mjs`, `dream.mjs`, `surface.mjs`, `scheduler.mjs`.

---

## The One-Sentence Version

Total Recall is a **background relay + brain** system: a lightweight daemon runs on your laptop, silently ships your IDE conversation logs to a remote brain server, and the brain's local AI (Gemma 4) processes everything — extracting memory, building knowledge, and compiling a single `INSTRUCTIONS.md` that any AI session can pick up automatically.

---

## Two-Component Architecture

```
YOUR LAPTOP / WORKSTATION                    YOUR BRAIN SERVER
(any machine you use IDEs on)                (Mac Mini, Vast.ai GPU, VPS, etc.)

┌─────────────────────────────┐              ┌──────────────────────────────────┐
│  IDE Session Files           │              │  Total Recall Brain               │
│                              │              │                                   │
│  ~/.claude/projects/         │   relay      │  POST /api/sessions/ingest        │
│  ~/.cursor/projects/         │ ──────────► │                                   │
│  ~/.codex/sessions/          │  (every 60s, │  Gemma 4 26B (via Ollama)         │
│  ~/.gemini/antigravity/      │   new files  │  runs dream cycle, post-mortems,  │
│  ~/Library/.../chatSessions/ │   only)      │  research, memory maintenance     │
│                              │              │                                   │
│  npx total-recall relay      │              │  .agent/                          │
│  (launchd/systemd service)   │ ◄────────── │  ├── INSTRUCTIONS.md  ◄── compiled│
│                              │   INSTRUCTIONS│  ├── memory-vault/               │
│  CLAUDE.md → INSTRUCTIONS.md│   .md pulled  │  ├── skills/                     │
│  AGENTS.md → INSTRUCTIONS.md│   (connect)  │  ├── memory-inbox/                │
│  .cursor/rules/              │              │  └── sessions/                    │
└─────────────────────────────┘              └──────────────────────────────────┘
```

### Component 1: The Relay (runs on YOUR machine)

**File:** `src/cli/relay.mjs`

The relay is a tiny Node.js daemon that:
1. Watches known IDE log directories for new/updated session files
2. Ships changed files to the brain via `POST /api/sessions/ingest`
3. Tracks what it has already sent (mtime-based deduplication)
4. Runs as a macOS launchd or Linux systemd service — starts on boot, runs silently forever

```bash
npx total-recall relay install   # installs as system service (starts on boot)
npx total-recall relay start     # start manually
npx total-recall relay status    # check what's being watched
npx total-recall relay once      # single scan, for testing
```

**What it watches:**

| Source | Directory |
|--------|-----------|
| Claude Code | `~/.claude/projects/` |
| Codex | `~/.codex/sessions/` |
| Cursor | `~/.cursor/projects/` |
| VS Code Copilot | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/` |
| Antigravity | `~/.gemini/antigravity/brain/` |

Config lives at `~/.agent/config/brain.json`:
```json
{ "url": "https://yourbrain.duckdns.org", "token": "tr_abc123..." }
```

### Component 2: The Brain (runs on YOUR server)

**Files:** `daemon-loop.mjs`, `dream.mjs`, `surface.mjs`, `session-watcher.mjs`, `scheduler.mjs`

The brain is a Node.js server + autonomous AI daemon that:
1. Receives session files from the relay via REST API
2. Runs Gemma 4 locally (via Ollama) to process them
3. Extracts patterns, facts, decisions, skill gaps into the memory vault
4. Compiles everything into `INSTRUCTIONS.md`

The brain NEVER sends data to any cloud service. Gemma 4 runs entirely on your server hardware.

---

## The Daemon Loop (inside the brain)

The brain runs a continuous intelligence loop, keeping Gemma 4 busy 24/7 at $0 cost.

```
Boot → scan existing sessions → start main loop:

  Every tick:
  ┌─────────────────────────────────────────────┐
  │ 1. Check for new ingested sessions           │
  │ 2. Pick next task from priority queue        │
  │ 3. Dispatch to cognitive engine              │
  │ 4. Write results to memory-inbox/pending/    │
  │                                              │
  │ Every 20 ticks: run Dream Cycle              │
  │   Light Sleep → REM → Deep Sleep            │
  │   → recompile INSTRUCTIONS.md               │
  └─────────────────────────────────────────────┘
```

### Priority Queue

| Priority | Work |
|----------|------|
| P0 | Real-time requests (chat, dashboard) |
| P1 | Memory maintenance (dream cycle, conflict resolution) |
| P2 | Skill engineering (auto-draft SKILL.md files) |
| P3 | Proactive research (web search, knowledge refresh) |
| P4 | Self-evaluation (frontier eval loop) |
| P5 | Exploration (speculative background work) |

### Cognitive Engines

| Engine | What it does |
|--------|-------------|
| `post-mortem.mjs` | Analyzes session → extracts patterns, facts, skill gaps |
| `inference-engine.mjs` | Draws new conclusions from vault node combinations |
| `fact-seeker.mjs` | Proactive web research, knowledge acquisition |
| `clarity-rewriter.mjs` | Rewrites stale or unclear vault nodes |
| `conflict-detector.mjs` | O(1) SPO ontology check + fuzzy similarity → quarantine conflicts |
| `dream.mjs` | Full memory maintenance + surface compilation |
| `steering.mjs` | Conflict resolution and memory promotion/demotion |

---

## The Dream Cycle

Runs every 20 task ticks. Three phases:

- **Light Sleep** — scan vault for modified files, update derived indexes
- **REM** — pattern recognition, score memories, promote active / decay stale
- **Deep Sleep** — recompile `INSTRUCTIONS.md` from `priority: absolute` vault nodes

The compiled `INSTRUCTIONS.md` is what every AI session picks up. It's the distilled output of everything the brain has learned about you.

---

## Virtual File System (.agent/)

Everything lives in plain Markdown files. No database. No lock-in.

```
.agent/
├── INSTRUCTIONS.md              ← TIER 1: Compiled hot memory (auto-injected into AI sessions)
├── memory-vault/                ← TIER 3: Permanent vault (source of truth)
│   ├── invariants/              ← priority: absolute → compiles to TIER 1
│   ├── preferences/
│   ├── anti-patterns/           ← "Never do X"
│   ├── patterns/                ← "Always do X"
│   ├── decisions/               ← Architectural reasoning
│   ├── concepts/                ← Domain knowledge
│   ├── facts/                   ← Verified assertions
│   └── lore/                    ← Backstory and context
├── skills/                      ← TIER 2: Progressive disclosure
│   └── <skill-name>/SKILL.md   ← Injected with top-7 relevant memory nodes
├── memory-inbox/
│   ├── pending/                 ← New observations awaiting promotion
│   └── conflicts/               ← Needs human resolution
├── memory-derived/              ← Disposable JSONL indexes (rebuilt by dream cycle)
├── sessions/                    ← Ingested IDE conversation files
├── scheduler/queue/             ← Autonomous task queue (type: task markdown files)
├── config/
│   ├── brain.json               ← Brain URL + PAT (relay reads this)
│   ├── runtime.yml              ← LLM runtime config
│   ├── auth.yml                 ← API auth config
│   └── secrets.enc              ← AES-256 encrypted secrets
├── logs/
│   ├── relay.log                ← Relay shipping activity
│   └── daemon.log               ← Brain daemon activity
└── .backups/                    ← Nightly tar.gpg archives
```

---

## Intelligence Model

### Local: Gemma 4 26B-A4B (via Ollama)
- Runs on YOUR server hardware — zero cloud cost
- Q4_K_M quantization (~15.5 GB RAM)
- Handles all background work: post-mortems, research, memory maintenance, dream cycle
- 1,000+ inferences/day at $0

### Frontier API (optional, BYOK)
Used only for high-stakes eval and confidence escalation:
- Gemma 4 builds skills → self-tests → escalates to frontier for ~$0.012/eval → corrections → applied to vault
- Target spend: <$15/month
- Privacy: `privacy: local_only` vault nodes are redacted before any frontier call

---

## Security & Privacy

- **Your conversations never leave your control.** The relay ships logs from your laptop to YOUR server (not Google, not Anthropic, not anyone else).
- **Gemma 4 runs on your hardware.** No inference goes to any third-party cloud.
- **Frontier API is opt-in and redacted.** `privacy: local_only` nodes are always stripped before escalation.
- **Secrets**: Argon2id master password → AES-256-GCM `secrets.enc`. No plaintext keys on disk.
- **Code sandbox**: 512MB RAM cap, 60s timeout, offline network namespace, scoped to `~/.agent/`.
- **Backups**: Nightly AES-256 + GPG encrypted tarballs, optional rsync to S3/B2.

---

## Full System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  YOUR LAPTOP (or any machine with IDEs)                                  │
│                                                                          │
│  Claude Code → ~/.claude/projects/*.jsonl ──┐                           │
│  Cursor      → ~/.cursor/projects/*.jsonl ──┤                           │
│  Codex       → ~/.codex/sessions/*.jsonl  ──┼──► relay daemon           │
│  VS Copilot  → workspaceStorage/...       ──┤    (launchd/systemd)      │
│  Antigravity → ~/.gemini/antigravity/...  ──┘    ships new files        │
│                                                   every 60 seconds       │
│  CLAUDE.md / AGENTS.md / .cursor/rules/                                 │
│    → symlinked to INSTRUCTIONS.md (pulled from brain)                   │
└──────────────────────┬────────────────────────────────────────────────--┘
                       │ POST /api/sessions/ingest
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  YOUR BRAIN SERVER (Mac Mini / Vast.ai GPU / VPS / Oracle Cloud ARM)    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  REST API (Caddy TLS → Node.js)                                    │ │
│  │  POST /api/sessions/ingest  ← receives from relay                 │ │
│  │  GET  /api/instructions     ← serves INSTRUCTIONS.md to clients   │ │
│  │  POST /v1/chat/completions  ← OpenAI-compatible chat endpoint     │ │
│  │  MCP Gateway                ← for IDEs that want direct access     │ │
│  │  Dashboard (React SPA)      ← browser-based memory explorer       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Background Intelligence Daemon                                    │ │
│  │                                                                    │ │
│  │  session-watcher → post-mortem → memory-inbox/pending/            │ │
│  │  dream cycle     → conflict resolution → memory-vault/            │ │
│  │  scheduler       → research / inference / clarity rewrite         │ │
│  │  surface.mjs     → compile INSTRUCTIONS.md ← ← ← ← ← ← ← ←     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Gemma 4 26B via Ollama (ALL inference is local, zero cloud cost) │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## What This Is NOT

- ❌ Not a proxy — it does NOT intercept or sit between you and Claude/Cursor/GPT
- ❌ Not a plugin — IDEs don't need to be modified or configured
- ❌ Not manual — zero setup per-IDE beyond symlinking INSTRUCTIONS.md
- ❌ Not sending data to Anthropic/OpenAI/Google — only to YOUR server
- ❌ Not replacing your IDE's AI — it runs in parallel, invisibly

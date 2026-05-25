# Total Recall — Architecture

> Verified against source code: `relay.mjs`, `session-watcher.mjs`, `daemon-loop.mjs`, `surface.mjs`, `scheduler.mjs`, `embeddings.mjs`, `dispatch.mjs`.
> Last Updated: May 24, 2026

---

## The One-Sentence Version

Total Recall is a **background relay + brain** system: a lightweight daemon runs on your workstation, silently ships your IDE conversation logs to a remote brain server, and the brain's specialized CLI dispatch engine and enterprise-grade semantic search (Google `gemini-embedding-2`) process everything — extracting memory, building knowledge, and compiling a **5-line pointer shim** that any AI session picks up automatically, progressively disclosing deep domain rules through tailored `SKILL.md` packages.

---

## Two-Component Architecture

```
YOUR WORKSTATION                                 YOUR BRAIN SERVER
(any machine you use IDEs on)                    (Mac Mini, Vast.ai GPU, VPS, etc.)

┌─────────────────────────────┐                  ┌──────────────────────────────────┐
│  IDE Session Files           │                  │  Total Recall Brain               │
│                              │                  │                                   │
│  ~/.claude/projects/         │     relay        │  POST /api/sessions/ingest        │
│  ~/.cursor/projects/         │  ─────────────►  │                                   │
│  ~/.codex/sessions/          │   (every 60s,    │  Headless CLI Agent Dispatch      │
│  ~/.gemini/antigravity/      │    new files     │  (Antigravity/Claude Code/Codex)  │
│  ~/Library/.../chatSessions/ │    only)         │  runs post-mortems, dream cycles, │
│                              │                  │  research via spawnSync           │
│  npx total-recall relay      │                  │                                   │
│  (launchd/systemd service)   │  ◄─────────────  │  Google gemini-embedding-2        │
│                              │   INSTRUCTIONS.  │  (and OpenAI fallback) handles    │
│  CLAUDE.md                   │   md pulled      │  semantic search & indexing       │
│  MEMORY.md (5-line shim)     │   (connect)      │                                   │
│  .cursor/rules/              │                  │  .agent/                          │
└─────────────────────────────┘                  │  ├── INSTRUCTIONS.md (5-line shim)│
                                                 │  ├── memory-vault/               │
                                                 │  └── skills/ (capsule injection) │
                                                 └──────────────────────────────────┘
```

### Component 1: The Relay (runs on YOUR machine)

**File:** `src/cli/relay.mjs`

The relay is a tiny Node.js daemon that:
1. Watches known IDE log directories for new/updated session files.
2. Ships changed files to the brain via `POST /api/sessions/ingest`.
3. Tracks what it has already sent using efficient mtime-based deduplication.
4. Runs as a macOS launchd or Linux systemd service — starts on boot, runs silently forever.

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

**Files:** `daemon-loop.mjs`, `dream.mjs`, `surface.mjs`, `session-watcher.mjs`, `scheduler.mjs`, `semantic-index.mjs`, `backup.mjs`, `dispatch.mjs`, `embeddings.mjs`

The brain is a Node.js server + autonomous AI daemon that:
1. **Deduplicates Session Ingestion:** Collapses duplicate chat transcripts using a content-hash SHA-256 fingerprinting pipeline.
2. **Enterprise-Grade Semantic Search**: Generates high-fidelity vector representations utilizing dynamically resolved embedding models (primary `gemini-embedding-2`, falling back through the active API registry preferences, featuring OpenAI fallback). Flat JSONL files store indices locally (`embeddings.jsonl` / `session-embeddings.json`) and an active local query cache (`embeddings-cache.json`) delivers blistering-fast query times (<50ms) without database overhead. It features **Auto-Healing Dimension Mismatch Re-embedding**: switching between different embedding models (e.g. Ollama's 384/1024/4096-dim models vs Google's 768-dim models) automatically triggers a dimension-mismatch purge of obsolete cached index files and rebuilds all embeddings cleanly from scratch.
3. **Headless CLI Agent Dispatch**: Completely replaces local Ollama/Gemma models. The brain dispatches cognitive tasks (post-mortems, steering, dream cycle consolidation, and fact-seeking) to headlessly spawned CLI agents (`Antigravity/Gemini`, `Claude Code`, `Codex CLI`) using `spawnSync` from the central registry in `.agent/skills/total-recall/skills/cli-agents/agents.yml`. All dispatches use the **Dynamic Model Selector (`resolveGenerativeModel`)** to query the active API models registry on the fly, translating general aliases (`flash`, `pro`) to optimal frontier models and ensuring zero hardcoded model versions in default configurations.
4. **Progressive Disclosure Surface Compilation**: Rebuilds instructions into an optimized **5-line pointer shim** that references the meta-skill `SKILL.md` system. This avoids prompt bloat by keeping Tier 1 contexts under 1,000 tokens while dynamically injecting the top-7 relevant memory nodes (Tier 2) into domain-specific skill manifests on demand.
5. **Encrypted & Git-Pushed Backups**: Creates scheduled daily backups (macOS LaunchAgent or Linux cron) that are AES-256 encrypted and automatically pushed to a private git remote (`npx total-recall backup --push-git`).

---

## The Daemon Loop (inside the brain)

The brain runs a continuous intelligence loop, utilizing high-performance CLI agents to process cognitive tasks.

```
Boot → scan existing sessions → start main loop:

  Every tick:
  ┌─────────────────────────────────────────────┐
  │ 1. Check for new ingested sessions           │
  │ 2. Pick next task from priority queue        │
  │ 3. Dispatch headlessly to CLI Agent Registry │
  │ 4. Write results to memory-inbox/pending/    │
  │                                              │
  │ Every 20 ticks: run Dream Cycle              │
  │   Light Sleep → REM → Deep Sleep            │
  │   → recompile 5-line pointer shims           │
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

### Cognitive Engines (CLI-Dispatched)

All cognitive engines are run through headlessly spawned CLI subagents that execute specialized instruction scripts:

| Engine | Operation Mode |
|--------|----------------|
| `post-mortem.mjs` | Spawns headless Claude/Gemini to extract patterns, facts, and skill gaps from ingested logs |
| `inference-engine.mjs` | Dispatches Codex/Claude to combine vault nodes and write new logical conclusions |
| `fact-seeker.mjs` | Initiates autonomous web-search dispatches, crawling references and acquiring cited facts |
| `conflict-detector.mjs` | Evaluates new nodes against SSSS v2 ontology, auto-resolving or quarantining conflicts |
| `dream.mjs` | Conducts memory pruning, promotes active facts, decays disused nodes, and compiles instruction shims |
| `steering.mjs` | Handles direct memory promotion/demotion and human overrides |

---

## The Dream Cycle

Runs every 20 task ticks. Three phases:

- **Light Sleep** — Scan vault for modified files, dynamically resolve active embedding models, check for dimension mismatches to trigger auto-healing re-embedding, refresh embedding vectors, and update derived indexes.
- **REM** — Score memories, perform semantic clustering, promote active cards, and decay stale confidence indexes.
- **Deep Sleep** — Recompile instruction files. Write a highly compact **5-line pointer shim** pointing to `SKILL.md` to prevent prompt bloat.

---

## Virtual File System (.agent/)

Everything lives in plain Markdown files. No database. No lock-in.

```
.agent/
├── INSTRUCTIONS.md              ← TIER 1: Compiled 5-line pointer shim (auto-loaded in IDEs)
├── memory-vault/                ← TIER 3: Permanent vault (source of truth)
│   ├── invariants/              ← priority: absolute → compiles to pointer shims
│   ├── preferences/
│   ├── anti-patterns/           ← "Never do X"
│   ├── patterns/                ← "Always do X"
│   ├── decisions/               ← Architectural reasoning
│   ├── concepts/                ← Domain knowledge
│   └── facts/                   ← Verified assertions
├── skills/                      ← TIER 2: Progressive disclosure
│   └── <skill-name>/SKILL.md   ← Dynamic capsule injected with top-7 semantic nodes
├── memory-inbox/
│   ├── pending/                 ← New observations awaiting promotion
│   └── conflicts/               ← Needs human resolution
├── memory-derived/              ← Ephemeral JSONL indexes (rebuilt by reindex/dream)
│   ├── embeddings.json          ← Local gemini-embedding-2 vector index
│   └── embeddings-cache.json    ← High-speed cosine query cache
├── sessions/                    ← Ingested IDE conversation files
├── scheduler/queue/             ← Autonomous task queue (type: task markdown files)
├── config/
│   ├── brain.json               ← Brain URL + PAT (relay reads this)
│   ├── budget.yml               ← Daily/weekly budget caps config
│   ├── auth.yml                 ← API auth config
│   └── secrets.enc              ← AES-256 encrypted secrets
└── .backups/                    ← Nightly tar.gpg archives
```

---

## Intelligence & Dispatch Model

Total Recall completely eliminates local hardware overhead (Ollama and local LLMs are fully removed) in favor of high-fidelity, high-speed remote dispatches and headless CLI agent orchestrations.

### The Headless Agent Registry (`agents.yml`)

The system routes cognitive tasks to specialized CLI agents operating headlessly:

| Agent Binary | Target Model | Context Focus | Use Case |
|--------------|--------------|---------------|----------|
| **Gemini CLI** | `gemini-3.5-flash` | 1M+ token context | Heavy-lifting, bulk logs ingestion, repo-wide post-mortems |
| **Claude Code** | `claude-opus-4-7` | Frontier SWE capability | Hard logic, complex reasoning, code review, precise steering |
| **Codex CLI** | `gpt-5.5` | Sandboxed automation | Ephemeral TDD scripts, test suite execution, isolated files |

Dispatches are triggered via the `dispatch.mjs` script using non-interactive shells (`spawnSync`) and automatically notify the developer's macOS environment upon completion.

---

## Security & Privacy

- **Your conversations never leave your control**: The relay ships logs from your laptop to YOUR server (not third-party SaaS platforms).
- **Redaction of sensitive memory**: Memory nodes marked with `privacy: local_only` are systematically redacted before any external CLI agent dispatch or frontier API call.
- **Sandboxed Execution**: Subagents run inside an isolated sandbox wrapper (`sandbox.mjs`) featuring strict POSIX namespaces, RAM/CPU allocation caps, restricted directory access, and command-execution whitelists.
- **Secrets**: Argon2id master password → AES-256-GCM `secrets.enc`. No plaintext keys on disk.
- **Backups**: Nightly AES-256 + GPG encrypted tarballs, automatically pushed to your private Git repo.

---

## Full System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  YOUR WORKSTATION (or any machine with IDEs)                            │
│                                                                          │
│  Claude Code → ~/.claude/projects/*.jsonl ──┐                           │
│  Cursor      → ~/.cursor/projects/*.jsonl ──┤                           │
│  Codex       → ~/.codex/sessions/*.jsonl  ──┼──► relay daemon           │
│  VS Copilot  → workspaceStorage/...       ──┤    (launchd/systemd)      │
│  Antigravity → ~/.gemini/antigravity/...  ──┘    ships new files        │
│                                                   every 60 seconds       │
│  CLAUDE.md / MEMORY.md / .cursorrules/                                  │
│    → symlinked to compiled 5-line pointer shim                          │
└──────────────────────┬────────────────────────────────────────────────--┘
                       │ POST /api/sessions/ingest
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  YOUR BRAIN SERVER (Mac Mini / Vast.ai / VPS)                           │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  REST API (Caddy TLS → Node.js)                                    │ │
│  │  POST /api/sessions/ingest  ← receives from relay                 │ │
│  │  GET  /api/instructions     ← serves pointer shim to clients       │ │
│  │  POST /api/search           ← Google gemini-embedding-2 endpoint  │ │
│  │  Dashboard (React Glass)    ← browser-based memory explorer        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Background Intelligence Daemon                                    │ │
│  │                                                                    │ │
│  │  session-watcher → post-mortem → memory-inbox/pending/            │ │
│  │  dream cycle     → conflict resolution → memory-vault/            │ │
│  │  scheduler       → dispatches headless agents via spawnSync        │ │
│  │  surface.mjs     → compile 5-line pointer shims                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Headless CLI Agent Registry (Antigravity/Claude Code/Codex CLI)   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## What This Is NOT

- ❌ **Not a proxy** — it does NOT intercept or sit in the network path of Cursor/Claude/GPT.
- ❌ **Not a heavy IDE plugin** — IDEs don't need configuration, just a lightweight pointer shim.
- ❌ **Not a local GPU resource hog** — Ollama and local LLMs are completely removed, avoiding memory constraints and keeping local workstations lightning-fast.
- ❌ **Not sending raw data to the cloud** — Redacts sensitive `local_only` vault nodes before any API or CLI agent dispatch.

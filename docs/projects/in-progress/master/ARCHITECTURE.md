# Total Recall 3.0 — Architecture

> Derived from PRD v3.0. This document defines **what this repo is** and **how it becomes the running product**.

---

## 1. What This Repo Is

This repository is an **npm package** that deploys a sovereign AI system onto any POSIX host with ≥24GB RAM.

```text
github.com/gregiteen/total-recall  →  npm publish  →  npx total-recall deploy
```

The repo contains three layers:

| Layer | Location | Purpose | Ships with product? |
|:---|:---|:---|:---|
| **Product Runtime** | `src/core/`, `src/server/` | The Brain — modules that run 24/7 on the target machine | ✅ Yes |
| **CLI & Deploy** | `bin/`, `src/cli/`, `templates/` | Provisioning, management, and maintenance commands | ✅ Yes |
| **Frontend** | `frontend/` | React SPA dashboard — built to static assets, served by Caddy | ✅ Yes (built) |
| **Dev Skills** | `.agent/skills/` | Intelligence that helps agents build this repo | ❌ No |
| **Docs & Planning** | `docs/` | PRD, dev plan, tracker | ❌ No |

---

## 2. Repository Structure

```text
total-recall/
├── bin/
│   └── total-recall.mjs              # CLI entrypoint (npx total-recall <cmd>)
├── src/
│   ├── cli/                           # CLI subcommand handlers
│   │   ├── init.mjs                   #   Bootstrap Total Recall into existing repo
│   │   ├── deploy.mjs                 #   Provision host (Ollama, models, VFS, systemd)
│   │   ├── compile.mjs                #   Rebuild indexes + INSTRUCTIONS.md
│   │   ├── sync.mjs                   #   Pull instructions from cloud brain
│   │   ├── status.mjs                 #   Show brain connection + sync status
│   │   ├── dream.mjs                  #   Trigger dream cycle manually
│   │   ├── reindex.mjs                #   Delete + regenerate derived indexes
│   │   ├── lint.mjs                   #   Validate vault nodes against schema v2
│   │   ├── daemon.mjs                 #   start | stop | status for background daemon
│   │   ├── backup.mjs                 #   Encrypted tarball creation
│   │   ├── restore.mjs                #   Restore from backup
│   │   ├── export.mjs                 #   Portable VFS export
│   │   ├── import.mjs                 #   Import VFS on new host
│   │   └── upgrade.mjs                #   Swap kernel model
│   ├── core/                          # Product runtime (Brain modules)
│   │   ├── vault.mjs                  #   SSSS vault read/write/walk
│   │   ├── surface.mjs                #   BM25+TF-IDF skill routing + T1 compiler
│   │   ├── steering.mjs               #   Conflict detection (SPO + fuzzy)
│   │   ├── dream.mjs                  #   Dream cycle daemon (Light/REM/Deep)
│   │   ├── sandbox.mjs                #   Isolated code execution
│   │   ├── frontier.mjs               #   BYOK frontier API routing
│   │   ├── task_runner.mjs            #   P0-P5 autonomous task scheduler
│   │   ├── schema.mjs                 #   Zod validators for schema v2
│   │   ├── watchdog.mjs               #   Log monitor + automated triggers
│   │   ├── pattern_detector.mjs       #   User pattern recognition
│   │   ├── blackboard.mjs             #   Workflow state tracking
│   │   └── evolution.mjs              #   SSSS schema self-evolution
│   └── server/                        # HTTP layer
│       ├── index.mjs                  #   Main server (mounts api + mcp + static)
│       ├── api.mjs                    #   /v1/chat/completions proxy
│       └── mcp.mjs                    #   /mcp Streamable HTTP gateway
├── frontend/                          # React SPA dashboard
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── templates/                         # Deploy templates (copied to target)
│   ├── Caddyfile                      #   Reverse proxy + auto-TLS
│   ├── total-recall-server.service    #   systemd: Express + MCP server
│   ├── total-recall-daemon.service    #   systemd: dream cycle background loop
│   └── default-config/               #   Initial config files
│       ├── frontier.yml               #   BYOK frontier API config
│       └── security.yml               #   Privacy + export controls
├── scaffold/                          # VFS directory skeleton
│   └── .agent/                        #   Created at ~/.agent/ on deploy
│       ├── memory-vault/
│       │   ├── invariants/
│       │   ├── patterns/
│       │   ├── anti-patterns/
│       │   ├── preferences/
│       │   ├── decisions/
│       │   ├── concepts/
│       │   ├── facts/
│       │   └── lore/
│       ├── memory-derived/
│       ├── memory-inbox/
│       │   ├── pending/
│       │   └── conflicts/
│       ├── skills/                    # PRODUCT skills (kernel creates these)
│       ├── scheduler/queue/
│       ├── sessions/
│       ├── config/
│       ├── logs/
│       ├── files/
│       └── .backups/
├── docs/                              # Planning docs (not shipped)
│   └── projects/in-progress/master/
│       ├── PRD.md
│       ├── ARCHITECTURE.md            # THIS FILE
│       ├── DEV_PLAN.md
│       └── PROJECT_TRACKER.md
├── .agent/                            # DEV SKILLS (not shipped)
│   └── skills/
│       ├── skill/
│       ├── mcp-expert/
│       ├── ssss/
│       ├── cli-agents/
│       └── ...
├── package.json                       # npm package with "bin" field
└── README.md
```

---

## 3. Deployment Model

```text
Developer Machine                         Target Machine (Oracle VM / Mac / Linux)
┌────────────────┐                        ┌──────────────────────────────────────┐
│                │   npx total-recall     │                                      │
│  npm registry  │──── deploy ──────────▶ │  /opt/total-recall/                  │
│  (or git clone)│                        │    src/core/*.mjs                    │
│                │                        │    src/server/*.mjs                  │
└────────────────┘                        │    frontend/dist/                    │
                                          │    node_modules/                     │
                                          │                                      │
                                          │  ~/.agent/          (VFS — user data)│
                                          │    memory-vault/                     │
                                          │    skills/           (product skills)│
                                          │    config/                           │
                                          │    logs/                             │
                                          │                                      │
                                          │  Caddy (auto-TLS, ports 443/80)      │
                                          │  Ollama (Gemma 4 26B-A4B)            │
                                          │  SearXNG (Docker, port 8888)         │
                                          │                                      │
                                          │  systemd:                            │
                                          │    total-recall-server.service       │
                                          │    total-recall-daemon.service       │
                                          └──────────────────────────────────────┘
```

### What `npx total-recall deploy` does:

1. Detect host architecture (aarch64/x86_64)
2. Install Ollama (if not present)
3. Pull Gemma 4 26B-A4B model (~16GB)
4. Pull Kokoro-82M voice model (~200MB)
5. Install Caddy reverse proxy
6. Copy `scaffold/.agent/` → `~/.agent/` (VFS skeleton)
7. Copy `templates/default-config/` → `~/.agent/config/`
8. Install systemd unit files from `templates/`
9. Build frontend (`cd frontend && npm run build`)
10. Install the package globally or to `/opt/total-recall/`
11. Start services via systemd
12. Run initial `compile` to generate INSTRUCTIONS.md + indexes

### Dev Skills vs Product Skills

| Type | Location | Created by | Purpose |
|:---|:---|:---|:---|
| **Dev Skills** | `total-recall/.agent/skills/` (this repo) | Human developers | Help agents build and maintain the Total Recall codebase |
| **Product Skills** | `~/.agent/skills/` (target machine) | The kernel itself | Domain expertise the kernel builds autonomously |

These are completely separate. Dev skills never ship with the product. Product skills are created by the kernel's Skill Engineering loop (P2 priority) on the target machine.

---

## 4. Runtime Topology (on Target Machine)

```text
┌──────────────────────────────────────────────────────────────────┐
│  TOTAL RECALL BRAIN (Target Machine)                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Express Server (src/server/index.mjs)                      │ │
│  │                                                             │ │
│  │  Routes:                                                    │ │
│  │    POST /v1/chat/completions  → api.mjs (OpenAI proxy)     │ │
│  │    POST|GET|DELETE /mcp       → mcp.mjs (MCP gateway)      │ │
│  │    GET  /health               → health check               │ │
│  │    /*   (static)              → frontend/dist/ (React SPA) │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  OS Daemon (src/core/dream.mjs)                             │ │
│  │                                                             │ │
│  │  Background loops:                                          │ │
│  │    Dream Cycle (Light → REM → Deep Sleep)                   │ │
│  │    Task Scheduler (P0–P5 priority queue)                    │ │
│  │    Watchdog (log monitor + circuit breakers)                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐│
│  │ Ollama        │  │ SearXNG       │  │ ~/.agent/ (VFS)       ││
│  │ (Gemma 4)     │  │ (Web Search)  │  │   memory-vault/       ││
│  │ (Kokoro-82M)  │  │ (Docker)      │  │   skills/ (product)   ││
│  └───────────────┘  └───────────────┘  │   config/             ││
│                                         │   logs/               ││
│                                         └───────────────────────┘│
│                                                                  │
│  Caddy (reverse proxy, auto-TLS on port 443)                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Responsibilities

### Core Modules (`src/core/`)

| Module | Responsibility |
|:---|:---|
| `vault.mjs` | Atomic read/write of SSSS memory nodes. Walks vault, parses frontmatter. |
| `surface.mjs` | Routes memory nodes to skills via BM25+TF-IDF. Compiles Tier 1 INSTRUCTIONS.md. |
| `steering.mjs` | Conflict detection: Layer 1 (O(1) SPO ontology) + Layer 2 (fuzzy Jaccard+cosine). |
| `dream.mjs` | Background daemon: Light Sleep (scan), REM (pattern recognition), Deep Sleep (recompile). |
| `sandbox.mjs` | Isolated Node.js/Bash execution. Timeout, memory cap, credential injection. |
| `frontier.mjs` | BYOK frontier API routing. Reads `config/frontier.yml` for provider config. |
| `task_runner.mjs` | P0–P5 priority queue. Processes `type: task` markdown files from `scheduler/queue/`. |
| `schema.mjs` | Zod validators for all SSSS frontmatter (memory, task, workflow, skill, rule). |
| `watchdog.mjs` | Tails JSONL logs. Circuit breakers, exfiltration monitor, latency anomaly triggers. |
| `pattern_detector.mjs` | Watches user interactions for recurring topics → generates skill engineering tasks. |
| `blackboard.mjs` | Workflow state tracking via scratchpad files (`runs/data_${run_id}.json`). |
| `evolution.mjs` | Schema self-improvement proposals, testing, and application. |

### Server Modules (`src/server/`)

| Module | Responsibility |
|:---|:---|
| `index.mjs` | Main Express app. Mounts api, mcp, health, static frontend. Starts listening. |
| `api.mjs` | OpenAI-compatible `/v1/chat/completions` proxy with memory injection. |
| `mcp.mjs` | MCP Gateway — Streamable HTTP transport exposing tools, resources, prompts. |

### CLI Modules (`src/cli/`)

| Module | CLI Command | Responsibility |
|:---|:---|:---|
| `init.mjs` | `total-recall init [--brain <url>]` | Bootstrap Total Recall into an existing project repo |
| `deploy.mjs` | `total-recall deploy` | Provision host: Ollama, models, VFS, Caddy, systemd |
| `compile.mjs` | `total-recall compile` | Rebuild all derived indexes + INSTRUCTIONS.md + IDE shims |
| `sync.mjs` | `total-recall sync [--watch]` | Pull compiled instructions from cloud brain into local workspace |
| `status.mjs` | `total-recall status` | Show brain connection, last sync, vault hash, stale rules |
| `dream.mjs` | `total-recall dream` | Manually trigger a dream cycle |
| `reindex.mjs` | `total-recall reindex` | Delete + regenerate all derived indexes |
| `lint.mjs` | `total-recall lint` | Validate all vault nodes against schema v2 |
| `daemon.mjs` | `total-recall daemon start\|stop\|status` | Manage background daemon |
| `backup.mjs` | `total-recall backup` | Create encrypted VFS tarball |
| `restore.mjs` | `total-recall restore --from <path>` | Restore from backup |
| `export.mjs` | `total-recall export` | Portable VFS export |
| `import.mjs` | `total-recall import --from <path>` | Import VFS on new host |
| `upgrade.mjs` | `total-recall upgrade --model <name>` | Swap kernel model |

---

## 6. Interface Endpoints (on Target Machine)

| Endpoint | Purpose | Auth |
|:---|:---|:---|
| `POST /v1/chat/completions` | OpenAI-compatible proxy for IDEs | Bearer PAT |
| `POST\|GET\|DELETE /mcp` | MCP Gateway for Claude/Cursor/ChatGPT | OAuth 2.1 / Bearer PAT |
| `GET /health` | System diagnostics | None (local only) |
| `/*` | React SPA dashboard | Session cookie + bcrypt |

All traffic flows through Caddy for auto-TLS on port 443.

---

## 7. IDE Instruction File Management

The `compile` command (and the `init` command on first run) automatically manages IDE-specific instruction files:

| File | IDE | Managed By |
|:---|:---|:---|
| `INSTRUCTIONS.md` | Canonical source | Written fresh by `surface.mjs` on every compile |
| `GEMINI.md` | Antigravity (Google DeepMind) | Symlink → `INSTRUCTIONS.md` (if new) or injected block (if existing) |
| `AGENTS.md` | Cross-tool / Codex | Symlink → `INSTRUCTIONS.md` (if new) or injected block (if existing) |
| `.cursorrules` | Cursor | Symlink → `INSTRUCTIONS.md` (if new) or injected block (if existing) |
| `CLAUDE.md` | Claude Code | Symlink → `INSTRUCTIONS.md` (if new) or injected block (if existing) |
| `.clauderules` | Claude Code (alt) | Symlink → `INSTRUCTIONS.md` (if new) or injected block (if existing) |

**Non-destructive injection:** If an IDE file already exists with user-authored content, Total Recall injects a `<!-- BEGIN INJECTED MEMORY -->` block at the bottom. This block is replaced on every compile. User content above and below the block is never modified.

---

## 8. Data Flow

```text
User Request (IDE / Dashboard / MCP Client)
    │
    ▼
Caddy (TLS termination, port 443)
    │
    ▼
Express Server (src/server/index.mjs)
    │
    ├─► /v1/chat/completions (api.mjs)
    │     1. Load Tier 1 from INSTRUCTIONS.md
    │     2. Load relevant Tier 2 from skills/
    │     3. Prepend memory to user's messages
    │     4. Forward to Ollama (local) or Frontier API
    │     5. Stream response back
    │
    ├─► /mcp (mcp.mjs)
    │     1. Streamable HTTP session management
    │     2. Route tool calls to core modules
    │     3. Expose resources (vault, indexes)
    │     4. Serve prompt templates
    │
    └─► /* (static React SPA)
          Dashboard UI for all operations
```

---

## 9. Sync Fabric Architecture

The Sync Fabric distributes compiled knowledge from the brain to registered targets and ingests changes from bidirectional targets. See PRD §4.4.

### 9.1 Module Layout

```text
src/core/sync/
├── engine.mjs              # Orchestrator: diff → push → pull → conflict check
├── state.mjs               # Per-target sync state (hashes, timestamps)
└── adapters/
    ├── workspace.mjs        # Local filesystem (direct read/write)
    ├── git.mjs              # Git CLI (pull → commit → push)
    ├── s3.mjs               # S3-compatible API (AWS, B2, R2, MinIO)
    ├── gdrive.mjs           # Google Drive API v3
    └── webhook.mjs          # HTTP POST event notifications
```

### 9.2 Sync Data Flow

```text
Dream Cycle Compile / Manual Compile / Chat Session End
        │
        ▼
  surface.mjs → INSTRUCTIONS.md rebuilt
        │
        ▼
  sync/engine.mjs → detectChanges(lastSyncState)
        │
        ├─► Push to each target (per sync mode):
        │     workspace  → fs.writeFile + injectIntoExisting()
        │     git        → git add + commit + push
        │     s3         → putObject() for changed files
        │     gdrive     → files.update() / files.create()
        │     webhook    → POST event payload
        │
        ├─► Pull from bidirectional targets:
        │     workspace  → scan .agent/memory-vault/ for new/changed .md
        │     git        → git pull, detect new commits
        │     gdrive     → list changes since last sync token
        │
        ├─► For each pulled change:
        │     vault.mjs  → parse frontmatter
        │     steering.mjs → 2-layer conflict detection
        │     conflict?  → quarantine to memory-inbox/conflicts/
        │     clean?     → activate node, trigger recompile
        │
        └─► Log all events to ~/.agent/logs/sync.jsonl
```

### 9.3 Configuration

Sync targets are defined in `~/.agent/config/sync.yml`. The schema is validated by `schema.mjs` at startup.

Each target specifies:
- `name` — Unique identifier
- `type` — Transport adapter (`workspace`, `git`, `s3`, `gdrive`, `webhook`)
- `mode` — What to sync (`instructions-only`, `skills`, `vault`, `full`, `notifications`)
- `direction` — `push` (brain → target) or `bidirectional` (two-way)
- Transport-specific fields (path, repo URL, bucket, folder ID, webhook URL)
- Credentials reference via `{{secrets.*}}` mustache syntax

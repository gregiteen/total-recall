# Total Recall — System Architecture

> Verified against codebase: `relay.mjs`, `session-watcher.mjs`, `daemon-loop.mjs`, `surface.mjs`, `scheduler.mjs`, `embeddings.mjs`, `dispatch.mjs`, `vault-cache.mjs`, `config.mjs`, `sandbox.mjs`.
> Last Updated: May 25, 2026

---

## ⚡ The One-Sentence Summary

Total Recall is a **database-free, local background session relay + remote intelligence brain** system: a lightweight relay daemon watches local IDE conversation files and ships updates to your remote brain server, which employs high-fidelity vector semantic search (Google `gemini-embedding-2` with OpenAI fallback), structured cost-limiting controls, and a headless CLI agent execution framework to ingest history, resolve rules, and recompile a **5-line progressive disclosure pointer shim** that all IDEs inherit automatically.

---

## 🏗️ Two-Component Topology

```
YOUR WORKSTATION                                 YOUR BRAIN SERVER
(any machine you write code on)                  (Mac Mini, Vast.ai VPS, local host, etc.)

┌─────────────────────────────┐                  ┌──────────────────────────────────┐
│  IDE Session Logs           │                  │  Total Recall REST Server        │
│                             │                  │                                  │
│  ~/.claude/projects/        │     relay        │  POST /api/sessions/ingest       │
│  ~/.cursor/projects/        │  ─────────────►  │                                  │
│  ~/.codex/sessions/         │   (every 60s,    │  Headless CLI Agent Dispatch     │
│  ~/.gemini/antigravity/     │    new files     │  (spawns subagents from registry │
│  ~/Library/.../chatSessions/│    only)         │  to run dream & research tasks)  │
│                             │                  │                                  │
│  npx total-recall relay     │  ◄─────────────  │  Google gemini-embedding-2       │
│  (launchd/systemd service)  │   INSTRUCTIONS.  │  (and OpenAI fallback) handles   │
│                             │   md pulled      │  semantic search & indexing      │
│  CLAUDE.md                  │   (connect)      │                                  │
│  MEMORY.md (5-line shim)    │                  │ VFS (.agent/skills/total-recall/)│
│  .cursor/rules/             │                  │ ├── INSTRUCTIONS.md (shim)       │
│  GEMINI.md                  │                  │ └── memory-vault/                │
└─────────────────────────────┘                  └──────────────────────────────────┘
```

### Component 1: The Session Relay (Workstation client)

**File:** `src/cli/relay.mjs`

The session relay is a silent Node.js daemon that:
1. Watches active IDE log folders for changes to active conversation files.
2. Ingests modified lines and pushes them to the brain's REST API (`POST /api/sessions/ingest`).
3. Employs filesystem `mtime` modification timestamps to prevent redundant network transmissions.
4. Standardized as macOS launchd plists or Linux systemd user services that run on startup.

**Watched Locations:**

| Client / Editor | Directory Path | Log Format |
| :--- | :--- | :--- |
| **Claude Code** | `~/.claude/projects/` | Line-delimited JSONL |
| **Codex CLI** | `~/.codex/sessions/` | JSON log sequences |
| **Cursor** | `~/.cursor/projects/` | SQLite/JSON logs |
| **VS Code Copilot** | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/` | JSON delta sequences |
| **Antigravity** | `~/.gemini/antigravity/brain/` | JSONL history logs |

---

### Component 2: The Sovereign Brain Server

The brain server runs the primary REST API, compiles instructions, runs the background daemons, and maintains the Virtual File System (VFS).

---

### Component 3: The Setup Web Wizard (Graphical Browser Installer)

**Files:** `src/cli/deploy-ui.mjs`, `src/cli/wizard.html`

The Setup Web Wizard is served by a local Express instance during installation/deployment (`npx total-recall deploy --ui` or `setup`) and provides a premium, graphical onboarding dashboard that opens automatically in your default macOS/Linux web browser:
1. **Interactive Provisioning Phases**: Steps through deployment targets (Local, network SSH computer, renting a GPU in the cloud via Vast.ai credentials, or your own VPS), SSL auto-TLS configurations, and dashboard admin password hashing.
2. **One-Click Automated Installer**: Spawns an internal Server-Sent Events (SSE) progress pipeline, emitting live terminal compilation, model download, and installation logs directly to the browser screen.
3. **Omni-Channel Integration Selector**: A multi-select visual panel to wire up Claude Code, Codex, Cursor, VS Code Copilot, Gemini CLI, Aider, and Obsidian, plus installing launchd/systemd background relays.
4. **Credential Restoration**: Integrates with local persistent fallbacks, automatically identifying and restoring AES-encrypted tokens and bcrypt password hashes from `~/.agent/secrets.enc` or `.agent/secrets.enc` to avoid credential resets on fresh setups.

---

#### 1. ⚡ High-Speed Semantic Vector Indexing
- **Primary Model**: Google `gemini-embedding-2` (768 dimensions), with fallback vectors configured in the active API models registry (e.g., OpenAI `text-embedding-3-small`).
- **File-Native Indexes**: Vector indexes are written directly to plain JSONL (`embeddings.jsonl`) under the meta-skill's `memory-derived/` directory, backed by a high-speed cosine memory cache (`embeddings-cache.json`) for <50ms lookup times.
- **Auto-Healing Dimension Mismatch Purging**: If you switch embedding models (e.g. from a 384-dim Ollama model to the 768-dim Google API), the engine detects the dimension length mismatch, automatically clears out the obsolete cache files, and indexes the entire vault cleanly from scratch.

#### 2. 🤖 Headless CLI Agent Dispatch Framework
Total Recall completely eliminates heavy local GPU hardware overhead (Ollama and local VM models are fully deprecated). Instead, cognitive tasks (post-mortems, web research crawls, and dream cycle updates) are routed to specialized, headlessly spawned CLI agents running via non-interactive subshells (`spawnSync`):

- **Antigravity CLI** (`antigravity`): Ingests massive token context bounds for broad log post-mortems and repository-wide gap discovery.
- **Claude Code** (`claude`): Resolves complex logical rules, verifies integration tests, and performs precise SSSS ontology checking.
- **Codex CLI** (`codex`): Executes sandboxed test suites and automated file writes.

All dispatches are configured via the prioritized execution registry in `~/.agent/skills/total-recall/skills/cli-agents/agents.yml` and utilize the **Dynamic Model Selector (`resolveGenerativeModel`)** to dynamically translate general aliases (`flash`, `pro`, `default`) into the active, optimal model endpoints.

#### 3. 📂 Progressive Disclosure Surface Compiler
- Avoids prompt bloat by keeping active system prompts under 1,000 tokens.
- **Tier 1 (Hot Invariants)**: Absolutely binding rules (`priority: absolute` and `modality: must|must_not`) are compiled into a tiny, **5-line progressive pointer shim** that references the meta-skill `SKILL.md` system.
- **Tier 2 (Contextual Skills)**: The hybrid BM25 + TF-IDF router (`surface.mjs`) dynamically injects only the top-7 relevant memory nodes into domain-specific skill manifests on demand.

#### 4. 🗄️ Unified Merged Vault Caching (`vault-cache.mjs`)
- To eliminate expensive per-request disk scanning operations, `vault-cache.mjs` starts a persistent `fs.watch` file watcher over the SSSS memory directories, caching nodes in-memory.
- Standard read requests resolve instantly against the memory cache.
- In-process writes (POST, PUT, PATCH, DELETE) automatically call `invalidate()` to guarantee real-time updates are reflected instantly without waiting for disk watcher polls.

---

## 🧠 The Dual-Layer Brain Cascade

Total Recall partitions your sovereign brain memory into two virtual directories:

```
~ (User Home)
└── .agent/skills/total-recall/                 <-- GLOBAL BRAIN LAYER
    ├── config/brain.json                       # Master PAT credentials
    ├── memory-vault/                           # General user preferences
    └── memory-derived/                         # Ephemeral caches

/Users/greg/Github/total-recall/                <-- LOCAL PROJECT BRAIN LAYER
└── .agent/skills/total-recall/
    ├── memory-vault/                           # Project-specific facts
    └── memory-derived/                         # Unified project-local compiled index
```

### Cascade Precedence Rules:
1. **Local Dominance**: If a memory node with the same `slug` exists in both the global vault and the project vault, the **project vault version overrides the global node** on compilation.
2. **Category Defaulting**: CLI writes default target layers based on memory taxonomy:
   - **Global**: `invariants`, `preferences`, and `lore`.
   - **Project**: `facts`, `concepts`, `patterns`, and `decisions`.
3. **Drift Detection**: The `drift-detector.mjs` continuously validates compiled `graph-index.jsonl` entries against both the local and global canonical `.md` vaults, preventing "ghost records" or missing index entries.

---

## 🌀 The Daemon Loop & Priority Task Scheduler

The background daemon (`dream.mjs`) manages the **Continuous Intelligent Scheduler** ([src/core/scheduler.mjs](file:///Users/greg/Github/total-recall/src/core/scheduler.mjs)) and task execution loops:

### 1. Priority-Driven Queue Mechanics
Tasks are enqueued dynamically as standard Markdown files (`type: task`) located in your vault's `scheduler/queue/` directory. The scheduler resolves an **Effective Priority** by multiplying the task's base `priority` (10 to 100) by a strictly-regulated **layer weight** (`LAYER_WEIGHTS`), prioritizing critical correctness and active developer guidance over passive exploration:
- `conscious-enforcement` (Conscious Layer): **1.0** (layer weight)
- `cutoff-audit` (Training drift validation): **0.9**
- `system2-deliberation` (Slow System 2 reasoning): **0.8**
- `memory-maintenance` (Hygiene, decay pruning): **0.6**
- `skill-engineering` (Scaffolding new capability rules): **0.5**
- `proactive-research` / `research-acquisition` (Deep crawls): **0.4**
- `self-evaluation` (Frontier validation benchmarks): **0.3**
- `exploration` (Speculative tangents): **0.2**

### 2. The Dream Cycle Consolidation
Every 20 task ticks, the background daemon conducts the **Dream Cycle**:
- **Light Sleep**: Scans for modified files, updates vector embeddings, and purges/re-indexes caches upon detecting embedding model dimension mismatches.
- **REM**: Conducts clustering, prunes low-confidence nodes, and decays confidence scores on disused cards.
- **Deep Sleep**: Re-compiles rules and shims, and writes a daily summary note (`daily/YYYY-MM-DD.md`).

### 3. Continuous Idle Self-Improvement Loops (The Queue is NEVER Empty)
When the active developer queues are empty, the scheduler **automatically auto-generates idle tasks** to drive continuous optimization at $0 hardware cost. To maintain absolute security and zero local network footprint, it skips internet searches during idle, deploying a round-robin of **clean local strategies**:
- **Inference Task**: Scans tag clusters of related memory nodes to draw high-level SSSS ontological decisions or flag subtle rule contradictions.
- **Post-Mortem Task**: Reads and parses the most recent session history log to extract newly observed user preferences, style patterns, and identify subagent skill gaps.
- **Clarity Review Task**: Selects a random active memory node to audit its JSDoc annotations, title actionability, and Zod schema compliance.

---

## 🏃 hard Task Execution

Pending priority tasks are executed by the **Task Runner** ([src/core/task_runner.mjs](file:///Users/greg/Github/total-recall/src/core/task_runner.mjs)):
- **State Machine Updates**: Tasks transition transparently through states: `pending` → `in_progress` → `done` or `failed` (logging full exceptions to disk).
- **Subagent Routing**: Routes tasks to specialized subagents depending on category:
  - `proactive-research`: Spawns autonomous web crawls and gathers cited research reports (`research.mjs`).
  - `system2-deliberation`: Executes slow-deliberation inference engines (`inference-engine.mjs`) to consolidate vault data.
  - `memory-maintenance`: Triggers memory optimization and garbage-collection loops (`optimizer.mjs`).

---

## 🛡️ Sandbox Isolation, Costs, & Firewalls

### 1. Hardened Sandbox Environment
The sandbox execution layer (`sandbox.mjs`) utilizes strict OS security constraints:
- **POSIX Namespaces**: Scopes execution boundaries using platform isolation (`sandbox-exec` under macOS, `unshare` under Linux).
- **Default Offline**: Completely disables outbound network routing unless explicit whitelisted API targets (like the Google Gemini endpoint) are accessed.
- **Resource Constraints**: Imposes a 512MB RAM utilization threshold and a 60-second execution timeout.
- **Default Disabled**: Set to `security.yml.sandbox.enabled: false` by default, requiring high-privilege `sandbox:run` token scopes to execute.

### 2. Cost Control watchdog
- Evaluates cost logging on every subagent dispatch call.
- Tracks daily and weekly USD costs against threshold limits in `config/budget.yml`.
- If caps are exceeded, the cost supervisor dynamically aborts outbound dispatches and alerts the developer.

---

## 📂 Consolidated VFS Directory Hierarchy

Total Recall consolidates all data folders under the meta-skill `skills/total-recall/` directory, ensuring simple diff-based git backups and robust security:

```
.agent/
└── skills/
    ├── code-quality/                  # Development skill (not backed up)
    ├── repo-expert/                   # Development skill (not backed up)
    └── total-recall/                  # THE BRAIN (Consolidated User Data VFS)
        ├── SKILL.md                   # Master total-recall capability manifest
        ├── memory-vault/              # SSSS Canonical Markdown Vault
        │   ├── invariants/            # priority: absolute → Tier 1 (INSTRUCTIONS.md)
        │   ├── patterns/              # "Always do X" rules
        │   ├── anti-patterns/         # "Never do X" rules
        │   ├── preferences/           # Style preferences
        │   ├── decisions/             # Architectural history
        │   ├── concepts/              # High-level domain concepts
        │   └── facts/                 # Verified facts and evidence
        ├── memory-derived/            # Ephemeral cached indexes (disposable)
        │   ├── graph-index.jsonl      # Merged memory index manifest
        │   ├── embeddings.jsonl       # Vector index coordinates
        │   └── embeddings-cache.json  # Vector similarity cache
        ├── memory-inbox/              # Staging area for new nodes
        │   ├── pending/               # Awaiting ingestion check
        │   └── conflicts/             # Quarantined rule clashes
        ├── sessions/                  # Ingested IDE logs and conversation DAGs
        ├── scheduler/                 # Scheduler metadata
        │   └── queue/                 # Priority task markdown files
        ├── config/                    # Config files
        │   ├── brain.json             # Remote brain URLs and token registries
        │   ├── budget.yml             # Cost control thresholds
        │   └── secrets.enc            # AES-256 scrypt-encrypted master API keys
        ├── logs/                      # JSONL subsystem logs
        └── .backups/                  # Local encrypted backup snapshots

---

## 💬 Interactive CLI Agent Chat REPL

Total Recall features a native terminal-based chat REPL (`npx total-recall chat`) running [src/cli/chat.mjs](file:///Users/greg/Github/total-recall/src/cli/chat.mjs) that enables direct, conversational access to your active brain kernel from the terminal:

- **CLI-Agent Execution**: Conversation turns are dispatched dynamically to your prioritized **Unified Headless CLI Agents Registry** (`antigravity`, `gemini`, `claude`, `codex`) via `spawnSync`.
- **Pre-flight Health Routing**: Upon starting, `chat` checks agent binary availability, selecting the highest-priority active subagent found in your `$PATH`.
- **System Prompts & Context Cascades**: The REPL automatically injects baseline instructions ("Keep responses concise and direct") and formats chat session history sequences cleanly, allowing you to debug rules, steer preferences, and prompt the kernel in real time.

---

## 🔒 Session Security & Token Management

Total Recall implements role-based granular authorization schemas to protect your sovereign brain while maintaining 100% database-free isolation.

### 1. Local Dashboard Session Management (JWT-based)
For web dashboard access, Total Recall strictly avoids external third-party OAuth provider dependencies (e.g. Google, GitHub, Auth0) to protect your privacy and ensure standalone local operation:
- **Local Password Authentication**: Submitting a password to `/api/login` verifies it against a high-cost `dashboard.password_hash` (`bcrypt-cost: 12`) stored in `security.yml` and securely mirrored in `secrets.enc`.
- **Rest-Persistent JWT Cookies**: Upon successful login, the server signs a secure JSON Web Token (`sessionToken`) with a randomly generated 256-bit cryptographic secret (`session-secret`) persisted directly to `config/session-secret` so that logged-in dashboard sessions cleanly survive daemon restarts.
- **TLS Protection**: The daemon blocks non-secure remote connections, requiring active HTTPS TLS layers (automated via Caddy proxying) for all production traffic.

### 2. Personal Access Token (PAT) Key Lifecycle Manager
Headless tools, IDE editors, and session Relays authenticate via standard HTTP Bearer headers (`Authorization: Bearer tr_<token>`), managed by the **Keys Lifecycle Manager** ([src/server/keys.mjs](file:///Users/greg/Github/total-recall/src/server/keys.mjs)):
- **SHA-256 Hash Preservation**: To eliminate credential exposure risk, the server **never writes tokens to disk in plaintext**. It persists only a timing-safe SHA-256 hash (`token_hash`) and a short identifying prefix (`token_prefix`) inside the owner-exclusive `config/keys.jsonl` file (written with `0o600` access modes). Diffs are cleanly git-versioned.
- **Timing-Attack Protection**: Inbound Bearer PAT tokens are verified using cryptographically secure timing-safe comparisons (`crypto.timingSafeEqual`) on SHA-256 hashes, eliminating timing vector leaks.
- **Role-Based Granular Scopes**: Validated PAT keys carry granular permission scopes (e.g., `chat:write`, `memory:read`, `sandbox:run`), permitting fine-grained access control boundaries for different editors.

```

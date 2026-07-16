---
type: memory
slug: cli-help-reference
category: concepts
title: Total Recall Command & Architecture Help Reference
schema_version: 2
status: active
confidence: 1
importance: 5
modality: should
tags:
  - cli
  - help
  - commands
  - VFS
  - integrations
  - scheduler
  - daemon
  - budget
  - sandbox
  - watchdog
created: 2026-05-25T00:51:00.000Z
updated: 2026-05-25T00:56:00.000Z
sentiment_polarity: descriptive
last_accessed: 2026-05-26T23:03:03.507Z
source:
  type: manual
  session_id: migration-repair
  evidence_count: 1
supersedes: []
contradicts: []
related: []
routes_to_skills: []
superseded_by: null
sentiment_target: system
subject: system
predicate: remembers
object: Total Recall Command & Architecture Help Reference
decay:
  half_life_days: 180
  access_count: 1
x_temporal_context: 2026-05-26T23:05:06.474Z
---
# Total Recall Command & Architecture Help Reference

To guarantee perfect system awareness and eliminate unexpected retrieval latency, this semantic node documents the entire layout, core commands, internal features, and the interactive help subsystems of the **Total Recall Autonomous OS**.

---

## 1. Local VFS Directory Layout
Total Recall operates completely database-free, utilizing a Markdown-first, grey-matter frontmatter structure. The local VFS resides in `.agent/skills/total-recall/` (global: `~/.agent/skills/total-recall/`, project-layered: `<repo-root>/.agent/skills/total-recall/`):

* **`memory-vault/`**: Categories of persistent semantic nodes:
  * `invariants/`: Absolute rules and protocols (e.g. `operating-instructions.md`).
  * `preferences/`: Communication styles and personalization templates.
  * `facts/`: General factual nodes.
  * `concepts/`: High-level domain architectural rules.
  * `decisions/`: Historical project decisions.
  * `patterns/` & `anti-patterns/`: Desired vs forbidden coding behaviors.
  * `lore/`: Core project history.
* **`sessions/`**: Synced chat transcripts stored as JSONL (`<hash>.jsonl`).
* **`scheduler/queue/`**: Task nodes (`.md`) executed asynchronously by the background task manager.
* **`memory-derived/`**: Cached indices and compiled graph canvas visualizers (`graph-index.jsonl`, `canvas.json`).
* **`config/`**:
  * `agents.yml`: Headless CLI agent registry (`antigravity`, `gemini`, `claude`, `codex`).
  * `secrets.enc`: Secure, GPG-encrypted API keys and dashboard credentials.
  * `security.yml`: Password hashes and network authorization settings.
  * `budget.yml`: Cost-control settings for daily and weekly dollar caps.

---

## 2. Platform Core Features & Hardening

### 🪙 Budget Supervisor & Cost Control
* **File:** `.agent/skills/total-recall/config/budget.yml`
* **Features:** Enforces strict daily (`daily_cap_usd`, default $5.00) and weekly (`weekly_cap_usd`, default $25.00) dollar limits.
* **Hardening:** Spawning processes pass through a pre-flight gateway in `src/core/runtime.mjs`. If execution logs reveal that budget limits are breached, the gate blocks subsequent agent dispatches, sends a system alert, and enters protective hibernation.

### 🛡️ Watchdog Circuit Breaker & Quarantining
* **Features:** Continually monitors background daemon loops and log streams in real time.
* **Hardening:** If a critical subsystem (such as the sandboxed compiler or an API integration) fails $\geq 3$ consecutive times, the watchdog automatically trips the circuit breaker and quarantines the failing subsystem to protect local directory structures.

### 🗃️ Hardened Local VFS Sandbox
* **Features:** Hardened gateway that isolates execution environments for untrusted Node.js/JavaScript script blocks.
* **Command:** `POST /api/sandbox`
* **Hardening:** Restricts shell execution, network permissions, and isolates path routing to within local repository boundaries to prevent directory traversal or system manipulation.

### 🔍 Drift Detector & Index Reconciliation
* **Features:** Compares the active state of the canonical vault directory against derived index tables.
* **Command:** `npx total-recall compile --check` (or `rebuild --check`)
* **Hardening:** Detects index drift, missing vector records, or out-of-sync wikilinks, allowing automated repair.

### 🔄 Ingest Fabric & Session Sync Relay
* **Features:** Seamless background synchronization for local IDE chats (Claude Code, Copilot, Cursor).
* **Command:** `npx total-recall relay start`
* **Details:** Watches active IDE workspaces and safely ships raw conversation logs to your remote brain, deduplicating entries via content SHA-256 fingerprint hashing.

---

## 3. Interactive Offline Help System
To query documentation, VFS specifications, or CLI usage instantly without file hunting, you can run:

```bash
# General help utility and subcommands menu
npx total-recall help

# Print a specific subcommand's description, options, and examples
npx total-recall help <command> (e.g., npx total-recall help connect)

# Query system architecture specifications
npx total-recall help architecture

# Query SSSS syntax rules and schemas
npx total-recall help ssss
```

* **Programmatic AI Retrieval:** AI agents can query the help system using the `--json` or `-j` flag:
  `npx total-recall help <command> --json`
  This returns structured JSON specs outlining the command's flags, client modes, and examples, ensuring full operational precision.

---

## 4. Core Command Reference

### `init`
* **Purpose:** Bootstrap VFS into a project.
* **Usage:** `npx total-recall init`

### `connect`
* **Purpose:** Link Cursor, Claude Code, Codex, Windsurf, Aider, or Obsidian to your brain.
* **Usage:** `npx total-recall connect <client> [options]`

### `deploy`
* **Purpose:** Provision a server stack (Ollama, Caddy, Cloudflare tunnels, etc.).
* **Usage:** `npx total-recall deploy`

### `compile` (alias: `rebuild`)
* **Purpose:** Rebuild system projections, canvas canvases, and compiled instructions shims (`INSTRUCTIONS.md`).
* **Usage:** `npx total-recall compile`

### `dream`
* **Purpose:** Trigger REM sleep consolidation (deduplication, confidence score decay).
* **Usage:** `npx total-recall dream`

### `research`
* **Purpose:** Manage autonomous background research queue tasks.
* **Usage:** `npx total-recall research <list|add|show|report|cancel>`

### `daemon`
* **Purpose:** Manage background scheduler task daemon.
* **Usage:** `npx total-recall daemon <start|stop|status>`

### `relay`
* **Purpose:** Manage local IDE session synchronizer.
* **Usage:** `npx total-recall relay <start|stop|status|once>`

### `uninstall`
* **Purpose:** Clean, git-safe system cleanup.
* **Usage:** `npx total-recall uninstall`

### `config`
* **Purpose:** Dynamically read, write, and toggle UI, security, and budget settings (acting as the command-line control harness).
* **Usage:**
  - `npx total-recall config get [key]` - Read the active value of a specific setting, or list all configured settings.
  - `npx total-recall config set <key> <value>` - Cast, validate, and write a setting to `security.yml` or `budget.yml`.

---

## 5. Dynamic Integrations
You can instantly deploy any custom REST API as a first-class CLI subcommand by adding an integration Markdown node:
* **Path:** `.agent/skills/total-recall/integrations/<serviceName>.md`
* **Routing:** Unrecognized CLI commands automatically look up this path. If found, the integration dispatcher binds your terminal arguments dynamically, signs headers with env credentials, and executes the request instantly.

# CLI Reference Guide

- **Plane**: Reference
- **Last Updated**: 2026-05-18
- **Summary**: Comprehensive reference for all `npx total-recall` commands available in the Sovereign OS.

---

## Global Options

- `--help, -h`: Print command-specific usage and flags.
- `--version, -v`: Print the installed version of the CLI.

---

## Command List

### `init`

Initialize the `~/.agent/` vault and `INSTRUCTIONS.md` in the current directory.

- **What it does**: Creates the vault directory structure, seeds the SSSS schema skill, and writes an initial `INSTRUCTIONS.md` compilation target.
- **Usage**: `npx total-recall init`

---

### `setup`

Interactive wizard for first-time deployment.

- **What it does**: Asks which cloud provider you want, scrapes provider docs, collects your API key (masked input, never logged), provisions the server, installs Ollama + the default model, then asks which IDEs and chat apps to connect.
- **Usage**: `npx total-recall setup`

---

### `connect`

Wire an IDE or external system to your brain.

- **Usage**: `npx total-recall connect <client> [options]`
- **Clients**: `cursor`, `claude-code`, `codex`, `antigravity`, `gemini`, `windsurf`, `aider`, `ultrachat`, `obsidian`, `generic`

**Options:**

| Flag | Description |
|------|-------------|
| `--brain <url>` | Remote brain base URL (for API/MCP clients) |
| `--token <token>` | Bearer PAT to embed in generated config snippets |
| `--vault <path>` | Obsidian vault path (auto-detected on macOS if omitted) |
| `--force` | Overwrite existing projection files |
| `--json` | Emit machine-readable JSON output |

**Examples:**

```bash
# Local IDE (symlink only)
npx total-recall connect claude-code
npx total-recall connect codex
npx total-recall connect obsidian

# Remote brain
npx total-recall connect claude-code --brain https://brain.example.com --token sk-...
npx total-recall connect ultrachat --brain https://brain.example.com --token sk-...
```

**File-mode clients** (cursor, windsurf, aider) write a rendered file from your current `INSTRUCTIONS.md`. Run `compile` first if your vault is out of date.

**Symlink-mode clients** (claude-code, codex, antigravity, gemini) create a symlink from the expected filename to `INSTRUCTIONS.md`.

**Vault-mode** (obsidian) symlinks `~/.agent/memory-vault/` into your Obsidian vault and installs Dataview query dashboards.

---

### `deploy`

Provision a server to run the full Sovereign OS stack.

- **What it does**: Installs Ollama, pulls the configured model (default: `gemma4:26b`), scaffolds the VFS, configures Caddy for auto-TLS, and sets up a cron trigger for the Cloud Agent.
- **Usage**: `npx total-recall deploy`

---

### `compile`

Rebuild `INSTRUCTIONS.md` from vault nodes.

- **What it does**: Scans `~/.agent/memory-vault/`, resolves `[[wikilinks]]` to markdown links, renders the injection block, and writes `INSTRUCTIONS.md`. Also regenerates `memory-vault/graph.canvas` for Obsidian Canvas view.
- **Alias**: `rebuild`
- **Usage**: `npx total-recall compile`

---

### `dream`

Manually trigger a Dream Cycle.

- **What it does**: Runs the Light → REM → Deep sleep consolidation pass: extracts patterns, flags duplicates, decays confidence scores, and writes a daily note to `memory-vault/daily/YYYY-MM-DD.md`.
- **Usage**: `npx total-recall dream`

---

### `research`

Manage, query, or queue ongoing autonomous research projects.

- **What it does**: Interacts directly with the Sovereign AI OS research engine queue. It supports viewing a color-coded agenda, enqueuing new topics, checking task phases, showing updated conclusions/ongoing directions, reading full raw report documents, and cancelling pending/running tasks.
- **Usage**: `npx total-recall research <command> [options]`
- **Commands**:
  - `list` (default): Stunning, color-coded, border-framed terminal dashboard of active, pending, completed, and failed research tasks.
  - `add "<topic>"`: Enqueues a new topic for research.
  - `status`: Clean summary count of all states and phases.
  - `show <id-or-topic>`: Beautiful, detailed dashboard showing conclusions, active phase, gaps, and ongoing directions for a project.
  - `report <id-or-topic>`: Read the full raw Markdown report directly from the vault (supports staged and promoted facts).
  - `cancel <id>`: Cancel and remove a project.

**Options:**

| Flag | Description |
|------|-------------|
| `--priority <low|medium|high>` | Priority for newly added research (default: medium) |
| `--notes "<text>"` | Initialization notes for the topic |
| `--status <status>` | Filter the list command by status (pending, in_progress, done, failed) |
| `--query "<text>"` | Filter list items by matching text query |

**Examples:**

```bash
# List all ongoing research
npx total-recall research list

# Queue a new topic
npx total-recall research add "Ollama performance tuning for gemma2" --priority high

# View a project's conclusions & directions
npx total-recall research show "gemma2"

# Read the full raw markdown report
npx total-recall research report "gemma2"
```

---

### `lint`

Validate all vault nodes against the SSSS v2 schema.

- **Usage**: `npx total-recall lint`

---

### `backup`

Create a local archive snapshot, push a git-based vault diff, or sync with an Obsidian vault.

- **What it does**: Compresses, encrypts, or git-commits the local `~/.agent/` VFS based on your parameters.
- **Usage**: `npx total-recall backup [options]`

**Options:**

| Flag | Description |
|------|-------------|
| `--output, -o <path>` | Destination archive path (defaults to a timestamped file in your home folder) |
| `--no-encrypt` | Compresses the VFS without password-based symmetric GPG encryption (.tar.gz) |
| `--push-git <remote>` | Commits the entire SSSS vault to a git remote repository and pushes it (diff-based, sovereign backup pattern) |
| `--obsidian <path>` | Performs an incremental `rsync` sync of your `memory-vault/` directly into an Obsidian vault folder for automatic cloud backup (e.g. via iCloud/Obsidian Sync) |

**Examples:**

```bash
# Encrypted tarball
npx total-recall backup

# Git-based push to custom repository
npx total-recall backup --push-git git@github.com:username/total-recall-brain.git

# Obsidian vault sync
npx total-recall backup --obsidian "~/Documents/Obsidian Vault"
```

---

### `restore`

Restore from an encrypted backup.

- **Usage**: `npx total-recall restore <path-to-tarball>`

---

### `sync`

Pull compiled instructions from a remote brain.

- **Usage**: `npx total-recall sync --brain https://your-server.com --token YOUR_PAT`

---

### `status`

Show brain health summary.

- **What it does**: Reports vault node count, last dream cycle time, connected clients (from `~/.agent/config/clients.json`), and whether the daemon is running.
- **Usage**: `npx total-recall status`

---

### `generate-pat`

Create a Bearer Personal Access Token for API and IDE authentication.

- **Usage**: `npx total-recall generate-pat`

---

### `hash-password`

Hash a password using Argon2id (for manual `secrets.enc` setup).

- **Usage**: `npx total-recall hash-password`

---

### `daemon`

Manage the background Dream Cycle daemon.

- **Commands**: `start`, `stop`, `status`
- **Usage**: `npx total-recall daemon status`

---

### `friction`

Analyze watchdog logs for workflow bottlenecks.

- **What it does**: Parses JSONL logs and generates a health report highlighting tasks with high failure rates or slow latencies.
- **Usage**: `npx total-recall friction`

---

### `chat`

Interactive terminal REPL connected to the brain.

- **Usage**: `npx total-recall chat`

---

### `relay`

Manage the background session sync relay daemon.

- **What it does**: Runs on the user's local machine, watching active IDE session storage directories (Claude Code, Codex, Antigravity, VS Code Copilot, Cursor). Whenever new chat sessions or history changes are detected, they are automatically shipped to the remote brain API to be compiled and digested into SSSS memory nodes.
- **Commands**:
  - `start`: Start the local relay daemon in the background.
  - `stop`: Stop the local relay daemon.
  - `status`: Show relay status, process ID, and last sync timestamps.
  - `once`: Execute a single one-shot scan and sync pass (useful for testing or CI pipelines).
  - `install`: Register and load the relay service to start automatically (macOS LaunchAgent or Linux systemd --user service).
  - `uninstall`: Unload and remove the auto-start service registration.
- **Usage**:
  ```bash
  npx total-recall relay status
  npx total-recall relay start
  ```

---

### `config`

Read, write, and manage dashboard, security, and budget settings dynamically in-process.

- **What it does**: Direct command-line utility to query or update system configurations (such as YOLO mode, daily/weekly USD caps, and allowed origins) in the brain layer's YAML files. Hot-reloads values dynamically.
- **Usage**:
  ```bash
  npx total-recall config get <key>
  npx total-recall config set <key> <value>
  ```
- **Examples**:
  ```bash
  npx total-recall config get yolo_mode
  npx total-recall config set daily_cap_usd 15.0
  npx total-recall config set allowed_origins http://localhost:5173,http://localhost:8080
  ```

---

### `skill`

Browse, install, security audit, list, and remove portable agent capabilities from the skills.sh registry.

- **What it does**: Complete command-line integration with the skills.sh cloud registry. Automatically intercepts package downloads, executes static analysis scans (quarantining dynamic shell injections and network risks), scaffolds Spec v2.0 directories, and hot-recompiles active workspace shims.
- **Commands**:
  - `find <query>`: Search skills.sh registry sorted by absolute installs rating.
  - `install <package>`: Download a skill, run static security scan, scaffold directories, and compile shims.
  - `scan <skill-name>`: Run static security audit on a local skill folder.
  - `list` (or `ls`): List all active local parent skills and nested sub-skills.
  - `remove <skill-name>` (or `rm`): Safely delete a local skill and re-compile workspace shims.
- **Usage**:
  ```bash
  npx total-recall skill find git
  npx total-recall skill install github/awesome-copilot@git-commit
  npx total-recall skill scan total-recall
  npx total-recall skill list
  npx total-recall skill remove git-commit
  ```

---

### `uninstall`

Completely stop, disable, and clean up Total Recall services and active directories from the system.

- **What it does**:
  1. Stops all running background Node.js processes (`daemon`, `relay`, etc.).
  2. Unloads and deletes background startup agents from the operating system (macOS launchd plists and Linux systemd services).
  3. Cleanly purges local IDE configuration rules, symlinks, and shims (`.clauderules`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `INSTRUCTIONS.md`) without affecting non-Total Recall settings.
  4. Purges transient cache, sessions, and log subfolders in local workspaces.
  5. Purges the global configuration directory (`~/.agent/`).
  6. **Safe for Dev Workspaces**: Preserves version-controlled `.agent/skills/` and `.agent/memory-vault/` files within active git project repositories to prevent any data loss of your custom instructions and memories.
- **Usage**: `npx total-recall uninstall`

---

## Removed Commands

These commands appeared in earlier documentation but have been removed:

| Command | Replacement |
|---------|-------------|
| `reindex` | Use `compile` (alias: `rebuild`) |
| `export` | Use `backup` |
| `import` | Use `restore` |
| `finetune` | Removed — use Unsloth directly on your vault data |
| `upgrade` | Use `ollama pull <model>` then update `runtime.yml` |

---

## Configuration & Environment Variables Reference

Total Recall is completely customized and overridden through environment variables and local YAML/JSON configuration files.

### 1. ⚙️ Environment Variables (Env overrides)

| Env Variable | Type | Default | Description |
|--------------|------|---------|-------------|
| `AGENT_DIR` | String | `~/.agent` | Root workspace directory holding IDE shims and skills VFS. |
| `TR_CLI_AGENT` | String | `antigravity` | Preferred CLI reasoning agent (`antigravity`, `gemini`, `claude`, `codex`). |
| `TR_CLI_MODEL` | String | `null` | Explicit model identifier string override passed to the active CLI agent. |
| `TR_CLI_TIMEOUT` | Integer | `300` | Subprocess command execution timeout in seconds. |
| `GOOGLE_API_KEY` | String | `null` | Primary API key for Gemini embeddings (`gemini-embedding-2`). |
| `TR_EMBED_MODEL`| String | `gemini-embedding-2` | Standard embedding model name used for vector checks. |
| `SEARXNG_BASE_URL`| String | `null` | Base URL for SearXNG web searches (e.g. `http://127.0.0.1:8888`). |
| `BRAVE_SEARCH_API_KEY` | String | `null` | Brave search key used as a fallback for web searches. |
| `EXA_API_KEY` | String | `null` | Exa.ai API key for neural searching. |
| `GITHUB_TOKEN` | String | `null` | GitHub token used for dynamic SSSS repository actions. |
| `SERPER_API_KEY`| String | `null` | Google Search API key fallback. |
| `TAVILY_API_KEY`| String | `null` | Tavily Search API key fallback. |
| `TR_DAILY_SEARCH_LIMIT` | Integer | `50` | Maximum allowed web search actions per day. |
| `RESEARCH_COOLDOWN_MS` | Integer | `3600000` | Cooldown period between background research queue executions (1hr). |
| `SESSION_SECRET`| String | `null` | Cryptographic secret used to sign admin cookies. |
| `NODE_ENV` | String | `production` | Active runtime Node environment (`development` / `production`). |
| `PORT` | Integer | `3000` | Rest server port binding. |
| `HOST` | String | `127.0.0.1` | Rest server host address binding. |
| `DISPLAY` | String | `null` | X11 display pointer for computer use screenshots. |
| `TOTAL_RECALL_TOKEN` | String | `null` | Secret token to authenticate headless client commands. |
| `TR_BRAIN` | String | `null` | Overrides the detected workspace project brain path. |
| `TR_PAT` | String | `null` | Injects your Personal Access Token directly to authenticate connections. |

### 2. 📁 Configuration Files (YAML / JSON)
All file parameters live under `.agent/config/` (or `.agent/skills/total-recall/config/`):

#### **`budget.yml`** (Cost Control)
* `daily_cap_usd`: Strict daily dollar cap threshold for API costs (default: `5.00`).
* `weekly_cap_usd`: Strict weekly dollar cap threshold for API costs (default: `25.00`).

#### **`security.yml`** (Admin Access & Network)
* `dashboard.password_hash`: Secure bcrypt password hash for dashboard login.
* `dashboard.session_timeout_seconds`: Inactive user session timeout (default: `86400`).
* `network.allowed_origins`: Allowed CORS origins for external API access.
* `network.bind_address`: Binding address for interface routing.

#### **`agents.yml`** (CLI Agents Registry)
Exposes the prioritized CLI execution pipeline:
* `agents`: A list of registered reasoning agents:
  * `name`: Custom unique identifier.
  * `binary`: Command-line executable matching PATH.
  * `enabled`: Set to `false` to prevent dispatching to this agent.
  * `priority`: Integer weighting (lower value takes priority).
  * `flags`: Standard CLI options appended to reasoning invocations.
  * `exec`: Dispatch pattern (`flag` or `subcommand`).

#### **`secrets.enc`** (GPG Encrypted Credentials)
* Holds raw tokens (`github_token`, `google_api_key`, `openai_api_key`) to prevent plaintext exposure, GPG sym-encrypted during installation.


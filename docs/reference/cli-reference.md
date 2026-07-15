# Total Recall — CLI Reference Guide

Comprehensive reference manual for all `npx total-recall` commands, parameters, environment overrides, and configuration files in the AI OS.

---

## 🌐 Global Options

- `--help, -h`: Print command-specific usage guides and available flags.
- `--version, -v`: Display the installed version of the Total Recall CLI.

---

## 🛠️ CLI Command Catalog

### `init`
Configure and provision the initial local virtual file system schemas.
- **What it does**: Prompts for model preferences, issues authorized Bearer PAT tokens, builds setup configs, and copies master control skills into place.
- **Usage**:
  ```bash
  npx total-recall init [options]
  ```
- **Options**:
  - `--project`: Initialize a project-local brain layer inside your active repository (`<repo>/.agent/skills/total-recall/`) instead of the default global layer.

---

### `setup`
Interactive terminal-based setup wizard.
- **What it does**: Welcomes the developer, guides you through provider authentication keys (AES encrypted), configures domain and port variables, and registers IDE integrations and first-time security tokens interactively in the terminal.
- **Usage**:
  ```bash
  npx total-recall setup
  ```
- **Note**: For a premium graphical browser-based installation experience, use the `deploy --ui` command instead.

---

### `deploy`
Deploy and configure system service layers, platform autostart files, or launch the Browser Setup Wizard.
- **What it does**: Registers daemon startup plists (macOS launchd) or services (Linux systemd), configures Caddy for auto-managed Let's Encrypt TLS, structures the VFS folders, and schedules backups. If `--ui` is specified, it bypasses terminal prompt loops and starts a local Express server to host the graphical HTML Setup Wizard.
- **Usage**:
  ```bash
  npx total-recall deploy [options]
  ```
- **Options**:
  - `--backup-repo <git-url>`: Configures an automatic daily remote backup git URL.
  - `--ui`: Launches the premium **Browser Setup Wizard** (`wizard.html` served by `deploy-ui.mjs`). This serves a visual dashboard at `http://localhost:3000` (or next free port) and automatically opens it in your default macOS/Linux web browser. Features a glassmorphic multi-phase setup for deployment locations (Local, Network, Vast.ai GPU Cloud, VPS), SSL, PAT keys management, automatic private GitHub backup configurations, and checkboxes for Claude Code, Cursor, Codex, etc., with live logs. Now includes an integrated **CLI Agents Setup & Installer** card supporting dynamic local/remote programmatic agent installations and linking (`npm install -g`, `npm link`, and OAuth credentials onboarding) via secure `/api/install-cli` API dispatches. To ensure absolute reliability, the wizard integrates **resilient dual-layer state persistence** (saving to browser `safeStorage` and syncing securely to server disk in `wizard-config.json` via `/api/save-wizard-config`), a **floating persistent status bar** (`#persistent-install-bar`) with dynamic SSE log reconnection, and **fully interactive clickable sidebar step navigation** (`#step-nav li`).
  - `--ui-port <number>`: Manually specify the port for hosting the browser setup wizard server (default: 3000, increments dynamically if occupied).

---

### `connect`
Wire an IDE editor or client application to your remote brain.
- **Usage**:
  ```bash
  npx total-recall connect <client> [options]
  ```
- **Clients**: `claude-code`, `cursor`, `codex`, `antigravity`, `gemini`, `aider`, `http-api`, `obsidian`, `generic`
- **Options**:
  - `--brain <url>`: remote brain API base URL.
  - `--token <pat>`: Personal Access Token to embed in generated config targets.
  - `--vault <path>`: Obsidian vault target directory path.
  - `--force`: Overwrite existing projection and rules files.

*Symlink clients (`claude-code`, `codex`, `antigravity`, `gemini`) create a platform symlink linking editor shims (like `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`) to the compiled rules. File-based clients (`cursor`, `aider`) write standard rule files directly.*

---

### `remember`
Autonomously learn and save a new memory node to the vault.
- **What it does**: Accepts facts or instructions and writes a canonical SSSS Markdown file with semantic Zod-conforming frontmatter. Re-compiles shims automatically.
- **Usage**:
  ```bash
  npx total-recall remember <category> "<content>" [options]
  ```
- **Categories**: `invariant`, `preference`, `anti-pattern`, `pattern`, `decision`, `concept`, `fact`, `lore`
- **Options**:
  - `--global`: Force-write to the global brain layer vault (`~/.agent/skills/total-recall/`).
  - `--project`: Force-write to the project brain layer vault (`<repo>/.agent/skills/total-recall/`).
  - `--tags, -t <list>`: Comma-separated list of tags.
  - `--importance, -i <1-5>`: Weighting score (default: 3).
  - `--priority <normal|high|absolute>`: Rule priority level (default: normal).
  - `--modality <must|must_not|should|should_not>`: Rule enforcement modality.
  - `--confidence <0.0-1.0>`: Initial confidence value.
  - `--slug <name>`: Custom kebab-case slug descriptor.

*If no layer flag is provided, the CLI auto-detects resolution targeting based on the category (e.g. invariants and preferences map globally; facts and decisions map locally to active projects).*

---

### `recall`
Perform Vector Semantic Search or exact keyword queries across memory layers.
- **What it does**: Queries the local semantic vector embedding files, prints cosine-similarity rankings, and resolves session history traces.
- **Usage**:
  ```bash
  npx total-recall recall "<query>" [options]
  ```
- **Options**:
  - `--global`: Query the global layer only.
  - `--project`: Query the local project layer only.
  - `--top-k, -k <number>`: Number of results to return (default: 5).
  - `--no-sessions, -ns`: Exclude ingested session archives from search results.
  - `--category <name>`: Filter results by SSSS category.
  - `--tags <list>`: Filter by comma-separated tags list.

---

### `compile`
Rebuilds the `INSTRUCTIONS.md` and associated IDE client shims from the canonical memory vault nodes.
- **What it does**: Reads all valid `invariant`, `preference`, and `correction` nodes. Discards expired notes. Injects the entire **Installed Agent Skills** inventory (`.agent/skills/`) and the OpenWiki summary. Automatically updates `.cursorrules`, `CLAUDE.md`, `AGENTS.md`, and all other active environment shims.
- **Usage**:
  ```bash
  npx total-recall compile [options]
  ```
- **Options**:
  - `--force`: Force overwrite immutable invariants and shims.

---

### `rebuild`
Performs a deep, cold-start re-compilation of the surface projection.
- **What it does**: Completely discards the `memory-derived/` cached indexes. Parses the entire `memory-vault/` from scratch, rebuilds the embedding indexes asynchronously, and then triggers `compile` to inject the instructions, skills, and OpenWiki summaries.
- **Usage**:
  ```bash
  npx total-recall rebuild
  ```

---

### `dream`
Trigger an immediate execution of the background consolidation Dream Cycle.
- **What it does**: Performs garbage-collection on confidence scores, indexes recent relays, resolves pending conflicts, and generates a daily summary journal in your vault (`daily/YYYY-MM-DD.md`).
- **Usage**:
  ```bash
  npx total-recall dream
  ```

---

### `research`
Manage, query, or queue autonomous background research projects.
- **Usage**:
  ```bash
  npx total-recall research <command> [options]
  ```
- **Commands**:
  - `list`: Render a color-coded terminal dashboard of pending, active, completed, and failed research tasks.
  - `add "<topic>"`: Queue a new topic for the research daemon.
  - `status`: Clean summary count of all states and phases.
  - `show <id-or-topic>`: Detailed dashboard showing conclusions, active phase, gaps, and ongoing directions for a project.
  - `report <id-or-topic>`: Read the full raw Markdown report directly from the vault.
  - `cancel <id>`: Cancel and remove a task.
- **Options**:
  - `--global`: Query/add to the global research queue.
  - `--project`: Query/add to the project research queue.
  - `--priority <low|medium|high>`: Priority weighting (default: medium).
  - `--notes "<text>"`: Contextual notes for the research engine.

---

### `lint`
Validate all vault Markdown nodes against SSSS v2 Zod schema constraints, or check for OKF metadata compliance.
- **Usage**:
  ```bash
  npx total-recall lint [options]
  ```
- **Options**:
  - `--strict`: Treat warnings as errors (exit 1 on any issue).
  - `--okf`: Verify OKF v0.1 draft metadata compliance (checks for title, description, tags, and updated timestamp).
  - `--json`: Output results as JSONL.
  - `--vault <path>`: Override vault directory (default: ~/.agent/memory-vault).

---

### `ingest`
Ingest external data sources or IDE conversation logs into Total Recall.
- **Usage**:
  ```bash
  npx total-recall ingest [options]
  npx total-recall ingest google-takeout <path> [options]
  npx total-recall ingest okf <bundle-path> [options]
  ```
- **Ingestion sources**:
  - IDE conversation histories are scanned from Claude Code, OpenAI Codex, Gemini CLI, Antigravity, and Cursor.
- **Options for `okf`**:
  - `<bundle-path>`: Path to the OKF bundle directory.
  - `--dry-run`: Pre-flight check and validate concepts without writing.
  - `--category <name>`: Override and force category for all imported concepts.
  - `--importance <1-5>`: Override default importance level (default: 3).
  - `--on-conflict <skip|warn|overwrite>`: Strategy for duplicate slugs (default: warn).
  - `--type-map <mapping>`: Custom type mappings. Format: "Type A=facts,Type B=concepts".
  - `--global`: Target the global brain.
  - `--project`: Target the project brain.

---

### `export`
Export a Total Recall knowledge base to external formats.
- **Usage**:
  ```bash
  npx total-recall export <output-path> --okf [options]
  ```
- **Options**:
  - `--okf`: Export as an Open Knowledge Format (OKF) bundle (required).
  - `--format <dir|tar.gz>`: Output format: directory or compressed tarball (default: dir).
  - `--strip-ssss`: Remove all SSSS-specific metadata fields, leaving only pure OKF.
  - `--global`: Source from the global brain.
  - `--project`: Source from the project brain (default).

---

### `backup`
Create local encrypted archives or push diffs to a remote private git repository.
- **Usage**:
  ```bash
  npx total-recall backup [options]
  ```
- **Options**:
  - `--global`: Back up global brain layer.
  - `--project`: Back up project brain layer.
  - `--push-git <remote-url>`: Initiates a secure diff git commit and pushes to the designated repository remote.
  - `--obsidian <path>`: Runs rsync mirroring memory vault directly to your Obsidian directory.
  - `--no-encrypt`: Skips GPG symmetric password encryption (saves as standard `.tar.gz` instead of `.tar.gpg`).

---

### `restore`
Restore your virtual file system from a password-encrypted tarball backup.
- **Usage**:
  ```bash
  npx total-recall restore <path-to-archive>
  ```

---

### `sync`
Pull compiled instruction shims and master files from a remote brain.
- **Usage**:
  ```bash
  npx total-recall sync --brain <url> --token <pat>
  ```

---

### `status`
Verify system health, connected clients registry, and daemon loops.
- **Usage**:
  ```bash
  npx total-recall status [options]
  ```
- **Options**:
  - `--json`: Emit machine-readable system metrics.

---

### `key`
Issue labels and grant scoped Bearer Personal Access Tokens (PATs).
- **Usage**:
  ```bash
  npx total-recall key create <name> [options]
  npx total-recall key list
  npx total-recall key rotate <id>
  npx total-recall key revoke <id>
  ```
- **Options for create**:
  - `--scope <list>`: Comma-separated access scopes (e.g., `chat:read,memory:write`). Default: `*`.
  - `--expires <date>`: ISO date (`2026-06-01`) or relative days (`30d`).

---

### `secret`
Manage API keys and credentials (stored in `secrets.enc`, not in the memory vault).
- **Usage**:
  ```bash
  npx total-recall secret set <key> <value> [options]
  npx total-recall secret generate <key> [--bytes 32] [--format hex|base64url]
  npx total-recall secret get <key>
  npx total-recall secret list
  npx total-recall secret rotate <key> <value>
  npx total-recall secret delete <key>
  ```
- **Options for set**:
  - `--provider <name>`: E.g., openai, anthropic.
  - `--scope <global|project>`: Scope the secret.

---

### `daemon`
Manage the background Dream Cycle service.
- **Usage**:
  ```bash
  npx total-recall daemon <start|stop|status>
  ```

---

### `relay`
Manage the background local workstation session watch relay.
- **Usage**:
  ```bash
  npx total-recall relay <start|stop|status|once|install|uninstall>
  ```
- **Commands**:
  - `start`/`stop`: Run or kill the process manually.
  - `status`: Show process IDs and last sync execution timestamps.
  - `once`: Perform a single session scan and push pass.
  - `install`/`uninstall`: Register or remove launchd plist auto-start entries.

---

### `config`
Read, write, or hot-reload configurations dynamically in-process.
- **Usage**:
  ```bash
  npx total-recall config <get|set> <key> [value]
  ```
- **Examples**:
  ```bash
  npx total-recall config set daily_cap_usd 10.0
  npx total-recall config get yolo_mode
  ```

---

### `skill`
Search, install, security audit, and remove packages from the skills.sh registry.
- **Usage**:
  ```bash
  npx total-recall skill <command> [options]
  ```
- **Commands**:
  - `find <query>`: Query skills.sh sorted by installs rating.
  - `install <pkg>`: Download a skill, run static security analysis, and scaffold directories.
  - `scan <skill-name>`: Trigger a static security vulnerability audit.
  - `list` (or `ls`): Enumerate all active parent skills and sub-skills.
  - `remove <name>` (or `rm`): Safely delete a skill and re-compile rules.

---

### `command`
Manage custom project-local CLI commands dynamically.
- **What it does**: Writes or removes executable `.mjs` scripts in your project's local brain (`.agent/commands/`), allowing you to extend `total-recall` with project-specific orchestration logic.
- **Usage**:
  ```bash
  npx total-recall command <create|remove> <name> ["<code>"]
  ```
- **Commands**:
  - `create <name> "<code>"`: Instantiates a new executable CLI subcommand within the active project.
  - `remove <name>`: Deletes a previously instantiated project-local subcommand.

---

### `uninstall`
Completely purge background services, configurations, and shims.
- **What it does**: Stops background Relays and Daemons, unregisters macOS launchd plists/Linux systemd user units, removes editor shims, and deletes global configs.
- **Usage**:
  ```bash
  npx total-recall uninstall
  ```
> [!IMPORTANT]
> **Git Preservation Boundaries:**
> The uninstaller **preserves** local `.agent/skills/` and `.agent/memory-vault/` directories inside active git-tracked repositories to prevent instructional memory loss.

---

### `collab`
Start the Express + WebSockets collaboration server and Vite/React browser simulation portal.
- **What it does**: Spins up the user management, group sharing database, persistent page-tied annotation registry, and live WebSockets channel connection router concurrently in one terminal wrapper.
- **Usage**:
  ```bash
  npx total-recall collab
  ```

---

### `brain`
Switch the active memory vault or display the current context.
- **Usage**: `npx total-recall brain [switch <path>]`

### `chat`
Launch an interactive CLI agent session connected to the active brain.
- **Usage**: `npx total-recall chat`

### `deploy-ui`
Build and deploy the React frontend dashboard locally.
- **Usage**: `npx total-recall deploy-ui`

### `doctor`
Run comprehensive health checks on the agent environment and repair broken symlinks or missing configurations.
- **Usage**: `npx total-recall doctor`

### `forget`
Delete a specific memory node from the vault.
- **Usage**: `npx total-recall forget <slug>`

### `friction`
Record a developer friction event or annoyance for the agent to optimize later.
- **Usage**: `npx total-recall friction "The build takes too long"`

### `generate-pat`
Generate a new Personal Access Token (PAT) for API usage.
- **Usage**: `npx total-recall generate-pat`

### `hash-password`
Hash a plaintext password for manual entry into `security.yml`.
- **Usage**: `npx total-recall hash-password <password>`

### `import-rules`
Import legacy markdown rules or `.cursorrules` into the structured memory vault.
- **Usage**: `npx total-recall import-rules <path>`

### `map`
Generate a visual CLI tree map of the current memory vault structure.
- **Usage**: `npx total-recall map`

### `migrate`
Run schema migrations to upgrade older SSSS layouts to the current specification.
- **Usage**: `npx total-recall migrate`

### `reset-password`
Reset the admin UI dashboard password interactively.
- **Usage**: `npx total-recall reset-password`

### `share`
Export a specific memory node to a shareable markdown format.
- **Usage**: `npx total-recall share <slug>`

### `snapshot`
Create a point-in-time archive of the current memory vault state.
- **Usage**: `npx total-recall snapshot`

### `start`
Start the primary REST API daemon process in the foreground.
- **Usage**: `npx total-recall start`

### `task`
Manage background CLI agent tasks.
- **Usage**: `npx total-recall task [list|kill]`

### `upgrade`
Pull the latest Total Recall system version and run self-update routines.
- **Usage**: `npx total-recall upgrade`

---

## ⚙️ Environment Variables (Env Overrides)

| Env Variable | Type | Default | Subsystem / Purpose |
| :--- | :--- | :--- | :--- |
| `AGENT_DIR` | String | `~/.agent` | Scaffolding directory root holding IDE shims and skills. |
| `TR_CLI_AGENT` | String | `antigravity` | Preferred CLI reasoning agent (`antigravity`, `gemini`, `claude`, `codex`). |
| `TR_CLI_MODEL` | String | `null` | Explicit model string override passed to the dispatched subagent. Supports `agent:submodel` format (e.g. `gemini:gemini-3.5-flash`) to specify both the agent and model dynamically. |
| `TR_CLI_TIMEOUT` | Integer | `300` | Process execution timeout threshold in seconds. |
| `GOOGLE_API_KEY` | String | `null` | Key for high-fidelity Gemini embedding generations. |
| `TR_EMBED_MODEL` | String | `gemini-embedding-2` | Preferred embedding model target. |
| `SESSION_SECRET` | String | `null` | Secret utilized to sign admin authentication cookies. |
| `PORT` | Integer | `3000` | Binding port for the Express REST server. |
| `HOST` | String | `127.0.0.1` | Loopback bind address configuration. |
| `TR_BRAIN` | String | `null` | Overrides active project local brain path detection. |
| `TR_PAT` | String | `null` | Authenticates remote REST commands directly. |
| `TR_DAILY_SEARCH_LIMIT`| Integer | `50` | Maximum daily outbound Google/Brave web search limit. |
| `XDG_CONFIG_HOME` | String | `~/.config` | Alternative configuration path pointer. |

---

## 📁 System Configuration Files

All JSON and YAML files reside securely under the consolidated meta-skill config path:  
`~/.agent/skills/total-recall/config/` (Global) or `<repo>/.agent/skills/total-recall/config/` (Project).

### `budget.yml` (USD Cost Caps)
Enforces outbound token caps. Updates reload dynamically:
```yaml
daily_cap_usd: 5.00     # Daily USD spending limit
weekly_cap_usd: 25.00   # Weekly USD spending limit
```

### `security.yml` (Sandbox & Access Control)
```yaml
dashboard:
  password_hash: $2b$12$R9...   # bcrypt-cost: 12 password hash
  session_timeout_seconds: 86400
sandbox:
  enabled: false                 # Hardened Sandbox defaults off for maximum safety
network:
  allowed_origins:
    - http://localhost:5173
```

### `agents.yml` (Prioritized CLI Agents Registry)
Defines the headless cognitive execution pipeline:
```yaml
agents:
  - name: gemini
    binary: gemini-cli
    enabled: true
    priority: 10
    flags: ["--non-interactive"]
  - name: claude
    binary: claude-code
    enabled: true
    priority: 20
```

### `secrets.enc` (AES Encrypted Credentials)
- Secure, GPG symmetrically password-encrypted binary container enclosing environment tokens (`google_api_key`, `github_token`, `openai_api_key`) with owner-only `0o600` access modes. Plaintext keys are never written to disk.

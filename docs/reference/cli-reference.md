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
- **Clients**: `claude-code`, `cursor`, `codex`, `antigravity`, `gemini`, `aider`, `pi`, `hermes`, `dsh`, `openclaw`, `http-api`, `obsidian`, `generic`
- **Options**:
  - `--brain <url>`: remote brain API base URL.
  - `--token <pat>`: Personal Access Token to embed in generated config targets.
  - `--vault <path>`: Obsidian vault target directory path.
  - `--force`: Overwrite existing projection and rules files.

*Symlink clients (`claude-code`, `codex`, `antigravity`, `gemini`, `pi`, `dsh`, `openclaw`) create a platform symlink linking editor shims (like `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`) to the compiled rules. File-based clients (`cursor`, `cline`, `hermes`, `aider`) write standard rule and memory files directly.*

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

### `context`
Assemble applicable required rules for the current task before action.

```sh
total-recall context "task description" --action edit,test
```

CLI and API default to 4,000 estimated tokens. The CLI defaults to compact text;
`--format json` returns a compact machine-readable response. Supporting documents
are opt-in (`--knowledge`; API `include_knowledge: true`). Diagnostic inventories
require `--debug --format json` (API `debug: true`), within the same budget.
Unknown applicability remains required. `ready: false` and exit 2 mean the full
complete output exceeds the budget; never act from a truncated capsule. Status,
metadata, JSON escaping, headings and separators all count. Refresh on task/action/project/rule/skill changes.
Validated memory tags `context:universal` and `context:action:<action>` curate
activation separately from modality. Unknown actions activate rules conservatively.
Supported actions: read, edit, test, build, publish, deploy, secrets, network,
memory, skills and project. The local CLI works without a server.

For explicit local curation, save one project `decision` through the CLI with
tag `context:policy`. Its JSON body contains `rules`, keyed by `project:<slug>`
or `global:<slug>`. Each entry has `source_hash` (from debug `curation_sources`),
`actions` (supported actions or `universal`) and a manually verified `directive`.
Keep every operative constraint; move history and examples to the original,
retrievable rule. A deliberate local exclusion uses `enabled: false` and a
nonempty `reason`. Original bodies and global rules remain intact.
Malformed, conflicting, expired or source-mismatched curation falls back to the
canonical rule. Never generate applicability from semantic ranking. Curation
is private runtime state and must not be included in scaffolds or releases.

### `recall`
Search local metadata and indexed full text across enabled memory layers.
- **What it does**: Searches a disposable local index and reads only selected Markdown documents. Semantic enrichment is opt-in and exact hits bypass providers.
- **Usage**:
  ```bash
  npx total-recall recall "<query>" [options]
  ```
- **Options**:
  - `--global`: Query the global layer only.
  - `--project`: Query the local project layer only.
  - `--top-k, -k <number>`: Number of results to return (default: 5).
  - `--no-sessions, -ns`: Exclude ingested session archives from search results.
  - `--local`: Indexed metadata and body text (default), without a provider.
  - `--fast`: Metadata matches and selective hydration only.
  - `--semantic`: Request semantic enrichment for non-exact queries.
  - `--timings`: Report local index, matching and hydration timing on stderr.
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

### `help`
Read offline documentation shipped with the CLI.
- **Usage**: `total-recall help [daemon|server|startup|research|architecture|ssss|settings] --json`
- `server` selects the `start` documentation; `startup-check` selects `startup`.
- Missing reference files are a package installation failure. Repair from the matching canonical package, then verify installed help; do not invent commands.

### `research`
Queue operations default to the current project brain. Use `--global` explicitly for the daemon's global queue. `list --status pending`, `list --status in_progress`, `status`, `show <id-or-topic>`, and `cancel <full-id>` operate on the selected layer. Clear unfinished jobs only when requested; retain completed reports. After cleanup verify both requested layers and server status.
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

### `mesh`
Control-server (Headscale) mesh administration, cluster capability auditing, and remote execution.
- **Usage**:
  ```bash
  npx total-recall mesh <command> [options]
  ```
- **Commands**:
  - `status`: Show control-server reachability and credentials.
  - `doctor [--json]`: Concurrently audit reachability, runtimes (`node`, `docker`, `git`), and AI harnesses (`agy`, `claude`, `codex`, `gemini`, `ollama`) across all cluster nodes.
  - `nodes`: List registered mesh nodes and resolved network endpoints.
  - `ssh <node> [cmd…]`: Open an interactive or command-bound SSH session using recorded access.
  - `exec <node> [--json] <cmd…>`: Execute non-interactive remote commands over SSH with standardized `$PATH` export and structured exit code output.
  - `access <node>`: Show or configure recorded login account, SSH port, and key path.
  - `access import [--apply]`: Propose and optionally save access configs from `~/.ssh/config`.
  - `preauthkey [--reusable] [--ephemeral]`: Mint enrollment pre-authentication keys for new tailnet devices.
  - `policy <get|set|init-ssh>`: Manage Headscale ACL policies and initialize mesh-wide Tailscale SSH.

---

### `harness`
Meta-Harness orchestration across connected external IDEs, CLI tools, and local neural models.
- **Usage**:
  ```bash
  npx total-recall harness <command> [options]
  ```
- **Commands**:
  - `list`: Inspect all supported developer harnesses (`agy`, `claude`, `codex`, `gemini`, `ollama`) with availability and binary locations.
  - `dispatch <id> [--node <node>] "<task>"`: Headlessly invoke a specific harness with task instructions. Supports cross-mesh execution via `--node` and non-interactive `pipe_stdin` for Ollama models (e.g. `gemma4:latest`).
  - `council "<task>"`: Execute multi-harness consensus deliberations concurrently across all available engines and compare responses.

---

### `agent`
Lightweight process controller for background subagent tasks across local and remote mesh nodes.
- **Usage**:
  ```bash
  npx total-recall agent <command> [options]
  ```
- **Commands**:
  - `list [--json]`: List all running, completed, or failed agent processes from `sessions/agents.json`.
  - `spawn <harness> [--node <node>] [--name <label>] "<task>"`: Spawn an agent task detached in the background with stdout/stderr automatically redirected to session logs.
  - `status [id]`: Display execution state, PID, runtime harness, and log file path.
  - `logs <id> [--tail <n>]`: Stream recent log lines from local storage or over mesh SSH for remote nodes.
  - `kill <id|pid>`: Terminate an active agent process locally or across the mesh.

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

  # Executed rotation (3.22.0+)
  npx total-recall secret rotation-status [--json]
  npx total-recall secret rotate-auto <key> [--export-env]
  npx total-recall secret rotate-browser <key> [--headless] [--print-only]
  npx total-recall secret browser-logout
  ```
- **Options for set**:
  - `--provider <name>`: E.g., openai, anthropic.
  - `--scope <global|project>`: Scope the secret.
- **Rotation classes**: every key resolves to `self_generated` (TR mints it, no
  human), `provider_browser` (TR drives the console), `provider_api`, or
  `manual` (human-only, with a stated reason). `rotation-status` reports
  coverage across the whole vault.
- **`rotate-auto`** picks the method from the key's class. `self_generated`
  keys — `JWT_SECRET`, `DB_PASSWORD`, `*_WEBHOOK_SECRET` and friends — rotate
  fully unattended with no browser at all.
- **Console rotation** uses a persistent Chromium profile at
  `<brain>/browser-profile` (mode `0700`). It holds live provider sessions and is
  as sensitive as `secrets.enc` — never sync it; clear it with `browser-logout`.
  Values are captured from the browser clipboard inside TR's process, shape-checked,
  and verified against the provider API before replacing the old credential.

---

### `daemon`
Manage the background worker independently of the REST server. `status` reports its PID and recent activity; restarting the REST server does not reload the worker.
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
  - `optimize [paths...]`: Audit skill ownership and entrypoint size. Explicit
    `--apply` performs verified lossless extraction; original instructions and
    references are retained. Ambiguous ownership requires review.

### `skill-manager` (installed plugin)

`configure <file>` selects a mesh node and authorized roots from JSON on that
node. `status` reports configuration and the last SSSS report; `audit` inspects
without applying; `optimize` follows the configured `autoApply` preference.
The daemon runs daily at 03:00 local time and processes changed packages only.
See the bundled skill-manager README for global and repository configuration.

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

### `startup`
Check the configured shared runtime or start missing managed local services.
- **Usage**: `total-recall startup check|ensure --json`
- `check` observes server health, authenticated instructions, daemon identity and SSSS tooling separately.
- `ensure` starts only missing configured managed local services. It never restarts a running, unknown or foreign process.
- Health and instructions probes each allow ten seconds and retry a transport failure once. HTTP authorization failures are not retried.
- `--app-check <registered-command>` and optional `--app-start <registered-command>` apply only to explicitly declared commands in the current repository.
- Older packages may use the registered `total-recall startup-check check|ensure --json` compatibility command.
- Use `total-recall status --json` and `total-recall daemon status` for follow-up diagnosis. `doctor` checks installation prerequisites and port availability; an occupied port alone does not prove an unhealthy running service.

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

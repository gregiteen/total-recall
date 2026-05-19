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
- **Clients**: `cursor`, `claude-code`, `codex`, `antigravity`, `gemini`, `windsurf`, `aider`, `ultrachat`, `obsidian`, `mcp`, `generic`

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

### `lint`

Validate all vault nodes against the SSSS v2 schema.

- **Usage**: `npx total-recall lint`

---

### `backup`

Create an encrypted snapshot of the vault.

- **What it does**: Compresses `~/.agent/` and encrypts with AES-256-GCM using the master password.
- **Usage**: `npx total-recall backup`

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

## Removed Commands

These commands appeared in earlier documentation but have been removed:

| Command | Replacement |
|---------|-------------|
| `reindex` | Use `compile` (alias: `rebuild`) |
| `export` | Use `backup` |
| `import` | Use `restore` |
| `finetune` | Removed — use Unsloth directly on your vault data |
| `upgrade` | Use `ollama pull <model>` then update `runtime.yml` |

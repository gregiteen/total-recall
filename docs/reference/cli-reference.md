# CLI Reference Guide

- **Plane**: Reference
- **Last Updated**: 2026-05-12
- **Summary**: Comprehensive reference for all `npx total-recall` commands available in the Sovereign OS.

---

## Global Options
All commands support the following global flags:
- `--help, -h`: Print command-specific usage and flags.
- `--version, -v`: Print the installed version of the CLI.

---

## Command List

### `deploy`
Provisions the target machine (or local environment) to run the Sovereign OS.
- **What it does**: Detects host architecture, installs Ollama, pulls the required models (e.g., Gemma 4), scaffolds the `~/.agent/` Virtual File System (VFS), configures Caddy for HTTPS, and creates `systemd` units (if on Linux).
- **Usage**: `npx total-recall deploy`

### `compile`
Rebuilds the active intelligence surface.
- **What it does**: Scans the SSSS memory vault and regenerates derived search indexes and the compiled `INSTRUCTIONS.md`.
- **Usage**: `npx total-recall compile`

### `dream`
Manually triggers the Dream Cycle consolidation phase.
- **What it does**: Forces the background daemon to run the Light → REM → Deep sleep memory cycles, which extracts patterns, flags duplicates, and decays confidence scores.
- **Usage**: `npx total-recall dream`

### `reindex`
Regenerates all internal caching indexes.
- **What it does**: Deletes existing index files and regenerates them from the raw `.md` memory nodes. Crucial if manual edits are made to the SSSS vault.
- **Usage**: `npx total-recall reindex`

### `lint`
Validates SSSS memory integrity.
- **What it does**: Checks all Markdown nodes in the vault against the v2 Zod schema rules.
- **Usage**: `npx total-recall lint`

### `daemon`
Controls the background watchdog and task scheduler.
- **Commands**: `start`, `stop`, `status`
- **Usage**: `npx total-recall daemon status`

### `backup`
Creates an encrypted backup of the entire sovereign intelligence.
- **What it does**: Compresses the `~/.agent/` VFS and encrypts it via AES-256-GCM using the master password.
- **Usage**: `npx total-recall backup`

### `restore`
Restores the Sovereign OS from an encrypted backup.
- **Usage**: `npx total-recall restore <path-to-tarball>`

### `export`
Creates a portable, unencrypted VFS export.
- **Usage**: `npx total-recall export`

### `import`
Imports a portable VFS structure onto a new host.
- **Usage**: `npx total-recall import <path-to-tarball>`

### `upgrade`
Swaps the underlying kernel model.
- **Usage**: `npx total-recall upgrade --model gemma5-32b`

### `finetune`
Generates a custom QLoRA dataset from the SSSS vault.
- **What it does**: Scrapes high-confidence memory nodes and tasks to output a conversational JSONL dataset suitable for Axolotl or MLX.
- **Usage**: `npx total-recall finetune`

### `friction`
Analyzes watchdog logs for workflow bottlenecks.
- **What it does**: Generates a health report highlighting tasks with high failure rates or slow latencies.
- **Usage**: `npx total-recall friction`

### `chat`
Interactive terminal REPL.
- **What it does**: Launches a direct terminal-based chat interface connected to the active Sovereign OS kernel.
- **Usage**: `npx total-recall chat`

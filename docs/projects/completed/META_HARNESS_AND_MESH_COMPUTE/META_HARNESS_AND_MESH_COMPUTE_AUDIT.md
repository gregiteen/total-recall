# META_HARNESS_AND_MESH_COMPUTE — Audit

> **Project Prefix**: `META_HARNESS_AND_MESH_COMPUTE`  
> **Kanban State**: ✅ Completed  
> **Date**: 2026-09-05  
> **Author**: Antigravity & User  

---

## 1. Executive Summary & Context

Total Recall provides portable memory, auto-compiled rule surfaces, and semantic search for AI-assisted software engineering. While individual AI coding harnesses (Google Antigravity, Claude Code, OpenAI Codex, Gemini CLI) run inside separate terminal windows or editor interfaces, developers previously lacked:
1. A **Meta Harness** layer that treats external developer tools and local LLM runtimes as addressable execution engines.
2. A unified **Multi-Agent Management Layer** to spawn, track, log, and terminate background agent tasks across the local machine and remote mesh nodes.
3. Cross-host **Headscale Mesh Compute** dispatch allowing commands, tasks, and agents to be orchestrated remotely on any machine across the user's private WireGuard tailnet without third-party cloud dependencies or open public ports.

This audit examines the existing codebase topology, identifies failure modes in remote execution and headless LLM orchestration, and documents the concrete fixes verified across macOS and Linux mesh nodes.

---

## 2. Systems & Files Audited

### Core Engine & Routing
- `src/core/mesh.mjs`: Node retrieval, LAN discovery, and remote command execution.
- `src/core/mesh-access.mjs`: SSH credential and account resolution per `mesh_node` entity.
- `src/core/meta-harness.mjs`: External IDE/CLI developer harness detection, dispatch abstraction, and council consensus runner.
- `src/core/agent-manager.mjs`: Persistent agent process lifecycle management (spawning, status checking, log capture, and termination).

### CLI Surfaces & Entrypoints
- `bin/total-recall.mjs`: Central CLI router and help output.
- `src/cli/mesh.mjs`: Mesh admin, node diagnostics, SSH sessions, non-interactive execution (`exec`), and cluster capability audit (`doctor`).
- `src/cli/harness.mjs`: Terminal interface for harness inspection, task dispatch, and council deliberations.
- `src/cli/agent.mjs`: Terminal interface for agent process management (`list`, `spawn`, `status`, `logs`, `kill`).

### Test Coverage
- `src/core/mesh.spec.mjs`: Node lookups, access resolution, and execution handling.
- `src/core/meta-harness.spec.mjs`: Harness availability detection and dispatch mock verification.
- `src/core/agent-manager.spec.mjs`: Process registration, state transitions, log file handling, and process termination.

---

## 3. Audited Failure Modes & Technical Findings

### 3.1 Double-Shell Escaping in Remote SSH Execution
* **Finding**: In `src/core/mesh.mjs`, attempting to run remote commands by wrapping them in login shells (e.g. `ssh user@host "${shell} -l -c \"${command}\""`) caused the remote user's default login shell to parse the command string twice.
* **Impact**: Environment variables (e.g. `$PATH`, `$VAR`), inner quotation marks, pipes, and awk expressions (`awk '{print $1}'`) were prematurely expanded or mangled before execution, causing commands to fail unpredictably on macOS Darwin and Linux Ubuntu.
* **Resolution**: Standardized command dispatch by directly prepending a unified `$PATH` export (`export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$PATH";`) directly to the raw command string passed to SSH without nested subshell quoting.

### 3.2 Ollama Headless Execution Blocking on Non-TTY Sessions
* **Finding**: `ollama run <model> "<prompt>"` blocks indefinitely on terminal spinner sequences when invoked non-interactively or over remote SSH without an allocated pseudoterminal (PTY).
* **Impact**: Automated background scripts, subagents, and mesh dispatches hung waiting for terminal input.
* **Resolution**: Configured Ollama execution mode to `pipe_stdin`. Dispatches to Ollama pipe the prompt through standard input (`echo "<prompt>" | ollama run <model>`), which triggers Ollama's non-interactive stream parser and terminates cleanly with exit code 0.

### 3.3 ANSI Escape Sequence Distortion in Terminal Column Padding
* **Finding**: Terminal table formatters using JavaScript's native `String.prototype.padEnd()` calculated padding lengths including non-printable ANSI escape color codes (e.g., `\x1b[32mActive ✅\x1b[0m`).
* **Impact**: Table borders in `total-recall mesh doctor`, `total-recall harness list`, and `total-recall agent list` were visibly jagged and misaligned across terminal emulators.
* **Resolution**: Implemented ANSI-aware length calculation (`s.replace(/\x1b\[[0-9;]*m/g, '').length`) before padding table cells, guaranteeing character-exact vertical alignment.

### 3.4 Cross-Node Process State & Log Directory Isolation
* **Finding**: Background agents spawned on remote mesh nodes could not be monitored from the local workstation if log files were kept only on the remote host's ephemeral filesystem.
* **Impact**: Developers would have to manually SSH into remote nodes to tail log files or check process statuses.
* **Resolution**: `agent spawn --node <node>` tracks the remote host in local state (`~/.agent/skills/total-recall/sessions/agents.json`), logs process dispatch metadata locally, and enables `agent logs <id>` to transparently stream logs via `mesh exec <node> "cat <remote_log_path>"`.

---

## 4. Grounded Network & Mesh Infrastructure

Verification was conducted against live nodes on the active Headscale network:
* **Control Server**: `https://headscale.ultrachat.app`
* **Local Workstation**: `gregs-macbook-pro` (`100.64.0.6`) — macOS Darwin (ARM64), runtimes: Node.js, Git; harnesses: `agy`, `claude`, `codex`, `gemini`, `ollama`.
* **Compute Node**: `macmini` (`100.64.0.2`) — macOS Darwin (ARM64), runtimes: Node.js, Git, Ollama (`gemma4:latest`, `nomic-embed-text`).
* **Cloud Node**: `cloud` (`100.64.0.1`) — Ubuntu Linux (AMD64), runtimes: Docker, Node.js, Git.

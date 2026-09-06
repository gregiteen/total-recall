# META_HARNESS_AND_MESH_COMPUTE — Product Requirements Document (PRD)

> **Project Prefix**: `META_HARNESS_AND_MESH_COMPUTE`  
> **Kanban State**: ✅ Completed  
> **Date**: 2026-09-05  
> **Author**: Antigravity & User  

---

## 1. Problem Statement

Developers frequently work across multiple specialized AI developer tools:
- **Google Antigravity (`agy`)**: High-capacity multi-step reasoning, broad codebase review, and frontier intelligence.
- **Claude Code (`claude`)**: Terminal-native refactoring, bash tool execution, and architectural edits.
- **OpenAI Codex (`codex`)**: Programmatic synthesis and sandboxed code mutation.
- **Google Gemini CLI (`gemini`)**: Lightweight prompt utilities and tool chaining.
- **Ollama (`ollama`)**: Local neural inference running at zero API token cost (e.g. `gemma4:latest`).

Previously, these developer tools operated in disconnected silos. Developers had no unified CLI to inspect which harnesses were active, dispatch tasks non-interactively, run comparative consensus deliberations ("councils"), or run agent workloads remotely across private machines on their Headscale WireGuard mesh.

---

## 2. Scope & Boundaries

### In-Scope
1. **Meta Harness Runtime (`src/core/meta-harness.mjs`, `src/cli/harness.mjs`)**:
   - Dynamic detection of installed CLI harnesses (`agy`, `claude`, `codex`, `gemini`, `ollama`) from `$PATH`.
   - Task dispatch abstraction with support for command-line arguments and standard input piping (`pipe_stdin` for Ollama).
   - Multi-harness consensus council (`total-recall harness council "<task>"`).
   - Remote harness dispatch targeting any mesh node via `--node <name>`.

2. **Agent Management Layer (`src/core/agent-manager.mjs`, `src/cli/agent.mjs`)**:
   - Process lifecycle control for background agents (`spawn`, `list`, `status`, `logs`, `kill`).
   - Unified persistent state tracking in `sessions/agents.json`.
   - Support for detached background processes with automated output redirection to log files.
   - Remote agent management across mesh nodes using WireGuard/SSH transport.

3. **Mesh Compute & Diagnostics (`src/core/mesh.mjs`, `src/cli/mesh.mjs`)**:
   - Non-interactive remote command execution: `total-recall mesh exec <node> <command...>`.
   - `--json` machine-readable output format for programmatic pipelines.
   - Cluster capability diagnostic tool: `total-recall mesh doctor` probing SSH reachability, runtimes (Node, Docker, Git), and AI harnesses across all discovered mesh nodes.
   - Robust PATH prepending and ANSI-safe table formatting.

### Out-of-Scope
- Proprietary cloud-hosted agent brokers.
- Heavy background virtualization or container daemons where native terminal CLI tools suffice.
- Open public network exposure; all communication is strictly encapsulated within the private Headscale WireGuard network.

---

## 3. Measurable Success Criteria

1. **Local & Remote Harness Dispatch**:
   - Running `total-recall harness dispatch ollama "test prompt"` returns valid neural completion and exits with code 0.
   - Running `total-recall harness dispatch ollama --node macmini "test prompt"` executes over mesh SSH and returns within 3 seconds.
2. **Cluster Health & Diagnostics**:
   - Running `total-recall mesh doctor` completes in < 5 seconds across all nodes and displays an aligned ANSI table showing SSH reachability and tool availability.
   - Running `total-recall mesh doctor --json` produces valid JSON schema for downstream automation.
3. **Agent Lifecycle Control**:
   - `total-recall agent spawn claude "echo hello" --name "Test Worker"` writes state to `sessions/agents.json` and produces a readable log in `sessions/logs/`.
   - `total-recall agent logs <id>` streams recent lines.
   - `total-recall agent kill <id>` terminates the process and marks status as `stopped`.
4. **Test Suite Conformance**:
   - 100% pass rate on `mesh.spec.mjs`, `meta-harness.spec.mjs`, and `agent-manager.spec.mjs`.
   - Total repository test suite passes with zero regressions.

---

## 4. Prioritization & Phasing

* **P0 (Critical)**: Robust remote SSH command execution (`execMeshCommand`), eliminating quoting bugs; non-blocking Ollama `pipe_stdin` execution; core unit test coverage.
* **P1 (High)**: `total-recall mesh doctor` cluster capability audit; cross-mesh `--node` dispatch for harnesses and agents; log tailing and process killing.
* **P2 (Medium)**: Multi-harness consensus council runner; ANSI table column formatting; comprehensive CLI documentation.

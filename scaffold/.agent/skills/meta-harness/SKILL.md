---
name: meta-harness
description: Meta Harness & Agent Management Layer to orchestrate and delegate tasks across all connected IDE harnesses (Antigravity, Claude Code, Codex, Gemini, Ollama) and the computer generally.
---

# Meta Harness & Agent Management Layer

The **Meta Harness** provides a unified agent management layer across all connected developer environments, CLI runtimes, and the computer generally.

## 🎯 Architectural Concept

Total Recall connects to every major IDE, CLI harness, and local neural runtime:
- **Google Antigravity (`agy`)**: Frontier multi-step reasoning, web grounding, and deep research on AI Ultra.
- **Claude Code (`claude`)**: Direct terminal codebase refactoring, bash tool execution, and complex Unix tasks.
- **OpenAI Codex (`codex`)**: Program synthesis, sandboxed workspace mutations, and isolated code generation.
- **Google Gemini CLI (`gemini`)**: Fast utility completions and lightweight tool chaining.
- **Ollama Local LLM (`ollama`)**: Zero-token-cost local neural reasoning (e.g. `gemma4:latest`) running non-interactively via standard input piping (`pipe_stdin`).
- **IDE Surfaces**: Cursor (`.cursorrules`), Cline (`.clinerules`), VS Code (`copilot-instructions.md`), DeepSeek Harness (`dsh`).

### The Shared Brain Principle
Because all harnesses operate over the **same portable brain**:
- Every harness reads the same auto-compiled instruction surface (`AGENTS.md`, `GEMINI.md`, `CLAUDE.md`).
- Every harness writes directly into the shared SSSS memory vault (`memory-vault/`).
- Knowledge or solutions learned by one agent in one harness are immediately accessible to every other harness across the computer and mesh.

---

## 🛠️ CLI Operations

### 1. Inspect Active Harnesses
Inspect all available developer harnesses and their local binary paths:
```bash
npx total-recall harness list
```

### 2. Headless Task Dispatch
Dispatch a specific coding or research task to any external harness (locally or remotely over the mesh):
```bash
# Local dispatches
npx total-recall harness dispatch claude "Inspect src/core/surface.mjs and run lint checks"
npx total-recall harness dispatch agy "Analyze latest preprints on room temperature diamond NV registers"
npx total-recall harness dispatch codex "Generate unit tests for src/core/context-cache.mjs"
npx total-recall harness dispatch ollama "Summarize the core invariants of SSSS"

# Cross-mesh remote dispatches
npx total-recall harness dispatch ollama --node macmini "What is test-time compute scaling?"
npx total-recall harness dispatch claude --node macmini "Run git status and lint tests"
```

### 3. Multi-Harness Council
Run a task across multiple harnesses concurrently to obtain comparative solutions and consensus:
```bash
npx total-recall harness council "Propose architecture for decentralized research mesh"
```

---

## 🤖 Agent Process Management

Manage background subagent tasks across the local machine and remote mesh nodes:

### 1. Spawn a Background Agent
```bash
# Local background agent
npx total-recall agent spawn claude "Refactor error handling in src/cli/harness.mjs" --name "Refactor Worker"

# Remote background agent on a mesh node
npx total-recall agent spawn agy --node macmini "Crawl recent preprints on quantum shuttling" --name "Quantum Scout"
```

### 2. Inspect Running Agents
```bash
npx total-recall agent list
npx total-recall agent list --json
```

### 3. Stream Agent Logs
```bash
npx total-recall agent logs <agent-id> --tail 100
```

### 4. Terminate an Agent
```bash
npx total-recall agent kill <agent-id>
```

---

## 🌐 Headscale Mesh Diagnostics & Remote Execution

The Meta Harness integrates directly with your private Headscale WireGuard mesh network:

### 1. Cluster Capability Audit (`mesh doctor`)
Concurrently audit reachability, developer runtimes (`node`, `docker`, `git`), and AI harnesses (`agy`, `claude`, `codex`, `gemini`, `ollama`) across all cluster nodes:
```bash
npx total-recall mesh doctor
npx total-recall mesh doctor --json
```

### 2. Non-Interactive Remote Command Execution (`mesh exec`)
Execute commands on remote nodes with automatic `$PATH` sanitization and structured outputs:
```bash
npx total-recall mesh exec macmini uname -m
npx total-recall mesh exec cloud docker ps
```

---

## 💻 General Computer & OS Management
The Meta Harness controls the computer generally:
- **Activity Monitoring ("Follow the User")**: Tracks interaction timestamps and routes dispatches to the active device across the Headscale WireGuard mesh.
- **Process Orchestration**: Spawns background worker loops, monitors task completion, and terminates runaway processes.
- **Surface Sync**: Recompiles instruction surfaces across all IDE directories automatically upon graph updates.

# META_HARNESS_AND_MESH_COMPUTE — Development Plan

> **Project Prefix**: `META_HARNESS_AND_MESH_COMPUTE`  
> **Kanban State**: ✅ Completed  
> **Date**: 2026-09-05  
> **Author**: Antigravity & User  

---

## 1. Phased Implementation Roadmap

### Phase 1: Mesh Command Execution & PATH Normalization
**Goal**: Implement non-interactive SSH execution over Headscale mesh nodes with robust error handling and sanitized `$PATH` exports across Darwin and Linux.
* Tasks:
  - Add `execMeshCommand` to `src/core/mesh.mjs`.
  - Add `total-recall mesh exec <node> <cmd...>` to `src/cli/mesh.mjs`.
  - Add `--json` machine-readable output support to `mesh exec`.
  - Write unit tests in `src/core/mesh.spec.mjs`.
* **Done When**:
  - `npx total-recall mesh exec macmini uname -m` returns `arm64` with exit code 0.
  - `npx total-recall mesh exec cloud uname -m` returns `x86_64` with exit code 0.
  - `src/core/mesh.spec.mjs` passes all tests.

---

### Phase 2: Meta Harness Registry & Ollama Local Inference
**Goal**: Provide a unified interface for external CLI developer tools (`agy`, `claude`, `codex`, `gemini`) and local neural models (`ollama`).
* Tasks:
  - Implement `src/core/meta-harness.mjs` with `HARNESS_SPECS` and dynamic `$PATH` detection.
  - Add `ollama` specification supporting `pipe_stdin` non-interactive streaming mode.
  - Implement `src/cli/harness.mjs` with `list`, `dispatch`, and `council` commands.
  - Support cross-mesh task routing via `--node <name>`.
  - Write unit tests in `src/core/meta-harness.spec.mjs`.
* **Done When**:
  - `npx total-recall harness list` displays installed harnesses in an aligned table.
  - `npx total-recall harness dispatch ollama --node macmini "Hello"` returns valid response without hanging.
  - `src/core/meta-harness.spec.mjs` passes all tests.

---

### Phase 3: Mesh Cluster Doctor & Terminal Column Formatting
**Goal**: Provide full observability into cluster reachability, development runtimes, and AI harnesses.
* Tasks:
  - Implement `total-recall mesh doctor` in `src/cli/mesh.mjs`.
  - Concurrently probe SSH reachability, runtimes (`node`, `docker`, `git`), and AI harnesses (`agy`, `claude`, `codex`, `gemini`, `ollama`).
  - Strip ANSI escape sequences when calculating table column widths.
  - Add `--json` output format.
* **Done When**:
  - `npx total-recall mesh doctor` renders character-aligned columns across all active nodes.
  - `npx total-recall mesh doctor --json` outputs valid JSON.

---

### Phase 4: Agent Management Subsystem & Remote Process Supervision
**Goal**: Provide background process management for long-running agent tasks across local and remote mesh nodes.
* Tasks:
  - Implement `src/core/agent-manager.mjs` with persistent JSON state in `sessions/agents.json`.
  - Implement `src/cli/agent.mjs` supporting `list`, `spawn`, `status`, `logs`, and `kill`.
  - Implement remote process spawning (`nohup` over mesh SSH), remote PID capture, and remote log streaming.
  - Write unit tests in `src/core/agent-manager.spec.mjs`.
* **Done When**:
  - `npx total-recall agent spawn claude "echo test"` creates a tracked record.
  - `npx total-recall agent list` displays active processes.
  - `src/core/agent-manager.spec.mjs` passes all tests.

---

### Phase 5: Verification, CLI Integration & Project Documentation
**Goal**: Wire commands into central CLI binary, verify full test suite passes, and update project documentation.
* Tasks:
  - Register `harness` and `agent` commands in `bin/total-recall.mjs`.
  - Update `docs/reference/cli-reference.md` and `docs/reference/CLI_INVENTORY.md`.
  - Update `docs/ARCHITECTURE.md` to document the Meta Harness and Mesh Compute topology.
  - Mirror documentation in `.agent/skills/total-recall/references/cli-reference.md`.
  - Update `.agent/skills/meta-harness/SKILL.md`.
  - Run full test suite (`npm test`).
  - Compile instruction surfaces with zero drift (`npx total-recall compile`).
* **Done When**:
  - All 1,694+ tests pass.
  - `npx total-recall compile` reports 0 drift.
  - Documentation accurately reflects live working CLI commands.

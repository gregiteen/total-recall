# META_HARNESS_AND_MESH_COMPUTE — Project Tracker

> **Project Prefix**: `META_HARNESS_AND_MESH_COMPUTE`  
> **Kanban State**: ✅ Completed  
> **Date**: 2026-09-05  
> **Author**: Antigravity & User  

---

## 📋 Task Checklist by Phase

### Phase 1: Mesh Command Execution & PATH Normalization
- [x] Implement `execMeshCommand` in `src/core/mesh.mjs` [M]
- [x] Standardize sanitized `$PATH` export prepending across Darwin/Linux [S]
- [x] Implement `mesh exec <node> <cmd...>` in `src/cli/mesh.mjs` [M]
- [x] Add `--json` machine-readable output to `mesh exec` [S]
- [x] Add unit tests in `src/core/mesh.spec.mjs` (10/10 passing) [S]
- [x] Live verify `mesh exec macmini uname -m` -> `arm64` [S]
- [x] Live verify `mesh exec cloud uname -m` -> `x86_64` [S]

### Phase 2: Meta Harness Registry & Ollama Local Inference
- [x] Implement `src/core/meta-harness.mjs` with `HARNESS_SPECS` [M]
- [x] Add dynamic binary detection via `$PATH` probing [S]
- [x] Add `ollama` harness specification with `pipe_stdin` execution mode [M]
- [x] Implement `runCouncil` multi-harness consensus runner [M]
- [x] Support cross-mesh task routing via `--node <name>` [M]
- [x] Implement `src/cli/harness.mjs` with `list`, `dispatch`, and `council` [M]
- [x] Add unit tests in `src/core/meta-harness.spec.mjs` (3/3 passing) [S]
- [x] Live verify `harness dispatch ollama --node macmini` with `gemma4:latest` [S]

### Phase 3: Mesh Cluster Doctor & Terminal Column Formatting
- [x] Implement `mesh doctor` in `src/cli/mesh.mjs` [M]
- [x] Probe concurrent SSH reachability, runtimes (`node`, `docker`, `git`), and AI harnesses [M]
- [x] Implement ANSI-safe length calculations for character-aligned table columns [S]
- [x] Add `--json` machine-readable output to `mesh doctor` [S]
- [x] Live verify `mesh doctor` across `macmini`, `cloud`, and `gregs-macbook-pro` [S]

### Phase 4: Agent Management Subsystem & Remote Process Supervision
- [x] Implement `src/core/agent-manager.mjs` process controller [L]
- [x] Add persistent process tracking in `sessions/agents.json` [M]
- [x] Implement local process spawning with detached stdout/stderr logging [M]
- [x] Implement remote agent spawning over mesh SSH via `nohup` [M]
- [x] Implement `agent logs <id>` with local reading and remote SSH tailing [M]
- [x] Implement `agent kill <id>` with local `SIGTERM` and remote SSH process termination [M]
- [x] Implement `src/cli/agent.mjs` (`list`, `spawn`, `status`, `logs`, `kill`) [M]
- [x] Add unit tests in `src/core/agent-manager.spec.mjs` (3/3 passing) [S]

### Phase 5: Verification, CLI Integration & Project Documentation
- [x] Register `harness` and `agent` commands in `bin/total-recall.mjs` [S]
- [x] Update `bin/total-recall.mjs` `--help` to list `harness` and `agent` [S]
- [x] Update `docs/reference/cli-reference.md` with `mesh exec`, `mesh doctor`, `harness`, and `agent` [M]
- [x] Update `docs/reference/CLI_INVENTORY.md` to classify `harness` and `agent` [S]
- [x] Update `docs/ARCHITECTURE.md` to document Mesh Compute Topology & Meta-Harness Layer [M]
- [x] Mirror documentation in `.agent/skills/total-recall/references/cli-reference.md` [M]
- [x] Mirror documentation in `scaffold/.agent/skills/total-recall/references/cli-reference.md` [M]
- [x] Update `.agent/skills/meta-harness/SKILL.md` in both repositories [M]
- [x] Run full repository test suite (`npm test` — 307 files, 1,694 tests passed) [L]
- [x] Run `npx total-recall compile` to ensure 0 drift on all instruction surfaces (550 nodes in TR, 9 in keen-hertz) [S]

---

## 🔍 Verification Log

- **2026-09-05T02:00:00Z**: Created `src/core/mesh.mjs` with `execMeshCommand`. Verified remote command execution on `macmini` and `cloud`.
- **2026-09-05T02:15:00Z**: Added Ollama local LLM integration in `src/core/meta-harness.mjs` with `pipe_stdin` mode. Verified live execution of `gemma4:latest` on `macmini`.
- **2026-09-05T02:25:00Z**: Implemented `total-recall mesh doctor`. Verified ANSI column alignment across macOS and Linux nodes.
- **2026-09-05T02:30:00Z**: Implemented `src/core/agent-manager.mjs` and `src/cli/agent.mjs`. Verified remote process spawning, log capture, and process termination.
- **2026-09-05T02:35:00Z**: Ran full test suite across 307 test files: **1,694 tests passed, 0 failures**.
- **2026-09-05T02:44:00Z**: Initialized 5-document project suite under `docs/projects/in-progress/META_HARNESS_AND_MESH_COMPUTE/` following `/total-recall-project-management`.

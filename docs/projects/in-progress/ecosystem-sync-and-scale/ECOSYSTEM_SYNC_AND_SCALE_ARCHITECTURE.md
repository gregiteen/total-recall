# ECSystemYSTEM SYNC AND SCALE: ARCHITECTURE

## 1. System Topology Overview
The architecture is fundamentally shifting from a stateless CLI tool invoking single operations, to a stateful, background Daemon that continuously observes the VFS (Virtual File System) and synchronizes with external platforms.

### Core Layers
1. **Frontend (React / Vite)**: 25 distinct UI Modules representing the visual control plane.
2. **REST API (`src/server/rest.mjs`)**: The synchronous communication layer. Must be refactored to rely exclusively on deterministic path variables (`ROOT`, `BRAIN_DIR`) instead of `process.cwd()`.
3. **Task Runner & Daemon (`src/core/daemon-loop.mjs`)**: The asynchronous heartbeat. Handles agent spawning and long-running SSSS validations.
4. **CRON Scheduler (`src/core/crons.mjs`)**: The new background orchestration layer.
5. **VFS Engine (`src/server/vault.mjs`, `surface.mjs`)**: The lowest-level data persistence layer. Must remain single-threaded and lock-protected to prevent concurrency corruption.

## 2. Global vs Project Data Resolution Pipeline
The system must query data by checking the most localized scope first, then falling back to the global scope.

**Resolution Sequence (Skills & Instructions):**
1. **Embedded/Repo Scope**: `<workspace_dir>/.agent/skills/`
2. **Context/Project Scope**: `<app_data_dir>/brain/<project_id>/skills/`
3. **Identity/Global Scope**: `<app_data_dir>/config/skills/`

**Data Hydration:**
When the frontend requests `/api/skills`, the backend must run a `Promise.all()` to stat all three directories, merge the contents, and resolve namespace collisions by prioritizing the local scope (Embedded > Context > Global).

## 3. Obsidian & GitHub Sync Bridge
The sync bridge operates at the VFS layer, bypassing the REST API entirely.

**Obsidian Sync (`src/core/obsidian-bridge.mjs`):**
- Utilizes `chokidar` to watch the `memory-vault/` directory.
- On file change, instantly parses SSSS `metadata.json` and updates the Markdown frontmatter of the corresponding `.md` file, and vice-versa.
- Debounced by 300ms to prevent infinite save loops.

**GitHub Sync (`src/core/github-bridge.mjs`):**
- Runs via the CRON scheduler every 15 minutes.
- Bundles the VFS memory layer into an OKF-compliant `.tar.gz` or pure Git tree.
- Executes `git fetch`, merges remote memory nodes (conflict resolution favors most recent timestamp), and `git push`.

## 4. Concurrency & Daemon Stability Guarantees
- The daemon loop must NEVER throw unhandled exceptions. All sync bridges and CRONs must wrap their top-level logic in `try/catch` and emit structured `[FATAL_SYNC_ERROR]` logs to the VFS rather than crashing the Node process.
- All file deletion operations (e.g., `fs.unlinkSync`) must be wrapped in `if (fs.existsSync(path))` or `try/catch` to prevent `ENOENT` crashes during race conditions with background workers.

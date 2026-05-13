# SSSS Migration Dev Plan

## Objective
Transition all operational hardcoded JavaScript logic (CLI scripts) into autonomous SSSS `type: task` Markdown nodes. Eliminate custom JS daemons and implement a "Triggers and Agents" architecture where the **Cloud Agent does all the heavy lifting** and syncs outputs everywhere, allowing local devices to operate with zero AI compute overhead.

## Scope
- Convert operational scripts (`sync`, `compile`, `backup`, `restore`) from `src/cli/*.mjs` into SSSS `type: task` nodes in `.agent/scheduler/queue/`.
- **Cloud Agent Hub:** The cloud server acts as the sole intelligence engine. It reads the markdown tasks, reasons, and executes them.
- **Local Dumb Triggers:** Local computers (like a Mac) do not run AI agents. They simply run native OS `cron` jobs to pull the synced markdown instructions and execute them blindly.
- Maintain the minimal bootstrap code (like the Express/MCP server) required to accept network requests, but eliminate all custom JS daemon loops (`dream.mjs`, `task_runner.mjs`).

## Phase 1: Architectural Foundation
1. Define the SSSS `type: task` schema for operational tasks (Sync, Compile, Backup).
2. Wire up the standard OS `cron` to trigger the cloud agent CLI directly, entirely bypassing legacy JS background loops.

## Phase 2: CLI Script Conversion
1. **Sync Fabric**: Convert `sync.mjs` into `sync-fabric.md` (triggered on memory updates).
2. **Compile**: Convert `compile.mjs` into `rebuild-indexes.md`.
3. **Backup/Restore**: Convert `backup.mjs` and `restore.mjs` into automated task nodes.
4. **Export/Import**: Convert `export.mjs` and `import.mjs` into task nodes.
5. Delete the legacy `.mjs` scripts as each is replaced by a verified task node.

## Phase 3: Automation & Cron Triggers
1. Set up standard `cron` schedules or file-watchers to drop these `.md` task files into the queue folder.
2. Verify that the agent successfully picks up the tasks and executes the correct bash commands autonomously.

## Phase 4: Testing & Verification
1. Verify the daemon successfully processes a Sync task autonomously.
2. Verify the daemon successfully rebuilds indexes autonomously.
3. Verify no legacy JS operational logic remains in `src/cli/`.

## Phase 5: API Key Lifecycle UI
1. **Backend Infrastructure**: Implement a lightweight local store (`.agent/config/keys.jsonl`) to track issued PATs and usage quotas.
2. **Middleware**: Refactor the Express authorization middleware in `api.mjs` to validate against this store instead of the single `.env` value.
3. **Frontend Dashboard**: Build a dedicated API Key management view in the React UI (issuance, revocation, last used timestamp, hit counts).

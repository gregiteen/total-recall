# ECOSYSTEM SYNC AND SCALE: DEV PLAN

## Phase 1: De-coupling Universal Skills (Days 1-2)
1. **Un-nest Universal Skills**: Rearchitect the scaffold directory. Extract `tr-ssss`, `tr-project-management`, and `tr-okf` out of the `total-recall` namespace.
2. **Remove `tr-` Prefixes**: Rename them to top-level ecosystem skills (`ssss`, `okf`, `project-management`).
3. **Granular File Breakout**: Ensure all monolithic `SKILL.md` files in the scaffold are broken down so that **every single idea is its own `.md` file**.

## Phase 2: The Synchronization Engine (Days 3-5)
1. **Granular Sync Logic**: Update the TR daemon's sync logic to synchronize on a file-by-file basis rather than directory scaffolding.
2. **Universal vs Local Parsing**: The sync engine must be able to push updates to universal `.md` files in a repo's `.agent/skills/` directory without overwriting or deleting repo-specific `.md` files in that same directory.
3. **Daemon DLQ Hooks**: Hook the granular sync engine into the Dead Letter Queue (DLQ) in `task_runner.mjs` to ensure syncs survive failures and rate limits.

## Phase 3: VFS & API Hardening (Days 6-7)
1. **Path Resolution**: Remove `process.cwd()` dependencies across `src/server/rest.mjs`. All file operations must explicitly resolve using the centralized VFS logic (`ROOT`, `AGENT_DIR`).
2. **Missing Error Handlers**: Patch swallowed exceptions in model fetching (`GET /api/openai-models`) and fix the missing `openrouter_api_key` payload processing.
3. **Race Conditions**: Wrap `fs.statSync()` calls in `rest.mjs` with `existsSync()` to prevent daemon crashes during active synchronization.

## Phase 4: UI Command Center Upgrades (Days 8-9)
1. **OpenWiki Enhancement**: Ensure OpenWiki seamlessly renders the newly flattened, granular `.md` skill files into a cohesive knowledge graph.
2. **Skills Matrix Dashboard**: Refactor the Skills UI to visualize which universal `.md` files are fully synced vs. drifted across registered repos.

## Phase 5: Verification & Release (Day 10)
1. Execute `ssss-conformance.bridge.spec.mjs` to ensure the VFS strictly handles granular `.md` files.
2. Run a full-scale local sync test to verify universal files update without crushing local override files.

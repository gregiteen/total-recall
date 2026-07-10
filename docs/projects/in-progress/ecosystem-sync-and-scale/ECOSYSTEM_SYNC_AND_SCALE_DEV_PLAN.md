# ECOSYSTEM SYNC AND SCALE: DEV PLAN

## Phase 1: API & Concurrency Hardening (Days 1-2)
1. **Remove `process.cwd()` dependencies**: Execute a full find-and-replace across `src/server/rest.mjs`. All routes must resolve paths using the globally exported `ROOT`, `BRAIN_DIR`, or `AGENT_DIR` variables.
2. **Patch Concurrent `fs` operations**: Add `try/catch` and `fs.existsSync()` safety wrappers around all `fs.unlinkSync()` and `fs.statSync()` calls in `rest.mjs` and `vault.mjs`.
3. **Fix API Key Leak**: Patch `POST /api/config-json` to whitelist `openrouter_api_key`.

## Phase 2: Frontend UX Resiliency (Days 3-4)
1. **Eliminate Waterfall Fetches**: Refactor React hooks in `ModelsPage.tsx` and `MemoryPage.tsx` to use `Promise.all()` for concurrent data loading.
2. **Empty State Handlers**: Implement explicit empty state components for:
   - Sovereign Graph (When 0 nodes exist)
   - Memory Categories (When category is empty)
   - Usage Charts (When data arrays are empty)
3. **WYSIWYG Editor Safety**: Refactor `MemoryPage.tsx` away from raw `contentEditable` and `dangerouslySetInnerHTML`.

## Phase 3: Global vs Project Data Resolution (Days 5-6)
1. **Core Data API Refactor**: Refactor the `/api/skills` and `/api/instructions` endpoints.
2. **Implement 3-Tier Merge**: Construct the pipeline that merges:
   - Identity (`~/.gemini/config/`)
   - Context (`~/.gemini/antigravity/brain/<project>/`)
   - Embedded (`<repo>/.agent/`)
3. **UI Badging**: Add visual indicators in the React frontend so users can see which scope a specific skill or memory belongs to.

## Phase 4: Sync Bridges (Days 7-9)
1. **Obsidian Sync Bridge**:
   - Write `src/core/obsidian-bridge.mjs`.
   - Instantiate `chokidar` watcher in `daemon-loop.mjs`.
2. **GitHub Sync Bridge**:
   - Write `src/core/github-bridge.mjs`.
   - Expose explicit Git push/pull shell commands wrapped in Node `exec`.
3. **Autonomous CRON Integration**:
   - Hook the bridges and the "Code Examiner Worker" into the existing `src/core/crons.mjs` scheduler.

## Phase 5: Testing & Release (Day 10)
1. Ensure the `ssss-conformance.bridge.spec.mjs` suite passes.
2. Perform a multi-agent stress test where 3 agents attempt to modify memory simultaneously while the GitHub sync runs.
3. Final tag and push.

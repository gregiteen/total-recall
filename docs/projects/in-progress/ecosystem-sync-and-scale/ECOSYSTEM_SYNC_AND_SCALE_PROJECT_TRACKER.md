# ECOSYSTEM SYNC AND SCALE: PROJECT TRACKER

## Goal
Execute a comprehensive overhaul of the Total Recall ecosystem, resolving UI/Data fragmentation, implementing CRON automation, adding GitHub/Obsidian sync, and hardening OKF/SSSS spec compliance.

## ⏳ Phase 1: Comprehensive UI & API Audit
*Goal: Systematically review every single section of the app to map current data architecture, identify rendering bugs (like the recent 404s), and prepare for synchronization.*
- [x] **Chat**: Audit message rendering, connection to `task_runner`, and model selection fallback.
- [x] **Memory**: Check grid display for empty nodes and confirm `processOperation` deletes work.
- [x] **Vault Docs**: Verify document hydration and markdown rendering.
- [x] **Inbox**: Validate the conflicts and pending approvals logic.
- [x] **Tasks**: Ensure background scheduler properly exposes pending items.
- [x] **Automations**: Verify SSSS workflow triggers.
- [x] **Files**: Verify derived files and VFS explorer integrity.
- [x] **Sandbox**: Check Code Mode bindings and iframe output.
- [x] **Models & Agents**: Confirm model catalog and local routing logic.
- [x] **Health**: Validate daemon loop heartbeats.
- [x] **Usage & Costs**: Audit token tracking persistence.
- [x] **Settings**: Test environment and path configurations.
- [x] **API Keys**: Ensure secret storage doesn't leak into VFS (`secrets.enc` logic).
- [x] **Integrations**: Document missing Webhooks/API integrations.
- [x] **Skills Manager**: Define embedded vs global vs project skills display.
- [x] **Collaboration**: Check UX for multi-agent or multi-tenant workflows.
- [x] **Instructions**: (404 fixed, audit caching).
- [x] **Design Docs**: Verify OKF rendering.
- [x] **OKF Manager**: Ensure `@ssss/cli` bundle validation works.
- [x] **OpenWiki**: Ensure tree display uses correct memory nodes.
- [x] **Documentation**: Ensure `SKILL.md` loading logic.
- [x] **Sovereign Graph**: Audit semantic visualization for disconnected nodes.

## ⏳ Phase 2: Centralized Data Organization
- [ ] Define and document global vs project skill resolution paths in the reference engine.
- [ ] Build the explicit pipeline for Embedded Skills (repo-specific memory) vs System Skills.
- [ ] Migrate all legacy `process.cwd()` dependencies to `ROOT`, `AGENT_DIR`, or `BRAIN_DIR` in `rest.mjs`.

## ⏳ Phase 3: Autonomous CRON Implementation
- [ ] Build a daemon CRON scheduler inside `task_runner.mjs`.
- [ ] Create an "examine code" worker that scans repo changes and updates technical skills automatically.
- [ ] Integrate background secret/instruction management checks to manage repos centrally.

## ⏳ Phase 4: Integrations (GitHub, Obsidian, OKF)
- [ ] Implement Two-Way Obsidian Sync (watcher on vault directory translating to/from Obsidian frontmatter).
- [ ] Implement GitHub Sync (push/pull SSSS bundles to a remote repo).
- [ ] Enhance OKF (`@ssss/cli`) bundle compliance on export/import.
- [ ] Guarantee 100% compliance with `/tr-ssss` directives (no bypassing operations).

## ⏳ Phase 5: Testing & Verification
- [ ] Pass `ssss-conformance.bridge.spec.mjs`.
- [ ] Execute Clean-Account Initialization with the new features enabled.
- [ ] Verify GitHub push/pull doesn't corrupt local memory.
- [ ] Verify Obsidian edits propagate to the UI immediately.

## Global Backend Audit Findings (rest.mjs)
- [ ] Replace `process.cwd()` and `os.homedir()` fallback in `/api/import/rules` with absolute path variables.
- [ ] Add `try/catch` block to `fs.statSync()` loops in `/api/files` and `/api/scripts` to prevent unhandled exceptions on concurrent file deletion.
- [ ] Implement proper error propagation in `GET /api/openai-models` instead of swallowing errors silently.


## 📋 Detailed Component Audit Findings

### API KEYS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### AUTOMATIONS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 2 Audit Findings
- [ ] Ensure `POST /api/update/run` async logic correctly pipes errors back to the client instead of prematurely returning `success: true`.

### CHAT
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### COLLABORATION
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### CORE DAEMON
- [x] Audit `daemon-loop.mjs` heartbeat stability and crash resilience.
- [x] Review error handling around task execution pipelines (no unhandled rejections).
## ⏳ Phase 2: Implementation & Sync Hookup
- [x] Integrate CRON system hook.
- [ ] Stabilize `setImmediate` async blocks across the task runner to prevent zombies.
## ⏳ Phase 3: Testing & Verification
- [ ] Run 24-hour stability test with active GitHub/Obsidian bridges.

### DESIGN DOCS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 4 Audit Findings
- [ ] Remove statically hardcoded `CORE_DOCS` and `DEV_GUIDES` and wire up the actual `fetchDesignDocs()` response data to the sidebar.

### DOCUMENTATION
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### FILES
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 2 Audit Findings
- [ ] Fix race condition in `handleCreateScript()` where `handleSelectScript()` is called before state is fully committed.

### HEALTH
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### INBOX
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 1 Audit Findings
- [ ] `handleDecision`: Replace synchronous `alert()` calls with non-blocking UI toasts or error states for `postDecision` and `updateDoc` failures.

### INSTRUCTIONS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### INTEGRATIONS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 3 Audit Findings
- [ ] Add explicit error state handling for `listApiKeys`, `fetchActiveIntegrations`, and `fetchExtensionStatus` instead of swallowing rejections in empty `.catch()` blocks.

### LOGIN
- [x] Audit UI components for rendering bugs and empty state crashes.
- [x] Map data resolution (Global vs. Project scoped data).
- [ ] Fix auth gate race conditions where rapid navigation during token verification flashes unauthed states.
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect auth tokens to GitHub / Obsidian sync bridges to ensure secure payload transmission.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.

### MEMORY
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 1 Audit Findings
- [ ] Fix missing empty state when a category has 0 nodes or search yields 0 results.
- [ ] Refactor WYSIWYG editor away from `contentEditable` and `document.execCommand` to avoid cursor jumping and React desync.
- [ ] Replace `dangerouslySetInnerHTML` regex parsing with proper Markdown rendering and HTML sanitization to prevent XSS.

### MODELS AGENTS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 2 Audit Findings
- [ ] Fix waterfall network fetching bug in `fetchSystemData()` by utilizing `Promise.all()` to prevent UI blocking.

### OKF MANAGER
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### OPENWIKI
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### SANDBOX
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### SETTINGS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 2 Audit Findings
- [ ] Fix `POST /api/config-json` endpoint to properly validate and include `openrouter_api_key` in the `allowedKeys` array.

### SKILLS MANAGER
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 3 Audit Findings
- [ ] Surface error toast/UI feedback in `handleFetchResearch` and `handleToggleSubDir` instead of failing silently.

### SOVEREIGN GRAPH
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 4 Audit Findings
- [ ] `listMemory(activeBrainId)` in the `Promise.all` needs a `.catch()` block.
- [ ] Render an explicit empty state message instead of a blank 3D canvas if zero nodes/research/threads exist.

### TASKS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 1 Audit Findings
- [ ] `handleToggleExpand`: Add visible error state/toast when `readMemory` fails, instead of silent console log.
- [ ] Polling loop: Add exponential backoff to `fetchTasks`, `fetchResearch`, and `fetchDaemonLogs` to prevent spamming errors when backend is offline.

### USAGE COSTS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
## Batch 3 Audit Findings
- [ ] Add explicit optional chaining to nested properties like `usage?.breakdown?.gemini?.dailyUsd?.toFixed(4)` to prevent TypeError crashes.
- [ ] Add empty state fallback UI for `timeseriesData` chart to prevent rendering an empty AreaChart.

### VAULT DOCS
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using `ROOT` / `BRAIN_DIR` instead of `process.cwd()`.
- [ ] Map data resolution (Global vs. Project scoped data).
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.
## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.

### VFS ENGINE
- [x] Audit `vault.mjs` and `surface.mjs` for thread-safety and race conditions.
- [x] Ensure `@ssss/cli` bundle primitives correctly resolve in memory without database persistence dependencies.
## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect Obsidian File Watcher to instantly translate Frontmatter <-> SSSS JSON schemas on save.
- [ ] Connect GitHub sync tree generator for `memory-vault/`.
## ⏳ Phase 3: Testing & Verification
- [ ] Pass `ssss-conformance.bridge.spec.mjs`.

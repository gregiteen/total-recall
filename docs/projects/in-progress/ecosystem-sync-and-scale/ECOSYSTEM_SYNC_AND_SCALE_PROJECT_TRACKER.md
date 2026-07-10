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

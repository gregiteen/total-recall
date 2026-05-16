# SSSS Migration Project Tracker

## ✅ Phase 1: Architectural Foundation
- [x] Define the `type: task` markdown structure for `sync`, `compile`, and `backup` operations.
- [x] Ensure the cloud agent is invoked via cron — no custom JS daemon loop required.

## ⏳ Phase 2: CLI Script Conversion
- [x] Write `.agent/scheduler/queue/sync-fabric.md` task node.
- [x] Write `.agent/scheduler/queue/rebuild-indexes.md` task node.
- [x] Write `.agent/scheduler/queue/backup-vault.md` task node.
- [x] Delete `src/cli/sync.mjs`.
- [x] Delete `src/cli/compile.mjs`.
- [x] Delete `src/cli/backup.mjs`.
- [x] Delete `src/cli/export.mjs`.
- [x] Delete `src/cli/import.mjs`.
- [x] Delete `src/cli/reindex.mjs`.

## ✅ Phase 3: Automation & Cron Triggers
- [x] Installed a `*/5 * * * *` cron on the DigitalOcean server that pings `/v1/chat/completions` with the queue processing prompt.
- [x] Tasks are priority-ordered in the queue markdown files (priority field in YAML frontmatter).

## ⏳ Phase 4: Testing & Verification
- [ ] Ensure the daemon successfully executes the `sync-fabric.md` task via CLI commands without relying on hardcoded JS logic.
- [ ] Ensure the daemon successfully executes the `rebuild-indexes.md` task autonomously.
- [ ] Verify that no legacy operational logic remains in `src/cli/`.

## ✅ Phase 5: API Key Lifecycle UI
- [x] Created `src/server/keys.mjs` — JSONL-backed key store with issue, revoke, and usage tracking.
- [x] Refactored `auth.mjs` to validate PATs against `keys.jsonl` with usage recording.
- [x] Added `GET/POST/DELETE /api/keys` endpoints to `api.mjs`.
- [x] Built `ApiKeysPage.tsx` — full React UI for issuing, listing, revoking, and tracking API key usage.
- [x] Wired the new page into the sidebar and router in `App.tsx`.
- [x] Deployed to the cloud server and rebuilt the frontend.

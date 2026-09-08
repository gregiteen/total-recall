# Handoff: Total Recall Current State

## Current state

- **Branch:** `main`
- **Version:** `3.27.0` (`total-recall-brain@3.27.0`)
- **Plugin System & Discovery:** Merged and verified; includes plugin discovery catalog (`npx total-recall plugin catalog` / `search`), ratings UI, and meta-harness.
- **Mesh & Network Security:** Headscale WireGuard mesh, presence dynamic dispatch, encrypted secrets sync, and firewall rate limiting are fully operational and verified.

## In-Flight / Staged Changes

- `src/cli/plugin/search.mjs`: Added search & catalog discovery command for CLI plugin system.
- `src/cli/plugin/plugin.spec.mjs`: Verified with comprehensive tests (6/6 passing).
- Fixed `-n` argument handling in antigravity sandbox git wrapper so `git log -n <limit>` succeeds cleanly.
- Removed stale broken symlink `docs/projects/planned/expo-mobile`.

## Active Projects Planned / Backlog

1. **Living Memory Capsule (`docs/projects/planned/living-memory-capsule-ultrachat`)**:
   - Workspace-scoped memory folder outside `memory-vault/` (`<BRAIN_DIR>/living-capsules/<workspace-id>/`).
   - Deterministic alphabetical order join for optimal KV prefix caching (APC).
   - Dynamic capsule REST endpoints (`GET /api/comms/capsule`, `POST /api/comms/capsule/record`, `DELETE /api/comms/capsule/:workspace_id/:filename`).
   - Background garbage collection daemon task (`capsule-gc` under `memory-maintenance`).
   - 2026 Model Catalog updates under `models/catalog/total-recall/`.
2. **GPU Intelligence Network ("Hive") (`docs/projects/planned/gpu-intelligence-network`)**:
   - Multi-provider GPU broker, distributed research protocol, workspace generator interview, and virtual compute fabric.
3. **Deferred Backlog (`docs/projects/DEFERRED_BACKLOG.md`)**:
   - Voice Notes (`npx total-recall voice` with Whisper STT), image/file uploads with multer/vision, mobile PWA Web Share Target, and remote OKF package installer.

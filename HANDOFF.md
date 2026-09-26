# Handoff: Total Recall Current State

## Current state

- **Branch:** `main`
- **Package version:** `3.31.2`, published to npm on 2026-09-26 (tag `v3.31.2`, commit `9c534e0`). `3.31.1` was tagged but not published because a newer npm rejected its workspace lockfile. The 3.31.2 release repairs that lockfile and ships the credential-file permission fix and patched frontend dependency. See `docs/developer/CHANGELOG.md`.
- **Source of truth:** SSSS VFS documents for persistent brain state. Plugin installation records and run events use the SSSS operation service.
- **Active project records:**
  - [PLUGIN_P2P](docs/projects/in-progress/PLUGIN_P2P/PLUGIN_P2P_PROJECT_TRACKER.md): bundled and installed plugins, explicit public sharing through hash-pinned HTTPS links, own-device mesh sharing, task runs, and dashboard management.
  - [CAPABILITY_DEPLOYMENT_PLUGINS](docs/projects/in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md): in progress. Phase 2 planner and part of Phase 2B shipped in 3.30.0. A shared adapter contract fixture now covers the six lifecycle stages, but production adapters have not run it. Phase 3's current apply/create/verify code is a prototype: direct vault file writes bypass the target SSSS Operation Contract, and standalone creation does not call `ssss new` or prove an independent app runtime. The tracker has the acceptance boxes open again. Festech capability extraction remains later work in `gregiteen/festech-modular` (`CAPABILITY_APP_EXTRACTION`).
  - [TR_CORE_PLUGIN_SPLIT](docs/projects/planned/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md): planned. Split standard Total Recall features (tts, collab, obsidian, usage, … research, mesh) into white-label plugins, each in its own repo, behind new extension points (routes, tools, UI, hooks, config).
  - [EXTENSION_OVERHAUL](docs/projects/in-progress/EXTENSION_OVERHAUL/EXTENSION_OVERHAUL_PROJECT_TRACKER.md): browser extension API, page recall, and side panel redesign.

## Verification on 2026-09-26 (3.31.2)

- A source-exact Mac Mini checkout passed `check.mjs --tier remote` (six checks, full Vitest suite, zero findings), then native server boot reported version 3.31.2 from `/health`.
- The Mac Mini frontend build was copied to the publishing MacBook. `npm run check:dist`, `npm publish --dry-run`, and a clean install with the corrected root lockfile passed. Both production dependency audits reported zero findings. The npm registry served 3.31.2 with the published tarball checksum.

## Verification on 2026-09-26 (3.30.0)

- Merged the MacBook's two unpushed commits (white-label sweep, mesh address fix) onto `main` and resolved conflicts with 3.29.0's mesh changes.
- On the Mac Mini: `check.mjs --tier full` passed (dist freshness, open-source paths, shipped package paths, scaffold state, SSSS registry), and `npx vitest run` passed all 349 test files (exit 0).
- Published from the MacBook (it holds the npm login) with the Mac Mini's verified `frontend/dist`. Tests never run on the MacBook.
- Global rules now compile into every registered project's `INSTRUCTIONS.md`/`CLAUDE.md`/`AGENTS.md` (`compile --global` fans out).

## Verification on 2026-09-25

- A source-exact isolated copy on the Mac Mini passed `npm --prefix frontend run build` (`tsc -b` and Vite build).
- The same copy passed `npm test`: 336 test files and 1,908 tests.
- The local fast code-quality gate passed: dashboard bundle freshness, open-source paths, shipped package paths, scaffold brain state, and SSSS registry.
- `git diff --check` passed; the added text scan found no obvious credential tokens.
- The existing `v3.28.2` commit was integrated before the project-work commit. Its only differences from the tested source copy were the package version, lockfile, and changelog.

## Completed projects

- [RESEARCH_SYSTEM2](docs/projects/completed/RESEARCH_SYSTEM2/RESEARCH_SYSTEM2_PROJECT_TRACKER.md): archived 2026-09-25; its one follow-up is in `DEFERRED_BACKLOG.md`.

## Remaining live checks

- Install a public share link between independent Total Recall users. The HTTPS route and hash validation are tested, but the live exchange is still pending.
- Upgrade the second mesh node and verify a two-node plugin install. One node was still on 3.28.0 when last checked.
- Capture the signed-in Plugins page and reload the unpacked v0.2.0 extension in Chrome.

Keep these items in their project trackers until they are verified. Do not mark the projects complete from code or unit-test results alone.

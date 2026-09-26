# Handoff: Total Recall Current State

## Current state

- **Branch:** `main`
- **Package version:** `3.31.1` release candidate. `3.31.0` is published; the 3.31.1 credential-file permission fix and patched frontend dependency passed the Mac Mini gate and native boot on 2026-09-26. See `docs/developer/CHANGELOG.md`.
- **Source of truth:** SSSS VFS documents for persistent brain state. Plugin installation records and run events use the SSSS operation service.
- **Active project records:**
  - [PLUGIN_P2P](docs/projects/in-progress/PLUGIN_P2P/PLUGIN_P2P_PROJECT_TRACKER.md): bundled and installed plugins, explicit public sharing through hash-pinned HTTPS links, own-device mesh sharing, task runs, and dashboard management.
  - [CAPABILITY_DEPLOYMENT_PLUGINS](docs/projects/in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md): in progress. Phase 2 (manifest contract, source/resolve/plan, `app plan --json`) and part of Phase 2B (plugin scaffolding, `--from-skill`, design tokens) shipped in 3.30.0; shared adapter fixtures and the Phase 3 apply path remain. The `total-recall app` composer for deploying capability plugins into SSSS apps, plus extracting each Festech capability into its own plugin. The app-side reference work is in `gregiteen/festech-modular` (`CAPABILITY_APP_EXTRACTION`).
  - [TR_CORE_PLUGIN_SPLIT](docs/projects/planned/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md): planned. Split standard Total Recall features (tts, collab, obsidian, usage, … research, mesh) into white-label plugins, each in its own repo, behind new extension points (routes, tools, UI, hooks, config).
  - [EXTENSION_OVERHAUL](docs/projects/in-progress/EXTENSION_OVERHAUL/EXTENSION_OVERHAUL_PROJECT_TRACKER.md): browser extension API, page recall, and side panel redesign.

## Verification on 2026-09-26 (3.31.1 candidate)

- A source-exact Mac Mini checkout passed `check.mjs --tier remote` (six checks, full Vitest suite, zero findings), then native server boot reported version 3.31.1 from `/health`.
- The Mac Mini frontend build was copied to the publishing tree. `npm run check:dist` and `npm publish --dry-run` passed; both production dependency audits reported zero findings.

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

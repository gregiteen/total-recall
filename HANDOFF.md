# Handoff: Total Recall Current State

## Current state

- **Branch:** `main`
- **Package version:** `3.28.2`. The project work below is committed after the `v3.28.2` tag; it has not been published as a new npm version.
- **Source of truth:** SSSS VFS documents for persistent brain state. Plugin installation records and run events use the SSSS operation service.
- **Active project records:**
  - [PLUGIN_P2P](docs/projects/in-progress/PLUGIN_P2P/PLUGIN_P2P_PROJECT_TRACKER.md): bundled and installed plugins, explicit public sharing through hash-pinned HTTPS links, own-device mesh sharing, task runs, and dashboard management.
  - [CAPABILITY_DEPLOYMENT_PLUGINS](docs/projects/in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md): planned, not started. The `total-recall app` composer for deploying capability plugins into SSSS apps, plus extracting each Festech capability into its own plugin. The app-side reference work is in `gregiteen/festech-modular` (`CAPABILITY_APP_EXTRACTION`).
  - [TR_CORE_PLUGIN_SPLIT](docs/projects/planned/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md): planned. Split standard Total Recall features (tts, collab, obsidian, usage, … research, mesh) into white-label plugins, each in its own repo, behind new extension points (routes, tools, UI, hooks, config).
  - [EXTENSION_OVERHAUL](docs/projects/in-progress/EXTENSION_OVERHAUL/EXTENSION_OVERHAUL_PROJECT_TRACKER.md): browser extension API, page recall, and side panel redesign.

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
- Resolve the stale Headscale `laptop` entry identified by the PLUGIN_P2P tracker.

Keep these items in their project trackers until they are verified. Do not mark the projects complete from code or unit-test results alone.

# PLUGIN_P2P — Development Plan

> **Project Prefix**: `PLUGIN_P2P` · **Date**: 2026-09-22

## Phase 1 — Stop the bleeding (stability + honesty)
- [ ] Remove `CURATED_CATALOG`, ratings storage/endpoint, all rating/review/install/verified fields (REST, CLI, types, UI).
- [ ] Fix `const generatorPath` reassignment in `plugin-context.mjs`.
- [ ] Out-of-process runner (`plugin-runner.mjs`); `/run` requires `config:write`.
- [ ] Remove `root`/`projectRoot` request overrides.

**Done when:** S1 grep is empty; runner spec shows a `process.exit(1)` plugin returns output and the server keeps serving.

## Phase 2 — Layout + bundled plugins
- [ ] Plugin dirs → `skills/total-recall/plugins/` (project + global).
- [ ] Move `.agent/plugins/*` → `plugins/*`; add `plugins/` to package `files`.
- [ ] Fix meta-harness import (`TR_PACKAGE_ROOT`), system-monitor node count, honest authorship.
- [ ] `use_cases` + task `command` in validator and JSON schema; bundled manifests updated.

**Done when:** `plugin available` lists 4 bundled plugins; each installs into a temp project (spec S2).

## Phase 3 — Store, records, events
- [ ] `PluginRecordSchema` registered.
- [ ] `plugin-bundle.mjs` (hash/pack/unpack) + specs.
- [ ] `plugin-store.mjs` install/remove/share writing records + events; CLI and REST both call it.

**Done when:** spec S7 passes.

## Phase 4 — P2P
- [ ] `plugins-mesh.mjs` peer routes.
- [ ] `plugin-peers.mjs` listing + fetch/verify.
- [ ] `peer:<host>/<id>` install source; CLI `peers`, `share`, `unshare`.

**Done when:** S3/S4 specs pass; live peer check reported honestly.

## Phase 5 — Tasks
- [ ] `plugin-tasks.mjs` cron matcher + due runner, wired into `daemon-loop.mjs`.

**Done when:** S6 spec passes.

## Phase 6 — Dashboard
- [ ] Rewrite `PluginsPage.tsx` into Installed / Bundled / On the mesh; use-case filter; share toggle; provenance + hash display.

**Done when:** page renders in preview with real data; component spec updated.

## Phase 7 — Verify
- [ ] Full vitest suite (Mac mini per standing rule), boot `node src/server/index.mjs`, code-quality gates in background.
- [ ] Rebuild frontend dist (dist freshness gate).

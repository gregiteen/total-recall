# Multi-IDE And System Integration Project Tracker

> **⚠️ CONSOLIDATED 2026-05-18 — DO NOT TRACK NEW WORK HERE.**
> Remaining work (Phase 5 `clients.json` + `status` extension, Phase 6 smoke
> tests) has been carried into the single active epic:
> `docs/projects/in-progress/sovereign-os-release-readiness/`.
> This file and its PRD/ARCHITECTURE/DEV_PLAN are retained as the
> authoritative integration contract.

- **Plane**: Projects
- **Status**: Consolidated into sovereign-os-release-readiness
- **Created**: 2026-05-17
- **Last Updated**: 2026-05-17 — Phase 0, Phase 1, Phase 2 initial MCP
  resource parity, Phase 3 scoped PATs, Phase 4 integration presets, and the
  first Phase 5 sync command verified with focused server tests, CLI
  temp-workspace checks, and frontend build.
- **Rule**: Do not mark any item complete unless the implementation is verified
  and the file/function evidence is listed next to the item.

## Phase 0: Contract Packet

- [x] Create PRD. Evidence:
  `docs/projects/in-progress/multi-ide-system-integration/PRD.md`.
- [x] Create architecture. Evidence:
  `docs/projects/in-progress/multi-ide-system-integration/ARCHITECTURE.md`.
- [x] Create development plan. Evidence:
  `docs/projects/in-progress/multi-ide-system-integration/DEV_PLAN.md`.
- [x] Create tracker. Evidence:
  `docs/projects/in-progress/multi-ide-system-integration/PROJECT_TRACKER.md`.

## Phase 1: Discovery And SSSS Resources

- [x] Add unauthenticated discovery manifest. Evidence:
  `apiRouter.get('/.well-known/total-recall.json')` in `src/server/api.mjs`;
  verified by `serves a well-known discovery manifest without requiring an API
  prefix` in `src/server/api.spec.mjs`.
- [x] Add OpenAI-compatible model listing. Evidence:
  `apiRouter.get('/v1/models')` and `loadCatalogModels()` in
  `src/server/api.mjs`; verified by `lists Total Recall catalog models through
  /v1/models` in `src/server/api.spec.mjs`.
- [x] Add Total Recall model alias normalization. Evidence:
  `resolveRequestedModel()` in `src/server/api.mjs` is used before local runtime
  calls; verified by `normalizes known Total Recall model aliases before calling
  the local runtime` in `src/server/api.spec.mjs`.
- [x] Add SSSS REST manifest. Evidence:
  `apiRouter.get('/api/ssss')` in `src/server/api.mjs`; verified by `serves
  SSSS resource manifest and individual resources` in `src/server/api.spec.mjs`.
- [x] Add SSSS REST resource reads. Evidence:
  `apiRouter.get('/api/ssss/instructions')`,
  `apiRouter.get('/api/ssss/skill/ssss')`, `apiRouter.get('/api/ssss/spec')`,
  `apiRouter.get('/api/ssss/references')`, and
  `apiRouter.get('/api/ssss/references/:name')` in `src/server/api.mjs`;
  verified by `serves SSSS resource manifest and individual resources` in
  `src/server/api.spec.mjs`.

## Phase 2: MCP Resource Parity

- [x] Add MCP `resources/list`. Evidence:
  `method === 'resources/list'` handler and `resourceCatalog()` in
  `src/server/mcp.mjs`; verified by `resource calls (sync-rpc): resources/list
  exposes SSSS and derived resources` in `src/server/mcp.spec.mjs`.
- [x] Add MCP `resources/read`. Evidence:
  `method === 'resources/read'` handler and `resourceContents()` in
  `src/server/mcp.mjs`; verified by `resource calls (sync-rpc): resources/read
  returns resource contents` in `src/server/mcp.spec.mjs`.
- [x] Expose SSSS instructions/spec/reference resources through MCP. Evidence:
  `resourceCatalog()` and `referenceResources()` in `src/server/mcp.mjs`;
  verified by `resources/list` and `resources/read` tests in
  `src/server/mcp.spec.mjs`.
- [x] Expose derived memory index resources through MCP. Evidence:
  `total-recall://memory/index` and `total-recall://memory/layers` entries in
  `resourceCatalog()` in `src/server/mcp.mjs`; verified by `resources/list`
  test in `src/server/mcp.spec.mjs`.

## Phase 3: Scoped PATs

- [x] Extend key schema with scopes and expiration. Evidence:
  `KNOWN_SCOPES`, `normalizeScopes()`, `isExpiredKey()`, and `issueKey(name,
  options)` in `src/server/keys.mjs`; verified by `stores scoped keys and
  evaluates exact and wildcard scopes` and `rejects expired keys` in
  `src/server/keys.spec.mjs`.
- [x] Add backward-compatible scope validation. Evidence:
  `normalizeKey()` defaults missing scopes to `['*']` in `src/server/keys.mjs`;
  verified by `stores only token hashes and validates issued PATs` and
  `migrates legacy plaintext keys without keeping the plaintext token` in
  `src/server/keys.spec.mjs`.
- [x] Add route-level scope checks. Evidence:
  `requireScope()` in `src/server/auth.mjs`; routes in `src/server/api.mjs` and
  `src/server/index.mjs` now declare required scopes for chat, models, SSSS,
  memory, MCP, sandbox, keys, config, files, tasks, TTS, and health; verified by
  `attaches PAT scopes and allows matching required scopes`, `rejects requests
  when the PAT lacks a required scope`, and `treats dashboard sessions as
  full-scope for route guards` in `src/server/auth.spec.mjs`.
- [x] Add dashboard scope picker. Evidence:
  `frontend/src/pages/ApiKeysPage.tsx` exposes selectable scopes and expiration
  when issuing keys; `frontend/src/api.ts` handles `{ keys, available_scopes }`;
  verified by `npm run build` in `frontend/`.
- [x] Add CLI scope flags for `generate-pat`. Evidence:
  `src/cli/generate-pat.mjs` supports `--scope`, `--scopes`, and `--expires`;
  verified with `AGENT_DIR=<temp> node bin/total-recall.mjs generate-pat --name
  scoped-test --scope memory:read,ssss:read --expires 1d`.

## Phase 4: Integration Presets

- [x] Add dashboard Integrations page. Evidence:
  `frontend/src/pages/IntegrationsPage.tsx` plus route/sidebar registration in
  `frontend/src/App.tsx`; verified by `npm run build` in `frontend/`.
- [x] Add Cursor preset. Evidence: `CLIENTS.cursor` in
  `src/cli/connect.mjs` writes `.cursor/rules/total-recall.mdc`; verified in a
  temporary workspace with `node bin/total-recall.mjs connect cursor --json`.
- [x] Add Claude Code preset. Evidence: `CLIENTS['claude-code']` in
  `src/cli/connect.mjs` symlinks `CLAUDE.md` to `INSTRUCTIONS.md`; verified in
  a temporary workspace with `connect claude-code --json`.
- [x] Add Codex preset. Evidence: `CLIENTS.codex` in `src/cli/connect.mjs`
  symlinks `AGENTS.md` to `INSTRUCTIONS.md`; verified in a temporary workspace
  with `connect codex --json`.
- [x] Add Antigravity/Gemini preset. Evidence: `CLIENTS.antigravity` and
  `CLIENTS.gemini` in `src/cli/connect.mjs`; verified in a temporary workspace
  with `connect antigravity --json` and `connect gemini --json`.
- [x] Add UltraChat preset. Evidence: `CLIENTS.ultrachat` and `apiDetails()` in
  `src/cli/connect.mjs`; verified with `connect ultrachat --brain
  https://brain.example.com --json`.
- [x] Add generic OpenAI-compatible preset. Evidence: `CLIENTS.generic` and
  `apiDetails()` in `src/cli/connect.mjs`; verified with `connect generic
  --brain https://brain.example.com --json`.
- [x] Add MCP preset. Evidence: `CLIENTS.mcp` and `apiDetails()` in
  `src/cli/connect.mjs`; verified with `AGENT_DIR=<temp> connect mcp --brain
  https://brain.example.com --json`.
- [x] Add `total-recall connect <client>`. Evidence: `src/cli/connect.mjs` and
  CLI router registration in `bin/total-recall.mjs`; verified across file,
  symlink, API, and MCP presets in temporary workspaces.

## Phase 5: Sync Fabric

- [x] Add `total-recall sync`. Evidence: `src/cli/sync.mjs` pulls
  `/api/instructions`, writes `INSTRUCTIONS.md`, updates/symlinks IDE shims,
  and records sync state; registered in `bin/total-recall.mjs`; verified against
  a temporary local HTTP server and temporary workspace.
- [x] Add `total-recall sync --watch`. Evidence: `src/cli/sync.mjs` implements
  `--watch` and `--interval` loop around the same verified `runOnce()` path.
- [ ] Add `.agent/config/clients.json`.
- [x] Add `.agent/config/sync-state.json`. Evidence: `writeSyncState()` in
  `src/cli/sync.mjs`; verified by temporary sync test checking the generated
  `.agent/config/sync-state.json`.
- [ ] Extend `total-recall status` to show registered clients and stale
  projections.

## Phase 6: Smoke Tests And Documentation Cleanup

- [x] Update stale IDE guides to use implemented commands. Evidence:
  `docs/guides/generic.md`, `cursor.md`, `claude-code.md`, `antigravity.md`,
  `windsurf.md`, `aider.md`, and UltraChat smoke instructions now reference
  implemented commands (`init`, `connect`, `sync`, `ingest`, `daemon`,
  `npm start`); verified with `rg` showing no remaining guide references to
  `total-recall install`, `sync-prompts`, `tr-coprocessor`, `compile-surface`,
  or `npx total-recall start`.
- [ ] Add UltraChat endpoint smoke test.
- [ ] Add Cursor/Claude/Codex projection smoke tests.
- [ ] Add MCP resource smoke test.
- [x] Run focused integration test suite. Evidence: `npx vitest run
  src/server/api.spec.mjs src/server/mcp.spec.mjs src/server/keys.spec.mjs
  src/server/auth.spec.mjs` passed on 2026-05-17 with 4 files and 24 tests.

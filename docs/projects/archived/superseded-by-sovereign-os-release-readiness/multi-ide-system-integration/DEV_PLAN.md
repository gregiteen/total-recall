# Multi-IDE And System Integration Development Plan

- **Plane**: Delivery
- **Status**: In progress
- **Created**: 2026-05-17

## Phase 0: Contract Packet

Create the planning artifacts and freeze the intended integration contract before
expanding implementation.

Deliverables:

- PRD.
- Architecture.
- Development plan.
- Tracker.

Acceptance:

- Documents exist under `docs/projects/in-progress/multi-ide-system-integration/`.
- Tracker avoids unchecked/checked ambiguity and references concrete files for
  completed items.

## Phase 1: Discovery And SSSS Resources

Make the brain self-describing.

Deliverables:

- `GET /.well-known/total-recall.json`.
- `GET /v1/models`.
- Model alias normalization for known Total Recall catalog aliases.
- `GET /api/ssss`.
- `GET /api/ssss/instructions`.
- `GET /api/ssss/skill/ssss`.
- `GET /api/ssss/spec`.
- `GET /api/ssss/references`.
- `GET /api/ssss/references/:name`.
- Tests for each new contract.

Acceptance:

- Clients can discover endpoints and model IDs without reading docs.
- Resource responses include `sha256`, `bytes`, and `modified`.
- Known public model alias `total-recall/gemma4` does not break local Ollama
  requests.

## Phase 2: MCP Resource Parity

Expose SSSS context through MCP resources.

Deliverables:

- `resources/list`.
- `resources/read`.
- SSSS instructions/spec/reference resources.
- Derived memory index resources.
- Tests for resource listing and reads.

Acceptance:

- MCP clients can bootstrap SSSS context through resources without custom file
  paths.

## Phase 3: Scoped PATs

Reduce auth friction without making every token all-powerful.

Deliverables:

- Key schema extension for scopes and optional expiration.
- Backward-compatible validation for existing keys.
- Scope checks on API groups.
- Dashboard scope selection.
- CLI scope flags for `generate-pat`.

Acceptance:

- Existing PATs still work.
- New PATs can be read-only or MCP-only.
- Revocation and last-used tracking still work.

## Phase 4: Integration Presets

Turn manual setup into guided setup.

Deliverables:

- Dashboard Integrations page.
- Presets for Cursor, Claude Code, Codex, Antigravity/Gemini, UltraChat, MCP,
  and generic OpenAI-compatible clients.
- Copyable config snippets.
- CLI `connect <client>` command.

Acceptance:

- A user can connect a supported client without reading implementation docs.

## Phase 5: Sync Fabric

Make remote brain to workspace projection explicit and observable.

Deliverables:

- `total-recall sync`.
- `total-recall sync --watch`.
- `.agent/config/clients.json`.
- `.agent/config/sync-state.json`.
- `total-recall status` shows connected clients and stale projections.

Acceptance:

- Local workspaces can pull remote instructions and refresh IDE shims.
- Status clearly reports drift.

## Phase 6: Smoke Tests And Documentation Cleanup

Verify the end-to-end system and remove outdated instructions.

Deliverables:

- UltraChat smoke test.
- Cursor/Claude/Codex file projection smoke tests.
- MCP resource smoke test.
- Docs updated to use real commands only.

Acceptance:

- Project tracker is updated only for tested behavior.
- No guide references removed commands such as `install`, `sync-prompts`,
  `tr-coprocessor`, or `start` unless those commands are reintroduced.


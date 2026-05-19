# Multi-IDE And System Integration PRD

- **Plane**: Product
- **Status**: In progress
- **Created**: 2026-05-17
- **Owner**: Total Recall

## Summary

Total Recall should act as a self-hosted AI brain that any IDE, product, CLI
agent, or workflow automation can discover and use with minimal custom setup.
The system already has the core ingredients: SSSS filesystem projections, an
OpenAI-compatible chat endpoint, Bearer PAT authentication, a dashboard key UI,
and an MCP gateway. The product gap is that these surfaces are not yet packaged
as a single integration contract.

This project turns Total Recall into a self-describing local/remote provider for:

- Multi-IDE memory projection.
- OpenAI-compatible model access.
- MCP memory/resource access.
- UltraChat model/provider registration.
- Script, webhook, and automation usage through scoped PATs.

## Problem

Users working across Cursor, Claude Code, Codex, Antigravity, UltraChat, and
custom scripts need one consistent way to connect those systems to the same
memory and model runtime. Today the implementation supports parts of this, but
users must infer too much:

- Which endpoint should a system call?
- Which model ID should be used?
- Where are PATs issued?
- Which files should each IDE read?
- How does an external agent discover SSSS instructions and references?
- What commands are real versus legacy documentation?

The result is unnecessary setup friction and brittle integrations.

## Goals

- Expose a stable discovery manifest for clients.
- Expose OpenAI-compatible model discovery.
- Expose SSSS instructions, schema, skill, and references through REST and MCP.
- Make PAT creation and usage obvious from CLI and UI.
- Support multiple IDEs concurrently through file projections and live MCP/API.
- Make UltraChat integration depend on explicit contracts instead of tribal
  knowledge.
- Add smoke tests that prove the integration surface works before tracker items
  are marked complete.

## Non-Goals

- Replacing SSSS with a database.
- Requiring every IDE to support MCP.
- Building a full OAuth provider in the first milestone.
- Rewriting the local runtime or changing the memory schema.
- Exposing raw local filesystem paths to remote clients.

## User Stories

- As a developer using three IDEs, I can connect each IDE to the same Total
  Recall brain and know which surface it is using.
- As an UltraChat user, I can select a Total Recall model and send requests to a
  stable OpenAI-compatible endpoint.
- As an MCP-capable agent, I can discover and read Total Recall instructions,
  SSSS references, and memory indexes through MCP resources.
- As an automation author, I can create a PAT, call `/v1/chat/completions`, and
  query memory without opening the dashboard again.
- As a security-conscious user, I can issue scoped tokens and revoke them.

## Current Baseline

- Chat endpoint: `POST /v1/chat/completions`.
- Model health: `GET /api/health`.
- PAT lifecycle: `GET/POST/DELETE /api/keys`.
- Dashboard key UI: `/keys`.
- Compiled instructions: `GET /api/instructions`.
- MCP tool endpoint: `POST /mcp`.
- File projections: `INSTRUCTIONS.md`, `.cursorrules`, `CLAUDE.md`,
  `.clauderules`, `AGENTS.md`, `GEMINI.md`.
- Session ingestion: Claude Code, Codex, Gemini CLI, Antigravity, Cursor.

## Requirements

### Discovery

- Provide `GET /.well-known/total-recall.json`.
- Manifest must include endpoint URLs, auth scheme, capabilities, and resource
  entrypoints.
- Manifest must not leak PATs, secrets, local-only memory contents, or absolute
  filesystem paths.

### Model Provider Contract

- Provide `GET /v1/models`.
- Include Total Recall catalog models and active runtime metadata.
- Normalize known public model aliases such as `total-recall/gemma4` to the
  configured local runtime model before forwarding to Ollama or llama.cpp.
- Keep `/v1/chat/completions` OpenAI-compatible.

### SSSS Resource Contract

- Provide REST endpoints for:
  - Manifest.
  - Compiled instructions.
  - SSSS skill.
  - Canonical SSSS spec.
  - SSSS reference documents.
- Provide hashes and modified timestamps so clients can cache safely.
- Provide matching MCP resources for MCP clients.

### Integrations UX

- Dashboard should show integration presets for common clients.
- CLI should support a `connect` workflow for common clients.
- Output should include exact endpoint, token usage, and file/MCP setup.

### Auth And Security

- Existing PAT flow remains supported.
- Add scoped PATs in a later milestone.
- Public discovery endpoints must reveal only non-sensitive metadata.
- Authenticated APIs continue to require Bearer PAT or dashboard session.

## Success Metrics

- A new client can discover endpoints from one manifest URL.
- UltraChat can list and call a Total Recall model without hard-coded local
  knowledge.
- MCP clients can read the SSSS instructions/spec as resources.
- A user can connect Cursor, Claude Code, and Codex to the same brain with a
  clear CLI/dashboard flow.
- Integration smoke tests cover discovery, model list, SSSS REST, MCP resources,
  PAT auth, and chat alias normalization.


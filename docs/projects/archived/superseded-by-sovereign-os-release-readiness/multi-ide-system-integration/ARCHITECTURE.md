# Multi-IDE And System Integration Architecture

- **Plane**: Architecture
- **Status**: In progress
- **Created**: 2026-05-17

## Mental Model

Total Recall exposes one canonical brain through multiple client-specific
surfaces:

```text
Total Recall Brain
  -> .agent/memory-vault/          canonical SSSS source of truth
  -> .agent/memory-derived/        disposable indexes and projections
  -> INSTRUCTIONS.md               Tier 1 hot memory
  -> .agent/skills/*/SKILL.md      Tier 2 progressive disclosure
  -> /v1/chat/completions          OpenAI-compatible chat/model gateway
  -> /mcp                          MCP tools and resources
  -> /api/ssss/*                   SSSS REST resources
  -> /.well-known/total-recall.json discovery manifest
```

File-reading IDEs consume projections. API-driven products consume REST or MCP.
UltraChat consumes both: model metadata plus OpenAI-compatible chat.

## Interface Layers

### 1. File Projection Layer

The surface compiler writes canonical `INSTRUCTIONS.md` and updates known IDE
shims:

- `.cursorrules`
- `CLAUDE.md`
- `.clauderules`
- `AGENTS.md`
- `GEMINI.md`

This remains the lowest-friction offline path. If an IDE can read project files,
it can consume Total Recall hot memory.

### 2. Chat/Model Layer

`/v1/chat/completions` is the Total Recall model/provider gateway. Clients should
call this endpoint instead of raw Ollama when they want SSSS memory injection,
tool loops, session logging, and auth.

`/v1/models` provides OpenAI-compatible model discovery. Public model names are
aliases that can map to the local runtime model configured in
`.agent/config/runtime.yml`.

### 3. SSSS Resource Layer

REST endpoints expose non-secret SSSS integration material:

- `/api/ssss`
- `/api/ssss/instructions`
- `/api/ssss/skill/ssss`
- `/api/ssss/spec`
- `/api/ssss/references`
- `/api/ssss/references/:name`

Each resource response includes content, SHA-256, byte size, and modified time.
This supports deterministic caching and synchronization.

### 4. MCP Layer

The MCP gateway remains the primary live agent bridge. Tools are for actions;
resources are for context.

Core tools:

- `read_memory`
- `write_memory`
- `search_memory`
- `list_memory`
- `run_sandbox`
- `recompile_surface`

Core resources:

- `total-recall://instructions`
- `total-recall://ssss/skill`
- `total-recall://ssss/spec`
- `total-recall://ssss/references/<name>`
- `total-recall://memory/index`
- `total-recall://memory/layers`

### 5. Discovery Layer

`/.well-known/total-recall.json` is unauthenticated and contains only public
metadata:

- Product name and version.
- Capability list.
- Endpoint map.
- Auth scheme.
- Token issuance hints.
- Resource manifest URL.
- MCP URL.

It must not include local absolute paths, PAT values, secrets, or memory content.

## Auth Model

Current auth:

- Dashboard session cookie.
- Bearer PAT stored as a SHA-256 hash in `keys.jsonl`.

Target auth:

- Scoped PATs.
- Optional expiration.
- Client labels and integration presets.
- Future OAuth/device flow for products that need delegated auth.

Initial integration work keeps the existing PAT validation path and adds
contracts around it.

## Client Modes

| Mode | Clients | Surface |
|------|---------|---------|
| File-only | Cursor, Claude Code, Codex, Antigravity | `INSTRUCTIONS.md` and IDE shims |
| API-only | scripts, webhooks, UltraChat chat | `/v1/*`, `/api/*` |
| MCP-live | MCP-aware IDE agents | `/mcp` tools/resources |
| Hybrid | UltraChat, advanced IDEs | `/v1/*` + `/mcp` + file projection |

## Failure Behavior

- Missing resource files return 404 with a clear error.
- Missing local runtime falls back to frontier routing when configured.
- Unknown model aliases are forwarded unchanged only when they are not known
  Total Recall aliases.
- Discovery must still respond even if the local model is offline.

## Verification Strategy

- Unit/integration tests for discovery, models, SSSS REST, MCP resource reads,
  and auth behavior.
- Smoke tests for UltraChat endpoint compatibility.
- CLI tests for future `connect` and `sync` workflows.
- Tracker items remain unchecked until tests or code references prove the
  implementation exists.


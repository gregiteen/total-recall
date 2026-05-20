# Total Recall REST API & Gateway Reference

- **Plane**: Reference
- **Status**: Active
- **Version**: 3.0.0
- **Summary**: Complete specification of the Total Recall REST API endpoints, Personal Access Tokens (PATs) system, scopes, and the JSON-RPC Model Context Protocol (MCP) gateway.

---

## 🔒 Authentication & Access Control

All API and MCP endpoints (except public discovery and health checks) require bearer authentication via a **Personal Access Token (PAT)**.

- **Header Format**: `Authorization: Bearer tr_<token>`
- **Token Generation**: Use the CLI to issue tokens with specific labels and granular scopes:
  ```bash
  npx total-recall generate-pat --scopes "chat:write,memory:read" --label "my-editor-plugin"
  ```

### API Scopes

Total Recall implements role-based granular scopes to enforce security boundaries (e.g., separating read-only visualization dashboard clients from write-capable IDE agents).

| Scope | Description |
|-------|-------------|
| `*` | Full system access |
| `chat:read` | Retrieve model listings |
| `chat:write` | Request streaming or blocking chat completions |
| `memory:read` | Read memory nodes, SSSS graphs, statistics, and ingested sessions |
| `memory:write` | Create, modify, or delete memory nodes and ingested session trees |
| `memory:recompile` | Trigger surface compilation (rebuilding `INSTRUCTIONS.md` from raw vault nodes) |
| `keys:read` | Enumerate active personal access tokens (removes raw secrets) |
| `keys:write` | Issue new access keys or revoke existing keys |
| `sandbox:run` | Execute untrusted script components within the hardened local VFS sandbox |
| `config:read` | Inspect sanitized system and model runtime configs |
| `mcp:use` | Direct access to execute JSON-RPC tools and resources via the MCP gateway |
| `health:read` | Basic system check (disk, vault stats, Ollama status) |

---

## 🚀 Endpoint Reference

### 🧠 Memory Node Management

These endpoints allow remote clients to query, create, update, or archive SSSS markdown memory nodes.

#### `GET /api/memory`
List memory nodes. Supports query parameters for fuzzy searching and filtering.
- **Scope required**: `memory:read`
- **Query Parameters**:
  - `q`: Search query string (fuzzy content matching).
  - `category`: Filter by category (`facts`, `patterns`, `concepts`, `preferences`, `corrections`).
  - `tag`: Filter by tag name.
  - `limit`: Maximum results to return (default: 50).
  - `offset`: Pagination offset.

#### `GET /api/memory/stats`
Retrieve a high-level summary of node counts grouped by their SSSS categories.
- **Scope required**: `memory:read`

#### `GET /api/memory/:slug`
Fetch a single SSSS markdown node by its unique kebab-case slug.
- **Scope required**: `memory:read`

#### `POST /api/memory`
Create a new SSSS memory node. Writes a physical `.md` file to the vault with valid SSSS frontmatter.
- **Scope required**: `memory:write`
- **Request Body** (JSON):
  ```json
  {
    "slug": "git-commit-convention",
    "title": "Git Commit Convention",
    "category": "preferences",
    "priority": "normal",
    "body": "Always format git commits with semantic prefixes like `feat:`, `fix:`, or `docs:`."
  }
  ```

#### `PUT /api/memory/:slug`
Fully replace the SSSS node at the specified slug.
- **Scope required**: `memory:write`

#### `PATCH /api/memory/:slug`
Partially update specific metadata or body attributes of an existing node.
- **Scope required**: `memory:write`

#### `DELETE /api/memory/:slug`
Archive or permanently delete the SSSS memory node matching the slug.
- **Scope required**: `memory:write`

---

### 🔍 Memory Intelligence

#### `POST /api/memory/search/semantic`
Perform vector-based semantic search across your entire memory vault.
- **Scope required**: `memory:read`
- **Requirement**: Local Ollama server must be reachable with the embedding model loaded.
- **Request Body**:
  ```json
  {
    "query": "how should I handle error logging in TypeScript?",
    "top_k": 5
  }
  ```
- **Response**: Returns a similarity-ranked array of SSSS nodes with cosine similarity scores.

---

### ⚙️ Vault Compilation

#### `POST /api/vault/compile`
Triggers an immediate re-compilation of the SSSS memory vault surface. Resolves wiki-links, weights, and generates the compiled system instruction shim (`INSTRUCTIONS.md`).
- **Scope required**: `memory:recompile`

#### `GET /api/vault/status`
Returns high-level statistics about the active compilation target, such as the total count of active nodes, skill templates, and the timestamp of the last compilation.
- **Scope required**: `memory:read`

---

### 🔑 Token Management (Keys API)

Allows programmatic token management for applications.

#### `GET /api/keys`
List active PAT metadata (does not reveal raw secret tokens for security).
- **Scope required**: `keys:read`

#### `POST /api/keys`
Issue a new Personal Access Token.
- **Scope required**: `keys:write`
- **Request Body**:
  ```json
  {
    "label": "Obsidian Mirror Client",
    "scopes": ["memory:read"],
    "expires_at": "2026-12-31T23:59:59.000Z"
  }
  ```
- **Response**: Returns the newly generated raw token `tr_<secret>`. *This token is only shown once.*

#### `DELETE /api/keys/:id`
Revoke and permanently delete a Personal Access Token.
- **Scope required**: `keys:write`

---

### 🔄 Ingest Fabric (Session Sync)

Allows local relay daemons and workspace environments to upload conversation traces, ensuring the Dream Cycle can continuously extract fresh memories from daily workflows.

#### `GET /api/sessions`
List all ingested conversation sessions.
- **Scope required**: `memory:read`

#### `GET /api/sessions/:id`
Retrieve the full message logs and metadata for a specific ingested conversation session.
- **Scope required**: `memory:read`

#### `POST /api/sessions/ingest`
Upload a new conversation session to the ingest fabric. Deduplicates automatically based on message content SHA-256 fingerprints.
- **Scope required**: `memory:write`
- **Request Body**:
  ```json
  {
    "id": "conv-uuid-1234",
    "source": "claude-code",
    "messages": [
      { "role": "user", "content": "Let's use absolute imports in TypeScript.", "timestamp": "2026-05-19T22:00:00Z" },
      { "role": "assistant", "content": "Got it, I will update tsconfig.json to support absolute paths.", "timestamp": "2026-05-19T22:00:15Z" }
    ]
  }
  ```

#### `DELETE /api/sessions/:id`
Delete an ingested session.
- **Scope required**: `memory:write`

---

### 🗃 Hardened Sandbox

#### `POST /api/sandbox`
Safely execute arbitrary Node.js scripts inside a secure, localized VFS sandbox context.
- **Scope required**: `sandbox:run`
- **Request Body**:
  ```json
  {
    "code": "const fs = require('fs'); console.log(fs.readdirSync('.'));"
  }
  ```

---

### 💬 Chat Completions (OpenAI Compatible)

Enables third-party applications (like UltraChat or customized frontends) to query your server as a standard LLM backend.

#### `GET /v1/models`
Returns list of available models running locally on Ollama.
- **Scope required**: `chat:read` or Localhost bypass.

#### `POST /v1/chat/completions`
Send a chat prompt to the local LLM. The system **automatically injects the compiled `INSTRUCTIONS.md` system prompt** on the fly, making your agent instantly self-aware of all personal preferences and facts.
- **Scope required**: `chat:write`
- **Supports**: Server-Sent Events (SSE) streaming (`stream: true`), temperature, top_p, and stop configurations.

---

### 🔬 Research Queue

Enables agents to query or add topics to the autonomous research daemon.

#### `GET /api/research`
Enumerate active research agenda tasks, findings, and statuses.
- **Scope required**: `memory:read`

#### `POST /api/research`
Queue a new research topic.
- **Scope required**: `memory:write`
- **Request Body**:
  ```json
  {
    "topic": "Tailwind v4 alpha configuration best practices",
    "priority": "high",
    "notes": "Analyze standard CSS entrypoints."
  }
  ```

#### `DELETE /api/research/:id`
Cancel or remove a research topic.
- **Scope required**: `memory:write`

---

### 🌐 Discovery & System Health

#### `GET /.well-known/total-recall.json`
Public manifest allowing client auto-configuration.
- **Authentication**: None required.
- **Response**: Emits base URLs, API versions, MCP capability links, supported scopes, and rates limits.

#### `GET /health`
Verify system status.
- **Authentication**: None required.
- **Response**: Emits disk availability, SSSS vault size, Ollama connectivity status, and background daemon health states.

---

## 🔌 Model Context Protocol (MCP) Gateway

Total Recall features a built-in JSON-RPC MCP gateway at `http://localhost:3000/mcp` (or your remote domain counterpart).

### Available MCP Resources
- `total-recall://instructions` — The fully compiled system memory file.
- `total-recall://memory/index` — Structured list of all memory vault nodes.
- `total-recall://ssss/skill` — Detailed syntax references for constructing SSSS-compliant nodes.

### Available MCP Tools
Total Recall exposes powerful filesystem, memory, and automation tools to IDE agents:

1. **`list_memory`**: Enumerate vault memory nodes.
2. **`read_memory`**: Fetch raw markdown of a memory node by slug.
3. **`write_memory`**: Create or edit SSSS memory nodes.
4. **`delete_memory`**: Archive a node.
5. **`search_memory`**: Perform text searching on memory folders.
6. **`semantic_search`**: High-performance semantic match via local embeddings.
7. **`recompile_surface`**: Trigger an immediate system compile.
8. **`run_sandbox`**: Safe sandbox execution.
9. **`read_file` / `list_directory` / `search_files`**: Hardened workspace utilities.

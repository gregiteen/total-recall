# Total Recall — REST API Specification

Comprehensive guide to all secure REST endpoints, Personal Access Token (PAT) authentication schemas, scopes, and parameters.

---

## 🔒 Security & Bearer Authentication

All inbound requests (with the exception of public health checks and setup wizards) must include the secure Personal Access Token (PAT) in the HTTP headers:

- **Format**: `Authorization: Bearer tr_<token>`
- **Token Creation**: Tokens are issued via the CLI using labels and granular scopes to restrict access permissions (e.g. read-only dashboard visualizations vs. write-capable IDE agents):
  ```bash
  npx total-recall generate-pat --scopes "memory:read,chat:write" --label "my-editor-plugin"
  ```

### API Access Scopes

| Scope | Allowed Operations / Subsystem Access |
| :--- | :--- |
| `*` | Full system access. |
| `chat:read` | Retrieve model listings. |
| `chat:write` | Stream or post chat completions. |
| `memory:read` | Read SSSS memory nodes, graphs, metrics, and session logs. |
| `memory:write` | Create, modify, and delete memory nodes and ingested sessions. |
| `memory:recompile`| Re-compile rule surfaces and rebuild shims (`INSTRUCTIONS.md`). |
| `keys:read` | Inspect token registries (excludes raw tokens). |
| `keys:write` | Provision or revoke Personal Access Tokens. |
| `sandbox:run` | Execute sandboxed scripts in the hardened sandbox context. |
| `config:read` | Inspect system parameters and model mappings. |
| `health:read` | Check VFS stats and daemon health indicators. |

---

## 🚀 Endpoint Catalog

### 🧠 1. Memory Node CRUD

For creating, reading, updating, and deleting SSSS Markdown nodes inside your active brains.

#### `GET /api/memory`
List memory nodes.
- **Scope**: `memory:read`
- **Query Parameters**:
  - `q`: Search query string (fuzzy content matching).
  - `category`: Filter by SSSS folder (`facts`, `patterns`, `concepts`, `preferences`, etc.).
  - `tag`: Filter by tag list.
  - `limit`: Maximum results to return (default: 50).

#### `GET /api/memory/:slug`
Fetch a single SSSS Markdown node by its kebab-case slug name.
- **Scope**: `memory:read`

#### `POST /api/memory`
Create a new SSSS memory node, writing a `.md` file to the target vault directory.
- **Scope**: `memory:write`
- **Request Body (JSON)**:
  ```json
  {
    "slug": "atomic-writes",
    "title": "Use Atomic Writes",
    "category": "patterns",
    "priority": "normal",
    "body": "Always write to a temp file and rename it to target path."
  }
  ```

#### `PUT /api/memory/:slug`
Completely overwrite an existing SSSS memory node.
- **Scope**: `memory:write`

#### `PATCH /api/memory/:slug`
Partially update metadata or content of a memory node.
- **Scope**: `memory:write`

#### `DELETE /api/memory/:slug`
Archive or permanently remove the memory node matching the slug.
- **Scope**: `memory:write`

---

### 🔍 2. Brain Layer & Configuration Services

For managing the global and local project brain cascade.

#### `GET /api/brains`
Retrieve all registered brain layers with active path indicators and node counts.
- **Scope**: `memory:read`
- **Response Shape (JSON)**:
  ```json
  [
    {
      "id": "global",
      "name": "Global Brain Layer",
      "path": "/Users/username/.agent/skills/total-recall",
      "nodeCount": 32,
      "lastCompiled": "2026-05-25T12:00:00Z"
    },
    {
      "id": "project",
      "name": "total-recall",
      "path": "/Users/username/Github/total-recall/.agent/skills/total-recall",
      "nodeCount": 15,
      "lastCompiled": "2026-05-25T14:02:00Z"
    }
  ]
  ```

#### `GET /api/brains/:id/nodes`
List memory nodes belonging exclusively to the specified brain layer.
- **Scope**: `memory:read`

#### `POST /api/vault/compile`
Triggers an immediate re-compilation of SSSS rule surfaces and hot shims.
- **Scope**: `memory:recompile`

#### `GET /api/vault/status`
Returns compilation metrics (node counts, skill routing logs, compilation time).
- **Scope**: `memory:read`

---

### 🔬 3. Background Research Queue

Interacts with the autonomous web search and research queue.

#### `GET /api/research`
Enumerate active research agenda tasks, enqueued topics, and execution statuses.
- **Scope**: `memory:read`
- **Query Parameters**:
  - `status`: Filter by research status (`pending`, `in_progress`, `done`, `failed`).
  - `query`: Fuzzy query search across topics and research notes.

#### `POST /api/research`
Queue a new topic for deep background research.
- **Scope**: `memory:write`
- **Request Body (JSON)**:
  ```json
  {
    "topic": "Vite 6 configuration changes",
    "priority": "high",
    "notes": "Verify default CSS loaders."
  }
  ```

#### `DELETE /api/research/:id`
Cancel and cancel/delete a pending or running research topic.
- **Scope**: `memory:write`

---

### 🔄 4. Local Ingest Fabric (Session Sync)

Receives conversation files from background workstation Relays.

#### `GET /api/sessions`
List all ingested conversation sessions.
- **Scope**: `memory:read`

#### `POST /api/sessions/ingest`
Upload conversation history log traces. The system **automatically deduplicates** logs based on a SHA-256 content-hash fingerprint of message sequences to prevent redundant storage.
- **Scope**: `memory:write`
- **Request Body (JSON)**:
  ```json
  {
    "id": "session-uuid-1234",
    "source": "claude-code",
    "messages": [
      {
        "role": "user",
        "content": "Let's use absolute imports in TypeScript.",
        "timestamp": "2026-05-25T14:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Updated tsconfig.json to map path aliases.",
        "timestamp": "2026-05-25T14:00:10Z"
      }
    ]
  }
  ```

---

### 🔑 5. PAT Token Management (Keys API)

Allows programmatic Personal Access Token operations.

#### `GET /api/keys`
List active PAT token metadata (excludes raw cryptographic secret strings for security).
- **Scope**: `keys:read`

#### `POST /api/keys`
Issue a new Personal Access Token. *Raw secret string `tr_...` is only shown once in the response.*
- **Scope**: `keys:write`
- **Request Body (JSON)**:
  ```json
  {
    "label": "My Editor Hook",
    "scopes": ["memory:read"],
    "expires_at": "2026-12-31T23:59:59Z"
  }
  ```

#### `DELETE /api/keys/:id`
Revoke and permanently delete the specified Personal Access Token.
- **Scope**: `keys:write`

---

### 🗃️ 6.硬 Hardened Sandbox

#### `POST /api/sandbox`
Run arbitrary script modules inside a secure POSIX-isolated sandbox.
- **Scope**: `sandbox:run`
- **Requirement**: Hardened sandbox must be explicitly enabled (`security.yml.sandbox.enabled: true`). Returns 403 Forbidden otherwise.
- **Request Body (JSON)**:
  ```json
  {
    "code": "const fs = require('fs'); console.log(fs.readdirSync('.'));"
  }
  ```

---

### 💬 7. Chat Completions (OpenAI Compatible)

Exposes endpoints for chat clients (such as UltraChat or customized dashboard interfaces) to communicate with the brain.

#### `GET /v1/models`
Returns list of registered active generative models available on the server.
- **Scope**: `chat:read` or Local loopback bypass.

#### `POST /v1/chat/completions`
Send a chat completions prompt. The server **automatically injects the compiled `INSTRUCTIONS.md` system prompt** on the fly, rendering the model instantly self-aware of all invariants and preferences.
- **Scope**: `chat:write`
- **Supports**: Server-Sent Events (SSE) stream (`stream: true`), temperature, top_p, and stop configurations.

---

### 🌐 8. Discovery & Health Diagnostics

#### `GET /.well-known/total-recall.json`
Public configuration manifest detailing system endpoints, versions, allowed scopes, and rate limits.
- **Authentication**: None required.

#### `GET /health`
Diagnostics check showing server status.
- **Authentication**: None required.
- **Response Shape (JSON)**:
  ```json
  {
    "status": "healthy",
    "disk": { "available": "42GB", "usedPercent": "45%" },
    "vault": { "nodeCount": 47 },
    "daemon": { "isRunning": true, "lastDreamCycle": "2026-05-25T13:40:00Z" }
  }
  ```

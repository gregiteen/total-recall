# Total Recall — CLI & REST API Manual

This reference manual documents the complete CLI commands and REST API endpoints available inside the **Total Recall Sovereign AI OS**.

---

## 1. CLI Commands Reference

Execute commands using `npx total-recall <command>` or `node src/cli/index.mjs <command>`.

### 1.1 `init`
Initialize a fresh Total Recall workspace.
*   **Syntax**: `npx total-recall init [options]`
*   **Options**:
    *   `--vault <path>`: Custom location for memory vault.
    *   `--force`: Re-initialize and overwrite pre-existing shims.

### 1.2 `compile`
Rebuild the derived indexes and compile memory surfaces.
*   **Syntax**: `npx total-recall compile`
*   **Description**: Re-scans `.agent/memory-vault/`, rebuilds TF-IDF skill routing, builds Obsidian canvas graph files, generates `INSTRUCTIONS.md`, and propagates invariants to all local IDE rule shims.

### 1.3 `connect`
Configure an IDE or external client to bind to the Total Recall local server.
*   **Syntax**: `npx total-recall connect <client> [options]`
*   **Supported Clients**: `cursor`, `claude-code`, `antigravity`, `gemini`, `vscode`, `windsurf`, `aider`, `ultrachat`, `obsidian`.
*   **Options**:
    *   `--brain <url>`: Override default brain server URL.
    *   `--token <PAT>`: Inject bearer PAT credentials for authenticating requests.
    *   `--vault <path>`: Obsidian vault target directory.
    *   `--force`: Force overwrite existing rule shims.

### 1.4 `doctor`
Run system diagnostic suites and heal environment inconsistencies.
*   **Syntax**: `npx total-recall doctor`

### 1.5 `resolve`
Manually resolve quarantined memory conflicts.
*   **Syntax**: `npx total-recall resolve --supersede <node-slug> | --keep <node-slug>`

---

## 2. REST API Specification

The local Total Recall brain runs at `http://localhost:3000` by default.

### 2.1 Server Diagnostics

#### `GET /health`
Get loaded models, vault status, and server uptime.
*   **Response**: `200 OK`
```json
{
  "status": "healthy",
  "uptime": 3600,
  "model": "total-recall/gemma4",
  "embeddings": 142
}
```

#### `GET /api/vault/status`
Retrieve vault counts and sizing statistics.
*   **Response**: `200 OK`
```json
{
  "totalNodes": 128,
  "categories": {
    "invariants": 14,
    "patterns": 42,
    "facts": 12
  }
}
```

### 2.2 Memory Management

#### `GET /api/nodes`
List memory nodes filtered by category, status, or priority.
*   **Parameters**: `category` (optional), `status` (optional), `priority` (optional)

#### `GET /api/nodes/:slug`
Fetch a single memory node by its slug.

#### `POST /api/nodes`
Create or update a memory node.
*   **Headers**: `Authorization: Bearer <PAT>` (Required if auth is enabled)
*   **Body**: SSSS v2 node object.

#### `DELETE /api/nodes/:slug`
Archive a memory node (changes status to `archived`).

#### `POST /api/search`
Perform high-speed semantic vector search across vault nodes.
*   **Body**: `{"query": "my search text", "top_k": 5}`

### 2.3 Background Agenda

#### `GET /api/research/queue`
Retrieve the autonomous background researchagenda queue.

#### `POST /api/research/queue`
Add a topic to the autonomous research agenda.
*   **Body**: `{"topic": "rate limiting", "priority": "high", "notes": "audit current project limiters"}`

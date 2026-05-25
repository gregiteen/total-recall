# Total Recall REST API Reference

LLM agents securely communicate with the memory kernel using standard HTTP calls via shell execution (e.g. `curl`).

---

## 🔒 Authentication & Headers

All requests to the Total Recall REST API must include the Bearer token in the `Authorization` header.

*   **Header**: `Authorization: Bearer <PAT>`
*   **Active Bearer PAT Token**: `<YOUR_PAT_TOKEN>`
*   **Base URL (Remote Tunnel)**: `<YOUR_BRAIN_URL>`
*   **Base URL (Local)**: `http://localhost:3000`

---

## 🧭 Endpoint Reference

### 1. Check System Health
Returns the status of the vault, embeddings index, and LLM reachability.

*   **Method / Route**: `GET /health`
*   **Example curl**:
    ```bash
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/health
    ```
*   **Response Format (`application/json`)**:
    ```json
    {
      "status": "healthy",
      "version": "3.0.0",
      "uptime_seconds": 123,
      "timestamp": "2026-05-21T03:50:00.000Z",
      "disk": {
        "free": 85899345920,
        "total": 107374182400
      },
      "cli_agents": ["antigravity", "gemini", "claude", "codex"],
      "daemon": "running",
      "emergency_alerts": null,
      "vfs": {
        "exists": true,
        "skill_exists": true,
        "path": "/Users/greg/.agent"
      }
    }
    ```

---

### 2. Vault Status Summary
Provides a high-level summary of the semantic vault.

*   **Method / Route**: `GET /api/vault/status`
*   **Example curl**:
    ```bash
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/vault/status
    ```

---

### 3. List Vault Nodes
Returns a list of all SSSS memory nodes. Supports query filtering by `q` (text search), `category`, or `tag`.

*   **Method / Route**: `GET /api/memory`
*   **Query Parameters**:
    *   `q` (optional): Plain-text keyword search
    *   `category` (optional): `facts` / `patterns` / `concepts` / `preferences` / `corrections` / `invariants`
    *   `tag` (optional): Freeform tag filter
*   **Example curl**:
    ```bash
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      "<YOUR_BRAIN_URL>/api/memory?category=invariants"
    ```

---

### 4. Fetch a Memory Node
Retrieves a single SSSS memory node by its unique slug.

*   **Method / Route**: `GET /api/memory/:slug`
*   **Example curl**:
    ```bash
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/memory/chocolate-brownies
    ```

---

### 5. Create a Memory Node (Upsert)
Saves a memory node directly to the local filesystem vault. Accepts both `"content"` (preferred) and `"body"` (fallback) for the markdown text body payload.

*   **Method / Route**: `POST /api/memory`
*   **Headers**: `Content-Type: application/json`
*   **Example curl**:
    ```bash
    curl -X POST \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{
        "slug": "atomic-writes",
        "category": "patterns",
        "title": "Always write files atomically",
        "status": "active",
        "confidence": 0.95,
        "importance": 4,
        "modality": "must",
        "content": "Always write files atomically by creating a temporary file first and renaming it to prevent partial file writes."
      }' \
      <YOUR_BRAIN_URL>/api/memory
    ```

---

### 6. Semantic Vector Search
Performs a high-performance vector search across all memory nodes and session history.

*   **Method / Route**: `POST /api/memory/search/semantic`
*   **Headers**: `Content-Type: application/json`
*   **Request Body Fields**:
    *   `query` (string): The search query or semantic concept.
    *   `top_k` (number, optional): Max results to return. Defaults to `5`.
*   **Example curl**:
    ```bash
    curl -X POST \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{ "query": "baking brownies", "top_k": 3 }' \
      <YOUR_BRAIN_URL>/api/memory/search/semantic
    ```

---

### 7. Queue Autonomous Research
Queues a complex topic to the background research daemon.

*   **Method / Route**: `POST /api/research`
*   **Headers**: `Content-Type: application/json`
*   **Example curl**:
    ```bash
    curl -X POST \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{ "topic": "Next.js 15 Server Actions best practices", "priority": "high" }' \
      <YOUR_BRAIN_URL>/api/research
    ```

---

### 8. List Research Agenda
Retrieves all topics currently on the background research agenda with their statuses.

*   **Method / Route**: `GET /api/research`
*   **Example curl**:
    ```bash
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/research
    ```

---

### 9. Trigger Surface Recompilation
Triggers a manual rebuild of derived index caches, surface instructions, and routes.

*   **Method / Route**: `POST /api/vault/compile`
*   **Example curl**:
    ```bash
    curl -X POST \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/vault/compile
    ```

---

### 10. Archive or Delete a Memory Node
Deletes a memory node from the local filesystem vault.

*   **Method / Route**: `DELETE /api/memory/:slug`
*   **Example curl**:
    ```bash
    curl -X DELETE \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/memory/atomic-writes
    ```

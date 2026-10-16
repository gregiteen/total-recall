### 1. Enqueue a Research Project (`POST /api/research`)
*   **Payload Schema (JSON):**
    *   `topic` (string, **required**): Concise, highly descriptive title of the target domain/subject.
    *   `priority` (string, optional): `high` | `medium` | `low` (default: `medium`).
    *   `notes` (string, optional): Details on what information needs collection or constraints to follow.

*   **curl Template:**
    ```bash
    curl -X POST \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{
        "topic": "TypeScript 5.8 ECMAScript module syntax compatibility",
        "priority": "high",
        "notes": "Verify moduleResolution options and output configurations."
      }' \
      <YOUR_BRAIN_URL>/api/research
    ```


### 2. Search & List Research Projects (`GET /api/research`)
Allows you to list the background research agenda, filter by status, or perform a dynamic query search across the `topic` and `notes` fields.
*   **Query Parameters:**
    *   `status` (string, optional): `pending` | `in_progress` | `done` | `failed` | `all`
    *   `query` (string, optional): Search keyword query matched case-insensitively against the topic and notes.
    *   `limit` (number, optional): Maximum items to return (default: 100).
    *   `offset` (number, optional): Index offset for pagination.

*   **curl Templates:**
    ```bash
    # A) List all research projects
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      <YOUR_BRAIN_URL>/api/research

    # B) Get active/running research topics
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      "<YOUR_BRAIN_URL>/api/research?status=in_progress"

    # C) Dynamically search queue by keywords (matches topic and notes)
    curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      "<YOUR_BRAIN_URL>/api/research?query=TypeScript"
    ```


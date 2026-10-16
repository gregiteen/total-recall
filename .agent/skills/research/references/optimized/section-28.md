### 3. Update a Research Project (`PATCH /api/research/:id`)
*   **curl Template:**
    ```bash
    curl -X PATCH \
      -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{"priority": "high", "notes": "Escalate priority: urgent workspace integration needed"}' \
      <YOUR_BRAIN_URL>/api/research/c62fb293-1383-4a11-b0e6-1234abcd5678
    ```


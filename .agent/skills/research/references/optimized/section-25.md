## 🌐 REST API ENDPOINT REFERENCE

All communication with the research queue must use standard shell `curl` commands directed to the local Total Recall REST brain.

*   **Header Required:** `Authorization: Bearer <YOUR_PAT_TOKEN>`
*   **Default Brain URL:** `http://localhost:3000` (or the value of `<YOUR_BRAIN_URL>`)

| Method | Endpoint | Query Parameters | Description |
|:---|:---|:---|:---|
| **POST** | `/api/research` | None | Enqueue a new research project topic. |
| **GET** | `/api/research` | `status`, `query`, `limit`, `offset` | Search and list enqueued research projects. |
| **PATCH** | `/api/research/:id` | None | Update priority, notes, or status of a project. |
| **DELETE** | `/api/research/:id` | None | Revoke and delete a project from the agenda. |


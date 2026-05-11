# Subagent: Service Extraction Worker

Use this prompt template when dispatching a CLI agent to extract a service from a bloated route file.

## Prompt Template

```
CONTEXT: You are working in the Total Recall repository at /Users/greg/Github/total-recall.
Read INSTRUCTIONS.md for repo conventions. This is a Node.js Daemon with VFS memory.

TASK: Extract the following route handlers from {SOURCE_FILE} into a new service class at {TARGET_FILE}.

ROUTE HANDLERS TO EXTRACT (line ranges):
{LINE_RANGES}

The new service class must:
1. Export a singleton instance (e.g., `export const asteriskCallService = new AsteriskCallService()`)
2. Accept logger as constructor dependencies
3. Move ALL business logic from the route handlers into service methods
4. Leave the route handlers as thin wiring: `router.verb(path, auth, (req, res) => service.method(req, res))`

FILES YOU OWN (read + write):
- {TARGET_FILE} (create)

FILES FOR REFERENCE ONLY (read, do NOT modify):
- {SOURCE_FILE}
- server/services/asterisk/AsteriskService.ts
- server/services/workspaceSharingService.ts

CONSTRAINTS:
- Do NOT modify {SOURCE_FILE} — the coordinator will wire the imports
- Do NOT run tsc, npm run lint, or npm run build
- Do NOT start the dev server
- Use proper TypeScript types, not `any`
- Import from existing service files, do not duplicate logic

DELIVERABLE: A clean, typed service file at {TARGET_FILE} that compiles independently.
Commit with message: "refactor(asterisk): extract {SERVICE_NAME}"
```

## Variables to Fill

| Variable | Example |
|---|---|
| `{SOURCE_FILE}` | `server/routes/api/v1/asterisk.ts` |
| `{TARGET_FILE}` | `server/services/asterisk/AsteriskCallService.ts` |
| `{LINE_RANGES}` | Lines 477-595 (GET /calls, GET /calls/:id/playback) |
| `{SERVICE_NAME}` | `AsteriskCallService` |

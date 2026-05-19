# UltraChat — Total Recall Integration Guide

UltraChat connects to Total Recall as an OpenAI-compatible model endpoint. No
file-based projection is created; the API contract is the integration boundary.

## Prerequisites

- Total Recall server running and reachable (HTTPS recommended for remote use)
- A scoped Personal Access Token (PAT) with at minimum `chat:write chat:read models:read`

## 1. Issue a Scoped PAT

```bash
npx total-recall generate-pat --scopes "chat:write chat:read models:read instructions:read" --label ultrachat
```

Copy the emitted token — it is shown once.

## 2. Register the Model in UltraChat

Point UltraChat at your Total Recall server with the OpenAI-compatible config:

| Setting       | Value                                             |
|---------------|---------------------------------------------------|
| Base URL      | `https://<your-domain>/v1`                        |
| Model ID      | `total-recall/gemma4`                             |
| API Key       | PAT from step 1                                   |

### Discovery manifest

Total Recall publishes a discovery document at:

```
https://<your-domain>/.well-known/total-recall.json
```

UltraChat can use this to auto-populate base URL and model list.

## 3. Connect via CLI

Running the connect command prints the connection details and registers the
client in `~/.agent/config/clients.json`:

```bash
npx total-recall connect ultrachat --brain https://<your-domain> --token <PAT>
```

**Why no file projection?** UltraChat communicates via the API, not by reading
a local rules file. The OpenAI-compatible endpoint already injects the compiled
`INSTRUCTIONS.md` context into every chat completion. A file projection would
be redundant and is intentionally omitted for API-mode clients.

## 4. Session Sync (Sync Fabric)

Total Recall exposes session sync endpoints so UltraChat can read and write
session transcripts to the local VFS.

### Pull sessions from Total Recall

```bash
# List available sessions
curl -H "Authorization: Bearer <PAT>" https://<your-domain>/api/sessions

# Fetch a specific session
curl -H "Authorization: Bearer <PAT>" https://<your-domain>/api/sessions/<id>
```

### Push a session into Total Recall

```bash
curl -X POST https://<your-domain>/api/sessions/ingest \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ultrachat-2026-05-18-abc123",
    "source": "ultrachat",
    "messages": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }'
```

Ingested sessions are stored as JSONL in `~/.agent/sessions/` and will be
picked up by the Dream Cycle's session watcher on the next compile.

## 5. Verify the Connection

```bash
npx total-recall status
```

The `Connected clients` section will show `UltraChat [api]`. Since API-mode
clients have no projection file, no fresh/stale check is performed — the API
endpoint itself is the liveness signal.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `401 Unauthorized` | Check the PAT is correct and not expired |
| `403 Insufficient token scope` | Re-issue PAT with required scopes |
| Model not listed | Confirm server is running: `curl https://<domain>/v1/models` |
| Session ingest rejected | Ensure `id` is a string and `messages` is an array |

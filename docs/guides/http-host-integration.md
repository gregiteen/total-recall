# HTTP host app — Total Recall Integration Guide

HTTP host app connects to Total Recall as an OpenAI-compatible model endpoint. No file-based projection is created; the API contract serves as the secure integration boundary.

---

## 🔒 Prerequisites

- A running Total Recall server (HTTPS TLS recommended for production).
- A Personal Access Token (PAT) carrying `chat:write`, `chat:read`, and `models:read` scopes.

---

## 🚀 Setup Steps

### 1. Issue a Scoped PAT
```bash
npx total-recall generate-pat --scopes "chat:write,chat:read,models:read,memory:read" --label "http-api"
```
*Copy the raw token `tr_...` — it is only displayed once.*

### 2. Register the Model in HTTP host app
Point your HTTP host app client at your Total Recall server using standard OpenAI-compatible parameters:

| Parameter | Configuration Value |
| :--- | :--- |
| **Base URL** | `https://<your-domain>/v1` |
| **Model ID** | `total-recall/default` |
| **API Key** | Scoped PAT issued in Step 1 |

*Discovery Manifest: Total Recall publishes an auto-configuration manifest at `https://<your-domain>/.well-known/total-recall.json` which clients can scan to auto-load endpoints.*

### 3. Connect via CLI
Run the connect command to register the client inside the consolidated configuration registry:
```bash
npx total-recall connect http-api --brain https://<your-domain> --token <PAT>
```

**Why no file projection?** HTTP host app communicates dynamically via our REST endpoints. The OpenAI-compatible `/v1/chat/completions` completion router automatically injects the compiled `INSTRUCTIONS.md` system prompt context into every chat completion turn on the fly, eliminating redundant local rule files.

---

## 🔄 Ingest Fabric (Session Sync)

Total Recall exposes session sync endpoints so HTTP host app can push conversation transcripts into the brain:

### Push a Session into the Ingest Fabric:
```bash
curl -X POST https://<your-domain>/api/sessions/ingest \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "http-api-2026-05-25-abc123",
    "source": "http-api",
    "messages": [
      {"role": "user", "content": "Prefer atomic file writes in Node.js."},
      {"role": "assistant", "content": "Got it, I will write files write-then-rename."}
    ]
  }'
```
*Ingested sessions are saved securely as JSONL under `.agent/skills/total-recall/sessions/` and are automatically picked up by the next Dream Cycle.*

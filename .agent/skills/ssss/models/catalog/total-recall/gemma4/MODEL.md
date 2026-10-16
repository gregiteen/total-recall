---
type: model
model_id: total-recall-gemma4-26b
provider: total-recall
display_name: "Total Recall Gemma 4 26B (Local)"
description: >-
  Local Gemma 4 26B running via Ollama on the user's own hardware.
  No per-token cost. Full privacy. Optimized by the Dream Cycle.
runtime: ollama
runtime_model: gemma4:26b
context_window: 131072
max_output_tokens: 8192
capabilities:
  - text-generation
  - function-calling
  - system-instructions
  - structured-output
pricing:
  input_per_1m: 0
  output_per_1m: 0
  currency: USD
endpoint:
  base_url: "http://localhost:3000"
  path: "/v1/chat/completions"
  protocol: openai-compatible
health_check:
  path: "/api/health"
  interval_seconds: 60
registration:
  auto_discover: true
  requires_api_key: false
  local_only: true
tags:
  - local
  - local
  - privacy
  - gemma
  - free
schema_version: 1
---

# Total Recall Gemma 4 26B

This model file registers a locally-running Gemma 4 26B instance as a selectable model in the Total Recall AI ecosystem.

## How It Works

1. **Total Recall deploys Ollama** with `gemma4:26b` on the user's machine.
2. **The brain HTTP server** exposes an OpenAI-compatible endpoint at `http://localhost:3000/v1/chat/completions`.
3. **Total Recall discovers this MODEL.md** file via VFS sync and adds the brain to the model selector.
4. **Agents can select it** like any other model — no API key, no per-token billing.

## Health Check

The brain server exposes `/api/health` which returns:

```json
{
  "status": "ok",
  "model": "gemma4:26b",
  "runtime": "ollama",
  "uptime_seconds": 3600,
  "capabilities": ["text-generation", "function-calling"]
}
```

## Dream Cycle Optimization

The local model continuously improves through the Dream Cycle:
- Memory nodes with decayed confidence are refreshed.
- Skill files are improved based on usage patterns.
- Workflow failures generate repair proposals.
- Model routing proposals can suggest switching to a different local model.

## Registration Contract

Client applications should:

1. Read the `endpoint.base_url` and `endpoint.path` fields.
2. Verify availability via `health_check.path`.
3. Display `display_name` and `description` in the model selector.
4. Show `pricing` as "$0.00" (local, no per-token cost).
5. Set `local_only: true` flag to indicate the model runs on user hardware.

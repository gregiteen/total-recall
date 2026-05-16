---
type: model
provider: total-recall
model_id: gpt-4o-compatible # The inference endpoint signature
name: total-recall/gemma4
display_name: Total Recall Sovereign Brain (Gemma 4)
provider_type: local-runtime
pricing_prompt: 0
pricing_completion: 0
is_available: true
supports_tools: true
supports_vision: false
supports_code: true
---

# Total Recall Sovereign Brain (Gemma 4)

This file serves as the canonical VFS definition for the local Total Recall kernel running the Gemma 4 model via Ollama or llama.cpp.

## Runtime Characteristics
- Runs purely on the sovereign host machine.
- $0 per-token inference cost.
- Native access to the `memory-vault` VFS.
- OpenAI-compatible `/v1/chat/completions` endpoint for UltraChat compatibility.

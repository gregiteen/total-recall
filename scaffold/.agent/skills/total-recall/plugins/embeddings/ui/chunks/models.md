---
type: ui-chunk:chunk
plugin: embeddings
id: models
title: Embedding models
description: Every model on the resolved Ollama endpoint, with its declared embedding capability, vector width, vault compatibility, upstream flag and which one is selected.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - list embedding models
  - see which model can embed the vault
surfaces:
  - page
operations:
  - models
data:
  - models:/url
  - models:/reachable
  - models:/locality
  - models:/vault_dims
  - models:/selected
  - models:/models
  - models:/attempts
panel: home
---
<style>
  .emb-models { color: var(--colors-text, #ecfeff); background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
  .emb-models h3 { margin: 0 0 var(--spacing-sm, 8px); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
  .emb-models ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-xs, 4px); }
  .emb-models li { background: var(--colors-background, #07171d); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-sm, 4px); padding: var(--spacing-sm, 8px); }
  .emb-models code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }
  .emb-models .ok { color: var(--colors-ok, #10b981); }
  .emb-models .warn { color: var(--colors-warn, #f59e0b); }
  .emb-models p { margin: var(--spacing-sm, 8px) 0 0; color: var(--colors-muted, #67e8f9); }
</style>
<section class="emb-models" data-design-component="section">
  <h3>Embedding models</h3>
  <ul>
    <li data-design-component="model-row"><span class="ok">vault-compatible</span>: the model declares the <code>embedding</code> capability, and its family width is 768.</li>
    <li data-design-component="model-row"><span class="ok">selected</span>: the pinned <code>TR_OLLAMA_EMBED_MODEL</code> when compatible, otherwise the smallest compatible model.</li>
    <li data-design-component="model-row"><span class="warn">upstream</span>: the service relays the model from another machine, so it does not count as local.</li>
  </ul>
  <p>When no endpoint answers, the endpoints tried are reported instead of a model list. The Embeddings page shows the live roster.</p>
</section>

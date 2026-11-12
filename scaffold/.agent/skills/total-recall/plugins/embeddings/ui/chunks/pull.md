---
type: ui-chunk:chunk
plugin: embeddings
id: pull
title: Pull an embedding model
description: Downloads an explicitly named local model onto the configured loopback Ollama endpoint. Refuses non-loopback endpoints and cloud or upstream models.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - install a local embedding model
  - pull an embedding model
surfaces:
  - page
operations:
  - pull
data:
  - pull:/ok
  - pull:/model
  - pull:/url
  - pull:/locality
  - pull:/reason
  - pull:/status
panel: home
---
<style>
  .emb-pull { color: var(--colors-text, #ecfeff); background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
  .emb-pull h3 { margin: 0 0 var(--spacing-sm, 8px); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
  .emb-pull ol { margin: 0; padding-left: 1.25em; display: grid; gap: var(--spacing-xs, 4px); }
  .emb-pull code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }
  .emb-pull .warn { color: var(--colors-warn, #f59e0b); }
  .emb-pull p { margin: var(--spacing-sm, 8px) 0 0; color: var(--colors-muted, #67e8f9); }
</style>
<section class="emb-pull" data-design-component="section">
  <h3>Pull an embedding model</h3>
  <ol>
    <li>Name the model exactly. Nothing is pulled by default.</li>
    <li>The target is <code>TR_OLLAMA_URL</code>, <code>OLLAMA_HOST</code> or <code>127.0.0.1:11434</code>, and it must be loopback.</li>
    <li><span class="warn">Refused:</span> models that are cloud-hosted or relayed from another machine.</li>
    <li>The download may take up to ten minutes. The result names the model and endpoint, or the reason for failure.</li>
  </ol>
  <p>This changes the endpoint's model store. Start it from the Embeddings page.</p>
</section>

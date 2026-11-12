---
type: ui-chunk:chunk
plugin: embeddings
id: benchmark
title: Embedding benchmark
description: Measures milliseconds per embedding for the selected local model using a neutral sentence, verifies each vector is 768 wide, and projects the time to embed the whole vault.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - benchmark embedding speed
  - estimate time to embed the vault
surfaces:
  - page
operations:
  - benchmark
data:
  - benchmark:/ok
  - benchmark:/reason
  - benchmark:/url
  - benchmark:/locality
  - benchmark:/model
  - benchmark:/dims
  - benchmark:/samples
  - benchmark:/ms_per_embedding
  - benchmark:/min_ms
  - benchmark:/max_ms
  - benchmark:/vault_nodes
  - benchmark:/projected_minutes
  - benchmark:/completed
panel: home
---
<style>
  .emb-benchmark { color: var(--colors-text, #ecfeff); background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
  .emb-benchmark h3 { margin: 0 0 var(--spacing-sm, 8px); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
  .emb-benchmark dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--spacing-xs, 4px) var(--spacing-md, 12px); margin: 0; }
  .emb-benchmark dt { color: var(--colors-muted, #67e8f9); }
  .emb-benchmark dd { margin: 0; }
  .emb-benchmark code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }
  .emb-benchmark p { margin: var(--spacing-sm, 8px) 0 0; color: var(--colors-muted, #67e8f9); }
</style>
<section class="emb-benchmark" data-design-component="section">
  <h3>Embedding benchmark</h3>
  <dl>
    <dt>Reports</dt><dd>Average, minimum and maximum milliseconds per embedding, the sample count, and the model and endpoint measured.</dd>
    <dt>Projection</dt><dd>Average time multiplied by the vault node count, in minutes.</dd>
    <dt>Bounds</dt><dd>1 to 20 samples (default 10), within a 280-second deadline.</dd>
    <dt>Refuses</dt><dd>A remote, upstream or missing model. No vault text is sent.</dd>
  </dl>
  <p>Run it from the Embeddings page. It never runs on its own.</p>
</section>

---
type: ui-chunk:chunk
plugin: embeddings
id: status
title: Embedding provider status
description: Which provider and model serve vectors for this brain, whether text sent for embedding stays on this machine, and how much of the vault has a usable vector.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - check which embedding model is active
  - check whether embeddings run locally
  - check vault vector coverage
surfaces:
  - page
operations:
  - status
data:
  - status:/provider
  - status:/endpoint
  - status:/locality
  - status:/local
  - status:/selected_model
  - status:/embedding_dims
  - status:/hosted_fallback
  - status:/reason
  - status:/attempts
  - status:/brain/state
  - status:/brain/reason
  - status:/brain/vault_nodes
  - status:/brain/embedded
  - status:/brain/percent
  - status:/brain/stale
  - status:/brain/mismatched
  - status:/brain/missing
  - status:/brain/orphaned
  - status:/brain/model
panel: home
---
<style>
  .emb-status { color: var(--colors-text, #ecfeff); background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
  .emb-status h3 { margin: 0 0 var(--spacing-sm, 8px); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
  .emb-status dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--spacing-xs, 4px) var(--spacing-md, 12px); margin: 0; }
  .emb-status dt { color: var(--colors-muted, #67e8f9); }
  .emb-status dd { margin: 0; }
  .emb-status code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }
  .emb-status .local { color: var(--colors-ok, #10b981); }
  .emb-status .away { color: var(--colors-warn, #f59e0b); }
  .emb-status p { margin: var(--spacing-sm, 8px) 0 0; color: var(--colors-muted, #67e8f9); }
</style>
<section class="emb-status" data-design-component="section">
  <h3>Embedding provider status</h3>
  <dl>
    <dt>Provider</dt><dd><code>ollama</code>, <code>hosted-fallback</code> or <code>disabled</code></dd>
    <dt>Locality</dt><dd><span class="local" data-design-component="locality-chip">local</span> only when a loopback endpoint serves a non-upstream model. Otherwise <span class="away">remote</span>, <span class="away">unknown</span> or <code>disabled</code>.</dd>
    <dt>Model</dt><dd>The selected model and its vector width. The vault requires 768 dimensions.</dd>
    <dt>Coverage</dt><dd>Usable vectors out of vault nodes, with stale, wrong-width, missing and orphaned counts.</dd>
    <dt>Credentials</dt><dd>Hosted fallback keys stay with the Auth owner and are reported as <code>unknown</code>, never read here.</dd>
  </dl>
  <p>Open the Embeddings page for the live reading, the endpoints that were tried, and refresh.</p>
</section>

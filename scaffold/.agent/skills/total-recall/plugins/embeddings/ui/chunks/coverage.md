---
type: ui-chunk:chunk
plugin: embeddings
id: coverage
title: Vault vector coverage
description: How many vault nodes have a current, correct-width vector in the index, and why the rest are not usable. Reads the index without modifying it.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - check vault vector coverage
  - find stale or missing embeddings
surfaces:
  - page
operations:
  - coverage
data:
  - coverage:/ok
  - coverage:/brain
  - coverage:/state
  - coverage:/reason
  - coverage:/vault_nodes
  - coverage:/parse_errors
  - coverage:/rows
  - coverage:/embedded
  - coverage:/stale
  - coverage:/mismatched
  - coverage:/orphaned
  - coverage:/missing
  - coverage:/percent
  - coverage:/model
  - coverage:/models
  - coverage:/db_bytes
panel: home
---
<style>
  .emb-coverage { color: var(--colors-text, #ecfeff); background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
  .emb-coverage h3 { margin: 0 0 var(--spacing-sm, 8px); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
  .emb-coverage ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-xs, 4px); }
  .emb-coverage li { display: flex; justify-content: space-between; gap: var(--spacing-md, 12px); font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; color: var(--colors-muted, #67e8f9); }
  .emb-coverage li span:first-child { color: var(--colors-text, #ecfeff); }
  .emb-coverage code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }
  .emb-coverage p { margin: var(--spacing-sm, 8px) 0 0; color: var(--colors-muted, #67e8f9); }
</style>
<section class="emb-coverage" data-design-component="section">
  <h3>Vault vector coverage</h3>
  <ul>
    <li data-design-component="count-row"><span>usable</span><span>current text hash, 768 finite numbers</span></li>
    <li data-design-component="count-row"><span>stale</span><span>the node changed after it was embedded</span></li>
    <li data-design-component="count-row"><span>wrong width</span><span>the vector is not 768 numbers</span></li>
    <li data-design-component="count-row"><span>missing</span><span>the node has no row</span></li>
    <li data-design-component="count-row"><span>orphaned</span><span>the row has no active node</span></li>
  </ul>
  <p>The percentage counts usable vectors out of all <code>memory</code> and <code>plugin_record</code> nodes. A missing or unreadable index is reported by its state, not as 0%. Rebuild with <code>total-recall compile</code>.</p>
</section>

---
type: ui-chunk:chunk
plugin: composable-cli
id: update
title: Update a command
description: Replaces a composed command's code, keeping a snapshot of the previous version and raising the registry version by one.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Change what an existing composed command does
surfaces: [page]
operations: [update]
---
<section data-design-component="op-sheet">
<style>
[data-design-component="op-sheet"]{background:var(--color-surface);color:var(--color-text);font-family:var(--typography-body-font-family);font-size:var(--typography-body-font-size);line-height:var(--typography-body-line-height);border-radius:var(--radius-lg);padding:var(--spacing-lg)}
[data-design-component="op-sheet"] h2{font-family:var(--typography-title-font-family);font-size:var(--typography-title-font-size);font-weight:var(--typography-title-font-weight);margin:0 0 var(--spacing-sm)}
[data-design-component="op-sheet"] p{margin:0 0 var(--spacing-md)}
[data-design-component="risk-badge"]{font-family:var(--typography-label-font-family);font-size:var(--typography-label-font-size);font-weight:var(--typography-label-font-weight);letter-spacing:var(--typography-label-letter-spacing);text-transform:uppercase;border-radius:var(--radius-sm);padding:2px var(--spacing-xs);color:var(--color-warn);background:var(--color-warn-soft)}
[data-design-component="field-list"]{color:var(--color-muted);font-family:var(--typography-code-font-family);font-size:var(--typography-code-font-size);margin:0}
[data-design-component="field-list"] dt{color:var(--color-text)}
[data-design-component="field-list"] dd{margin:0 0 var(--spacing-sm);font-family:var(--typography-body-font-family)}
code{font-family:var(--typography-code-font-family)}
</style>
<h2>Update a command</h2>
<p><span data-design-component="risk-badge">write</span> Saves the current version to history, writes the new code, raises the registry version by one and refreshes the command inventories.</p>
<p>Run <code>total-recall composable-cli update &lt;name&gt; "&lt;code&gt;"</code>. It confirms in plain text.</p>
<dl data-design-component="field-list">
<dt>--description, --risk</dt><dd>Optional. When left out, the command keeps its current description and risk class.</dd>
<dt>--global, --group &lt;id&gt;</dt><dd>Update the command in that scope instead of this project.</dd>
</dl>
<p>The previous version can be restored with <code>rollback</code>.</p>
</section>

---
type: ui-chunk:chunk
plugin: composable-cli
id: read
title: Command source
description: Prints the source of one composed command as plain text.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Read a composed command's source code
surfaces: [page]
operations: [read]
---
<section data-design-component="op-sheet">
<style>
[data-design-component="op-sheet"]{background:var(--color-surface);color:var(--color-text);font-family:var(--typography-body-font-family);font-size:var(--typography-body-font-size);line-height:var(--typography-body-line-height);border-radius:var(--radius-lg);padding:var(--spacing-lg)}
[data-design-component="op-sheet"] h2{font-family:var(--typography-title-font-family);font-size:var(--typography-title-font-size);font-weight:var(--typography-title-font-weight);margin:0 0 var(--spacing-sm)}
[data-design-component="op-sheet"] p{margin:0 0 var(--spacing-md)}
[data-design-component="risk-badge"]{font-family:var(--typography-label-font-family);font-size:var(--typography-label-font-size);font-weight:var(--typography-label-font-weight);letter-spacing:var(--typography-label-letter-spacing);text-transform:uppercase;border-radius:var(--radius-sm);padding:2px var(--spacing-xs);color:var(--color-ok);background:var(--color-ok-soft)}
code{font-family:var(--typography-code-font-family)}
</style>
<h2>Command source</h2>
<p><span data-design-component="risk-badge">read</span> Prints one composed command's source file exactly as stored. It has no JSON form.</p>
<p>Run <code>total-recall composable-cli read &lt;name&gt;</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. It fails with a clear message when the command does not exist in that scope.</p>
<p>For the source together with its registry record, use <code>show</code>.</p>
</section>

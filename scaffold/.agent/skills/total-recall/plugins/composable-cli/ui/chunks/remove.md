---
type: ui-chunk:chunk
plugin: composable-cli
id: remove
title: Remove a command
description: Deletes a composed command's source file and its registry record from one scope.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Delete a composed command that is no longer needed
surfaces: [page]
operations: [remove]
panel: home
---
<section data-design-component="op-sheet">
<style>
[data-design-component="op-sheet"]{background:var(--color-surface);color:var(--color-text);font-family:var(--typography-body-font-family);font-size:var(--typography-body-font-size);line-height:var(--typography-body-line-height);border-radius:var(--radius-lg);padding:var(--spacing-lg)}
[data-design-component="op-sheet"] h2{font-family:var(--typography-title-font-family);font-size:var(--typography-title-font-size);font-weight:var(--typography-title-font-weight);margin:0 0 var(--spacing-sm)}
[data-design-component="op-sheet"] p{margin:0 0 var(--spacing-md)}
[data-design-component="risk-badge"]{font-family:var(--typography-label-font-family);font-size:var(--typography-label-font-size);font-weight:var(--typography-label-font-weight);letter-spacing:var(--typography-label-letter-spacing);text-transform:uppercase;border-radius:var(--radius-sm);padding:2px var(--spacing-xs);color:var(--color-danger);background:var(--color-danger-soft)}
code{font-family:var(--typography-code-font-family)}
</style>
<h2>Remove a command</h2>
<p><span data-design-component="risk-badge">destructive</span> Deletes the command's source and its registry record from the selected scope, then refreshes the command inventories. Saved history snapshots stay on disk.</p>
<p>Run <code>total-recall composable-cli remove &lt;name&gt;</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. It confirms in plain text and fails when the command does not exist there.</p>
<p>In the CmdSmith Home, Remove asks for a second, confirming click before anything is deleted.</p>
</section>

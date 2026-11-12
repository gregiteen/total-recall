---
type: ui-chunk:chunk
plugin: composable-cli
id: rollback
title: Roll back a command
description: Restores a saved earlier version of a composed command, snapshotting the current one first and raising the registry version.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Roll back a composed command to an earlier version
surfaces: [page]
operations: [rollback]
panel: home
---
<section data-design-component="op-sheet">
<style>
[data-design-component="op-sheet"]{background:var(--color-surface);color:var(--color-text);font-family:var(--typography-body-font-family);font-size:var(--typography-body-font-size);line-height:var(--typography-body-line-height);border-radius:var(--radius-lg);padding:var(--spacing-lg)}
[data-design-component="op-sheet"] h2{font-family:var(--typography-title-font-family);font-size:var(--typography-title-font-size);font-weight:var(--typography-title-font-weight);margin:0 0 var(--spacing-sm)}
[data-design-component="op-sheet"] p{margin:0 0 var(--spacing-md)}
[data-design-component="risk-badge"]{font-family:var(--typography-label-font-family);font-size:var(--typography-label-font-size);font-weight:var(--typography-label-font-weight);letter-spacing:var(--typography-label-letter-spacing);text-transform:uppercase;border-radius:var(--radius-sm);padding:2px var(--spacing-xs);color:var(--color-warn);background:var(--color-warn-soft)}
code{font-family:var(--typography-code-font-family)}
</style>
<h2>Roll back a command</h2>
<p><span data-design-component="risk-badge">write</span> Copies a saved version back over the command's source. The version being replaced is saved first, so a rollback can itself be undone. The registry version goes up by one and its code digest is recomputed.</p>
<p>Run <code>total-recall composable-cli rollback &lt;name&gt; &lt;version&gt;</code>, with the version as a plain number from <code>history</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. It confirms in plain text and fails when that version was never saved.</p>
<p>In the CmdSmith Home, each saved version in the inspector has its own rollback button. Nothing is rolled back until you select one.</p>
</section>

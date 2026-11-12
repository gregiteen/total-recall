---
type: ui-chunk:chunk
plugin: composable-cli
id: history
title: Version history
description: Lists the saved earlier versions of a composed command that a rollback can restore.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - See which earlier versions of a command can be restored
surfaces: [page]
operations: [history]
data:
  - history:/name
  - history:/versions
panel: home
---
<section data-design-component="op-sheet">
<style>
[data-design-component="op-sheet"]{background:var(--color-surface);color:var(--color-text);font-family:var(--typography-body-font-family);font-size:var(--typography-body-font-size);line-height:var(--typography-body-line-height);border-radius:var(--radius-lg);padding:var(--spacing-lg)}
[data-design-component="op-sheet"] h2{font-family:var(--typography-title-font-family);font-size:var(--typography-title-font-size);font-weight:var(--typography-title-font-weight);margin:0 0 var(--spacing-sm)}
[data-design-component="op-sheet"] p{margin:0 0 var(--spacing-md)}
[data-design-component="risk-badge"]{font-family:var(--typography-label-font-family);font-size:var(--typography-label-font-size);font-weight:var(--typography-label-font-weight);letter-spacing:var(--typography-label-letter-spacing);text-transform:uppercase;border-radius:var(--radius-sm);padding:2px var(--spacing-xs);color:var(--color-ok);background:var(--color-ok-soft)}
[data-design-component="field-list"]{color:var(--color-muted);font-family:var(--typography-code-font-family);font-size:var(--typography-code-font-size);margin:0}
[data-design-component="field-list"] dt{color:var(--color-text)}
[data-design-component="field-list"] dd{margin:0 0 var(--spacing-sm);font-family:var(--typography-body-font-family)}
code{font-family:var(--typography-code-font-family)}
</style>
<h2>Version history</h2>
<p><span data-design-component="risk-badge">read</span> Each update and rollback first saves the current version as a snapshot. This lists those snapshots.</p>
<p>Run <code>total-recall composable-cli history &lt;name&gt; --json</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. The CmdSmith Home shows it in the command inspector, with a rollback button per version.</p>
<dl data-design-component="field-list">
<dt>name</dt><dd>The command the history belongs to.</dd>
<dt>versions</dt><dd>Saved version numbers in ascending order. Empty until the command is first updated.</dd>
</dl>
</section>

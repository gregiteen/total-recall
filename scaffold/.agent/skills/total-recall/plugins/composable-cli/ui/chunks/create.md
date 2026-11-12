---
type: ui-chunk:chunk
plugin: composable-cli
id: create
title: Create a command
description: Turns a repeated sequence into a new named composed command with a declared risk class and a registry record.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Turn a repeated sequence into a reusable command
surfaces: [page]
operations: [create]
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
<h2>Create a command</h2>
<p><span data-design-component="risk-badge">write</span> Writes a new command file and its registry record, then refreshes the command inventories in the instruction files.</p>
<p>Run <code>total-recall composable-cli create &lt;name&gt; "&lt;code&gt;" --description "…" --risk read</code>. It confirms in plain text.</p>
<dl data-design-component="field-list">
<dt>&lt;name&gt;</dt><dd>Lowercase kebab case, 1 to 64 characters. Built-in Total Recall names are refused.</dd>
<dt>--risk</dt><dd><code>read</code>, <code>write</code>, <code>money</code>, <code>dns-cert</code>, <code>production-deploy</code> or <code>secret-revoke</code>. Defaults to <code>write</code>.</dd>
<dt>--global, --group &lt;id&gt;</dt><dd>Store it machine-wide or for one project group instead of this project.</dd>
<dt>--from-plugin &lt;dir&gt;</dt><dd>Wrap a command declared in a plugin's manifest instead of inline code.</dd>
<dt>--config-for-skill &lt;id&gt;</dt><dd>Create a repository config command for a layered skill.</dd>
</dl>
<p>Creating a name that already exists in the same scope fails; use <code>update</code> instead.</p>
</section>

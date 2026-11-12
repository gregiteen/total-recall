---
type: ui-chunk:chunk
plugin: composable-cli
id: list
title: Composed commands
description: Lists the composed commands in the project, group and global scopes with their declared risk and description.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - See which composed commands exist
  - Check a composed command's scope and risk
surfaces: [page]
operations: [list]
data:
  - list:/*/name
  - list:/*/scope
  - list:/*/path
  - list:/*/description
  - list:/*/risk
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
<h2>Composed commands</h2>
<p><span data-design-component="risk-badge">read</span> Every composed command you can run here, nearest scope first: project, then each group this project belongs to, then global.</p>
<p>Run <code>total-recall composable-cli list --json</code>. The CmdSmith Home shows this list with a scope filter.</p>
<dl data-design-component="field-list">
<dt>name</dt><dd>The verb you type after <code>total-recall</code>.</dd>
<dt>scope</dt><dd><code>project</code>, <code>group</code> or <code>global</code>.</dd>
<dt>path</dt><dd>The command's source file.</dd>
<dt>description</dt><dd>The command's one-line purpose, or null when none was given.</dd>
<dt>risk</dt><dd>The declared risk class: <code>read</code>, <code>write</code>, <code>money</code>, <code>dns-cert</code>, <code>production-deploy</code> or <code>secret-revoke</code>. Null when undeclared.</dd>
</dl>
</section>

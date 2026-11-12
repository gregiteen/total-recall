---
type: ui-chunk:chunk
plugin: composable-cli
id: library
title: Command library
description: Lists every installed plugin operation and every composed command in scope, read from declarations without running any of them.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Discover which commands and plugin operations are available
  - Find an existing command before composing a new one
surfaces: [page]
operations: [library]
data:
  - library:/plugins
  - library:/plugins/*/id
  - library:/commands
  - library:/commands/*/command
  - library:/commands/*/effect
  - library:/commands/*/description
  - library:/commands/*/plugin
  - library:/composedCommands
  - library:/composedCommands/*/name
  - library:/composedCommands/*/scope
  - library:/composedCommands/*/description
  - library:/composedCommands/*/risk
  - library:/composedCommands/*/command
  - library:/evidence
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
<h2>Command library</h2>
<p><span data-design-component="risk-badge">read</span> One view of what you can call: installed plugin operations and your composed commands. Nothing is executed and no command code is imported.</p>
<p>Run <code>total-recall composable-cli library --json</code>. Add <code>--plugin &lt;id&gt;</code> to see one installed plugin's operations only; composed commands are then left out.</p>
<dl data-design-component="field-list">
<dt>plugins[].id</dt><dd>Each installed plugin.</dd>
<dt>commands[]</dt><dd>Each plugin operation: the full <code>command</code> to type, its declared <code>effect</code>, its <code>description</code> and owning <code>plugin</code>.</dd>
<dt>composedCommands[]</dt><dd>Each composed command in scope: <code>name</code>, <code>scope</code> (project, group or global), <code>description</code>, declared <code>risk</code> and the <code>command</code> to type.</dd>
<dt>evidence</dt><dd>A reminder that these are declarations. A provider is ready only after a real run succeeds.</dd>
</dl>
</section>

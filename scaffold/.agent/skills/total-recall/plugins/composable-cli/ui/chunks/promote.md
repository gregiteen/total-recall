---
type: ui-chunk:chunk
plugin: composable-cli
id: promote
title: Promote into a plugin
description: Moves a registered inline composed command into a plugin's manifest and commands folder after verifying its digest and risk class.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Make a composed command part of a plugin
surfaces: [page]
operations: [promote]
data:
  - promote:/ok
  - promote:/name
  - promote:/plugin
  - promote:/handler
  - promote:/risk
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
<h2>Promote into a plugin</h2>
<p><span data-design-component="risk-badge">write</span> Copies the command, and its test when present, into the plugin's <code>commands/</code> folder and adds it to that plugin's <code>plugin.json</code>. The manifest is validated before and after the change, and every copied file is removed again if any step fails.</p>
<p>Run <code>total-recall composable-cli promote &lt;name&gt; --to-plugin &lt;dir&gt; --json</code>.</p>
<dl data-design-component="field-list">
<dt>ok</dt><dd>True when the plugin manifest now declares the command.</dd>
<dt>name, plugin</dt><dd>The promoted command and the receiving plugin's id.</dd>
<dt>handler</dt><dd>The new handler path inside the plugin, <code>commands/&lt;name&gt;.mjs</code>.</dd>
<dt>risk</dt><dd>The carried risk class.</dd>
</dl>
<p>Only registered inline commands whose source still matches the recorded digest, with risk <code>read</code> or <code>write</code>, can be promoted. A name the plugin already declares is refused.</p>
</section>

---
type: ui-chunk:chunk
plugin: composable-cli
id: status
title: Plugin status
description: Shows which Composable CLI operations are implemented and where project and global composed commands are stored.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Check which Composable CLI operations are implemented
  - Find where composed commands are stored
surfaces: [page]
operations: [status]
data:
  - status:/plugin
  - status:/implemented
  - status:/scope/project
  - status:/scope/global
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
<h2>Plugin status</h2>
<p><span data-design-component="risk-badge">read</span> Reports what this plugin can do on this machine. It changes nothing.</p>
<p>Run <code>total-recall composable-cli status --json</code>. The CmdSmith Home reads it on open.</p>
<dl data-design-component="field-list">
<dt>plugin</dt><dd>The plugin id, <code>composable-cli</code>.</dd>
<dt>implemented</dt><dd>Every operation this build answers, including <code>status</code>.</dd>
<dt>scope.project</dt><dd>The project folder for composed commands: <code>.agent/commands</code> under the current repository.</dd>
<dt>scope.global</dt><dd>The machine-wide folder, <code>~/.agent/commands</code>. Absent when no home folder is set.</dd>
</dl>
</section>

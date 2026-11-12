---
type: ui-chunk:chunk
plugin: composable-cli
id: show
title: Command record
description: Shows a composed command's registry record (version, risk, scope, author, dates, digest) together with its source.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Inspect a composed command before running it
  - Confirm a command's version, risk and code digest
surfaces: [page]
operations: [show]
data:
  - show:/registry
  - show:/registry/name
  - show:/registry/scope
  - show:/registry/risk
  - show:/registry/version
  - show:/registry/author
  - show:/registry/created
  - show:/registry/updated
  - show:/registry/description
  - show:/registry/background_allowed
  - show:/registry/code_sha256
  - show:/registry/source
  - show:/code
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
<h2>Command record</h2>
<p><span data-design-component="risk-badge">read</span> The registry record and source of one composed command. Nothing runs.</p>
<p>Run <code>total-recall composable-cli show &lt;name&gt; --json</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. The CmdSmith Home opens this when you select a command.</p>
<dl data-design-component="field-list">
<dt>registry</dt><dd>The command's <code>cli_command</code> record, or null when the source file has no record beside it.</dd>
<dt>registry.version</dt><dd>Starts at 1 and goes up by one on every update or rollback.</dd>
<dt>registry.risk, registry.scope</dt><dd>The declared risk class and the scope the record was written for.</dd>
<dt>registry.author, registry.created, registry.updated</dt><dd>Who registered it and when it was first and last written.</dd>
<dt>registry.source</dt><dd><code>inline</code>, <code>from-plugin</code> or <code>config-for-skill</code>.</dd>
<dt>registry.background_allowed</dt><dd>Whether the command may run in the background.</dd>
<dt>registry.code_sha256</dt><dd>SHA-256 of the source at the last registry write; compare it with the code to spot hand edits.</dd>
<dt>code</dt><dd>The command's full source.</dd>
</dl>
</section>

---
type: ui-chunk:chunk
plugin: composable-cli
id: test-path
title: Find a command's test
description: Locates a composed command's test file in its scope without running it.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Check whether a composed command has a test before running it
surfaces: [page]
operations: [test-path]
data:
  - test-path:/ok
  - test-path:/name
  - test-path:/scope
  - test-path:/testFile
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
<h2>Find a command's test</h2>
<p><span data-design-component="risk-badge">read</span> Confirms that <code>&lt;name&gt;.test.mjs</code> is a regular file inside the command's own scope folder. It does not run the test.</p>
<p>Run <code>total-recall composable-cli test-path &lt;name&gt; --json</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes.</p>
<dl data-design-component="field-list">
<dt>ok</dt><dd>True when the test file was found.</dd>
<dt>name, scope</dt><dd>The command and scope that were checked.</dd>
<dt>testFile</dt><dd>The test file's full path.</dd>
</dl>
<p>A missing file, a link or a file outside the scope folder returns <code>{ ok: false, error }</code>.</p>
</section>

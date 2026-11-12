---
type: ui-chunk:chunk
plugin: composable-cli
id: test
title: Run a command's test
description: Runs the selected composed command's test file with Node's test runner and returns its real outcome and output.
timestamp: '2026-11-08T08:12:00Z'
intents:
  - Test a composed command and see the actual result
surfaces: [page]
operations: [test]
data:
  - test:/ok
  - test:/name
  - test:/scope
  - test:/testFile
  - test:/exitCode
  - test:/signal
  - test:/stdout
  - test:/stderr
  - test:/error
panel: home
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
<h2>Run a command's test</h2>
<p><span data-design-component="risk-badge">write</span> Executes <code>&lt;name&gt;.test.mjs</code> from the command's scope with <code>node --test</code>. The test runs real code, is stopped after 120 seconds, and its output is capped.</p>
<p>Run <code>total-recall composable-cli test &lt;name&gt; --json</code>, adding <code>--global</code> or <code>--group &lt;id&gt;</code> for those scopes. A failing test exits non-zero. The CmdSmith Home runs it only when you select Run test.</p>
<dl data-design-component="field-list">
<dt>ok</dt><dd>True only when the test process finished with exit code 0.</dd>
<dt>name, scope, testFile</dt><dd>Which command was tested, in which scope, and the exact test file.</dd>
<dt>exitCode, signal</dt><dd>How the test process ended. A timeout shows a signal and no exit code.</dd>
<dt>stdout, stderr</dt><dd>What the test runner printed.</dd>
<dt>error</dt><dd>A process start or timeout code, or null.</dd>
</dl>
<p>When the scope has no regular test file for the command, the result is <code>{ ok: false, error }</code> and nothing runs.</p>
</section>

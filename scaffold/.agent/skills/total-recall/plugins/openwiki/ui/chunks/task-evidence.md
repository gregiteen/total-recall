---
type: ui-chunk:chunk
plugin: openwiki
id: task-evidence
title: Gather task evidence
description: Retrieve wiki and explicitly linked source evidence with provenance and freshness.
timestamp: "2026-11-08T09:14:38Z"
intents: [gather wiki context for a task, inspect evidence freshness, follow linked source evidence]
surfaces: [page, right]
operations: [context]
data: ["context:/ok", "context:/coverage/scope", "context:/coverage/ranking"]
---

<article>
  <h2>Gather task evidence</h2>
  <ol>
    <li>Describe the implementation question to <code>total-recall openwiki context &lt;task&gt; --json</code>.</li>
    <li>Follow each result's source path and line range.</li>
    <li>Review freshness and coverage diagnostics before using the excerpt.</li>
  </ol>
  <p>The search scope is the workspace wiki and source it explicitly links.</p>
</article>

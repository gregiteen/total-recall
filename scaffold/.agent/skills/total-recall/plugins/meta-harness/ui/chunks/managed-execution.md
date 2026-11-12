---
type: ui-chunk:chunk
plugin: meta-harness
id: managed-execution
title: Prepare managed execution
description: Choose a harness, node, workspace and allowed effects before running a managed command.
timestamp: "2026-11-08T09:34:00Z"
intents: [run a plugin command through a harness, dispatch a managed task, maintain an agent runtime]
surfaces: [page]
operations: [run-command, runtime, dispatch]
---

<section>
  <h2>Prepare managed execution</h2>
  <ol>
    <li>Choose a verified node and its absolute workspace.</li>
    <li>Use <code>run-command</code> for a declared plugin operation, <code>dispatch</code> for a task request, or <code>runtime</code> for an allowed maintenance action.</li>
    <li>Submit the approved request through the owner. Read the returned exit status and native tool evidence before treating the task as finished.</li>
  </ol>
</section>

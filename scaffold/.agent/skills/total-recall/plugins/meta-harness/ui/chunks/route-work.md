---
type: ui-chunk:chunk
plugin: meta-harness
id: route-work
title: Preview task routing
description: Compare harness choice and workflow stages before approving managed execution.
timestamp: "2026-11-08T09:34:00Z"
intents: [preview harness route, decompose a task, plan a coordinated run, inspect selected harness]
surfaces: [page]
operations: [route, decompose, coordinate, orchestrate]
data: ["route:/selected", "route:/classifier/source"]
---

<section>
  <h2>Preview task routing</h2>
  <p><code>route</code> explains the selected harness and classification source. <code>decompose</code> lays out the work stages.</p>
  <p>Use <code>coordinate</code> or <code>orchestrate</code> to inspect the roles and candidate assignments. Add <code>--execute</code> only after approving the plan, workspace and gates.</p>
</section>

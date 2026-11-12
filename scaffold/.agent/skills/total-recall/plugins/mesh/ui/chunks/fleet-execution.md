---
type: ui-chunk:chunk
title: Fleet execution and capabilities
description: Verify which configured nodes can run a probe and which runtimes or harnesses they expose.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: fleet-execution
intents: [verify mesh execution, find node with Docker, check available harnesses, diagnose fleet compute capability]
surfaces: [page]
operations: [doctor]
data: ["doctor:/0/reachable", "doctor:/0/runtimes", "doctor:/0/harnesses"]
---

<style>
  .mesh-execution { padding:var(--spacing-md); border-inline-start:3px solid var(--color-ok); background:var(--color-surface); }
  .mesh-execution h2 { margin-top:0; }
  .mesh-execution em { color:var(--color-muted); }
</style>
<section class="mesh-execution">
  <h2>Verify where work can run</h2>
  <p>Request the execution probe before using the Placement matrix. An answering node can report the runtimes and harnesses it found.</p>
  <p><em>A failed probe leaves that node’s capabilities unknown.</em></p>
</section>

---
type: ui-chunk:chunk
title: Remote mesh execution result
description: Run an explicit command on an enrolled peer and read its actual exit result.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: remote-execution
intents: [execute mesh command, run command on peer, check remote exit code, remote shell command result]
surfaces: [page]
operations: [exec]
data: ["exec:/success", "exec:/exitCode"]
---

<style>
  .mesh-run { padding:var(--spacing-md); background:var(--color-surface); border-block-end:1px solid var(--color-border); }
  .mesh-run h2 { margin-top:0; }
  .mesh-run strong { color:var(--color-accent); }
</style>
<section class="mesh-run">
  <h2>Read the command result</h2>
  <p>Choose the peer and command explicitly. The <strong>exit code</strong> comes from the remote execution. Check it before treating a successful connection as a successful command.</p>
</section>

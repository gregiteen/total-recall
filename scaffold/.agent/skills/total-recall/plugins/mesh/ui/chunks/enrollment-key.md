---
type: ui-chunk:chunk
title: Mesh enrollment key handoff
description: Issue an enrollment credential in an interactive terminal for the intended new machine.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: enrollment-key
intents: [create mesh enrollment key, add a device to private mesh, issue preauth key, terminal enrollment credential]
surfaces: [page]
operations: [preauthkey]
---

<style>
  .mesh-key { padding:var(--spacing-md); border:1px dashed var(--color-border); background:var(--color-surface); }
  .mesh-key h2 { margin-top:0; }
  .mesh-key code { color:var(--color-accent); overflow-wrap:anywhere; }
</style>
<section class="mesh-key">
  <h2>Issue the key in a terminal</h2>
  <p>Run <code>total-recall mesh preauthkey</code> in the interactive terminal and pass the credential directly to the intended machine.</p>
  <p>Choose reusable or ephemeral enrollment only when it matches that machine’s role.</p>
</section>

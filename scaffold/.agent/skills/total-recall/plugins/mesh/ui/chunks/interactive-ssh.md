---
type: ui-chunk:chunk
title: Interactive mesh SSH
description: Open a terminal session to a peer using its recorded login and authenticated mesh access.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: interactive-ssh
intents: [SSH to mesh node, open peer terminal, interactive remote shell, log into fleet machine]
surfaces: [page, bottom]
operations: [ssh]
---

<style>
  .mesh-shell { padding:var(--spacing-md); background:var(--color-surface); }
  .mesh-shell h2 { margin-top:0; }
  .mesh-shell code { display:block; overflow-wrap:anywhere; padding:.55em; background:var(--color-background); color:var(--color-accent); }
</style>
<section class="mesh-shell">
  <h2>Continue in a terminal</h2>
  <p>Use the peer’s recorded access to open an interactive session.</p>
  <code>total-recall mesh ssh &lt;peer&gt;</code>
</section>

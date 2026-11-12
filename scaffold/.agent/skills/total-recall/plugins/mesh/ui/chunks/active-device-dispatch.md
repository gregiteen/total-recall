---
type: ui-chunk:chunk
title: Mesh dispatch receipt
description: Send a command to an explicit or freshly active device and inspect whether dispatch succeeded.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: active-device-dispatch
intents: [send command to active device, dispatch mesh task, inspect dispatch result, run on selected machine]
surfaces: [page]
operations: [dispatch]
data: ["dispatch:/dispatched", "dispatch:/is_local", "dispatch:/timestamp"]
---

<style>
  .mesh-dispatch { padding:var(--spacing-md); border-inline-start:3px solid var(--color-accent); background:var(--color-surface); }
  .mesh-dispatch h2 { margin-top:0; }
  .mesh-dispatch strong { color:var(--color-accent); }
</style>
<section class="mesh-dispatch">
  <h2>Read where dispatch ran</h2>
  <p>Supply an explicit target or let Mesh resolve a device from fresh presence. The receipt records whether the command dispatched and whether it ran <strong>locally or on a peer</strong>.</p>
</section>

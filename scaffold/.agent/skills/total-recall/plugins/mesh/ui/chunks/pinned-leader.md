---
type: ui-chunk:chunk
title: Pin the mesh leader
description: Record an explicit mesh address and optional server port as the leader pin.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: pinned-leader
intents: [pin mesh leader, choose leadership address, set leader server port]
surfaces: [page]
operations: [leader-pin]
data: ["leader-pin:/ok", "leader-pin:/leaderPort"]
---

<style>
  .mesh-pin { padding:var(--spacing-md); border-inline-start:3px solid var(--color-warn); background:var(--color-surface); }
  .mesh-pin h2 { margin-top:0; }
</style>
<section class="mesh-pin">
  <h2>Change the leader pin</h2>
  <ol>
    <li>Select the intended mesh address and optional server port.</li>
    <li>Check the write result, then read the elected leader separately.</li>
  </ol>
</section>

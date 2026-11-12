---
type: ui-chunk:chunk
title: Elected mesh leader
description: Inspect the election strategy, leader server port, and this machine's leader role.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: elected-leader
intents: [who is mesh leader, mesh leader election, leader port, is this machine leader]
surfaces: [page, right]
operations: [leader]
data: ["leader:/leader/strategy", "leader:/leader/port", "leader:/is_current_node_leader"]
---

<style>
  .mesh-leader { padding:var(--spacing-md); background:var(--color-surface); border-radius:var(--radius-md); }
  .mesh-leader h2 { margin-top:0; }
  .mesh-leader p { color:var(--color-muted); margin-bottom:0; }
</style>
<section class="mesh-leader">
  <h2>Read the election</h2>
  <p>See how the leader was selected, which server port was reported, and whether this machine leads the fleet.</p>
</section>

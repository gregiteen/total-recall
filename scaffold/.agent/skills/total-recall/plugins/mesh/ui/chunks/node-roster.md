---
type: ui-chunk:chunk
title: Mesh node roster
description: Inspect current fleet observations and distinguish members from recorded-only nodes.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: node-roster
intents: [list mesh nodes, show enrolled peers, which machines are online, recorded mesh node]
surfaces: [page, right]
operations: [nodes]
data: ["nodes:/nodes/0/network_state", "nodes:/nodes/0/access_state", "nodes:/nodes/0/vault_only"]
---

<style>
  .mesh-roster { padding:var(--spacing-md); border-block:1px solid var(--color-border); background:var(--color-surface); }
  .mesh-roster h2 { margin:0 0 .5rem; }
  .mesh-roster dt { color:var(--color-accent); font-weight:600; }
  .mesh-roster dd { margin:0 0 .6rem; }
</style>
<section class="mesh-roster">
  <h2>Compare node records</h2>
  <dl>
    <dt>Membership</dt><dd>Read current network state for enrolled machines.</dd>
    <dt>Recorded only</dt><dd>Keep an earlier record separate from current membership and liveness.</dd>
  </dl>
</section>

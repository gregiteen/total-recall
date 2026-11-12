---
type: ui-chunk:chunk
title: Mesh network atlas
description: Read current network, control API, and enrollment observations for the private fleet.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: network-atlas
intents: [mesh overview, fleet connectivity, check mesh network, control server verified, inspect enrolled machines]
surfaces: [page, right]
panel: network
operations: [status]
data: ["status:/state", "status:/control/verified", "status:/enrollment/state", "status:/observed_at"]
---

<style>
  .mesh-atlas { color:var(--color-text); background:var(--color-surface); padding:var(--spacing-md); border-inline-start:3px solid var(--color-accent); }
  .mesh-atlas h2 { margin:.3em 0; font:600 clamp(1.6rem,5vw,2.3rem) var(--typography-heading-font-family,Georgia,serif); }
  .mesh-atlas p { margin:0; }
  .mesh-atlas small { letter-spacing:.12em; text-transform:uppercase; color:var(--color-accent); }
</style>
<header class="mesh-atlas">
  <small>Mesh field atlas</small>
  <h2>Read the fleet</h2>
  <p>Open a machine to inspect membership, path, recorded login, and execution separately.</p>
</header>

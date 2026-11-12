---
type: ui-chunk:chunk
title: Mesh control verification
description: Check the control API and local mesh network as independent observations.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: control-probe
intents: [verify mesh control API, probe control server, troubleshoot Headscale API, check control plane health]
surfaces: [page, right]
operations: [probe]
data: ["probe:/control/verified", "probe:/control/state", "probe:/network_available"]
---

<style>
  .mesh-probe { padding:var(--spacing-md); background:var(--color-surface); border-inline-start:3px solid var(--color-accent); }
  .mesh-probe h2 { margin-top:0; }
  .mesh-probe li + li { margin-top:.4em; }
</style>
<section class="mesh-probe">
  <h2>Test the control API</h2>
  <ul>
    <li>Read whether the authenticated control API was verified.</li>
    <li>Check local mesh network availability separately.</li>
  </ul>
</section>

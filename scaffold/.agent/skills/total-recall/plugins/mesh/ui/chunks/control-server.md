---
type: ui-chunk:chunk
title: Recorded mesh control server
description: Check whether the local owner has a recorded provisioning target for the control server.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: control-server
intents: [inspect mesh server provisioning, manage Headscale control server, check recorded server target, mesh server update]
surfaces: [page]
operations: [server]
data: ["server:/provisioned"]
---

<style>
  .mesh-server { padding:var(--spacing-md); background:var(--color-surface); border:1px solid var(--color-border); }
  .mesh-server h2 { margin-top:0; }
  .mesh-server code { color:var(--color-accent); }
</style>
<section class="mesh-server">
  <h2>Inspect the provisioning record</h2>
  <p>Run <code>server status</code> for the recorded control-server target. Use the control probe to verify the service that is answering now.</p>
</section>

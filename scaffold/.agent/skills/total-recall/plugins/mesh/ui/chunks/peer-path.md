---
type: ui-chunk:chunk
title: Mesh peer path and latency
description: Probe a named peer and report whether its network path answered, with timing when available.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: peer-path
intents: [ping mesh peer, check node path, measure mesh latency, test reachability]
surfaces: [page, right]
operations: [ping]
data: ["ping:/reachable", "ping:/latency_ms"]
---

<style>
  .mesh-path { padding:var(--spacing-md); border:1px dashed var(--color-border); background:var(--color-surface); }
  .mesh-path h2 { margin-top:0; }
  .mesh-path strong { color:var(--color-accent); }
</style>
<section class="mesh-path">
  <h2>Check the path to a peer</h2>
  <p>Ping a named machine. A response proves the path from this machine at the time of the test.</p>
  <p><strong>Round-trip time</strong> appears when the probe can measure it.</p>
</section>

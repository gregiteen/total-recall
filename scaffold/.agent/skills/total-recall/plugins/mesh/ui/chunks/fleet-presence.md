---
type: ui-chunk:chunk
title: Fresh mesh presence
description: Observe recent activity evidence from reachable peers and check when the fleet observation was made.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: fleet-presence
intents: [check fleet presence, find active mesh device, see idle evidence, last peer activity]
surfaces: [page, right, bottom]
operations: [presence]
data: ["presence:/success", "presence:/timestamp", "presence:/peers/0/state"]
---

<style>
  .mesh-presence { padding:var(--spacing-md); background:var(--color-surface); border-block-end:1px solid var(--color-border); }
  .mesh-presence h2 { margin-top:0; }
  .mesh-presence em { color:var(--color-muted); }
</style>
<section class="mesh-presence">
  <h2>Read current device activity</h2>
  <p>Check whether the peer answered with a fresh activity observation. Use the observation time to distinguish fresh presence from an earlier record.</p>
  <p><em>Unavailable presence remains unknown.</em></p>
</section>

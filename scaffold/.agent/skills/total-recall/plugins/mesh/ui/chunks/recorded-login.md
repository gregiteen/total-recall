---
type: ui-chunk:chunk
title: Recorded mesh login
description: Inspect whether the selected node has a complete login record and when it was verified.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: recorded-login
intents: [inspect mesh login, record node access, verify recorded SSH account, discover working login]
surfaces: [page]
operations: [access]
data: ["access:/complete", "access:/verified_at"]
---

<style>
  .mesh-login { padding:var(--spacing-md); background:var(--color-surface); border-radius:var(--radius-md); }
  .mesh-login h2 { margin-top:0; }
  .mesh-login b { color:var(--color-accent); }
</style>
<section class="mesh-login">
  <h2>Review how the fleet reaches a node</h2>
  <p>Inspect the resolved access record for the selected machine. A complete record gives the fleet a login target.</p>
  <p>Compare the <b>recorded verification time</b> with a new execution probe.</p>
</section>

---
type: ui-chunk:chunk
title: Mesh access policy
description: Inspect whether the control server has a policy and when its current policy was recorded.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: mesh-policy
intents: [inspect mesh policy, audit network ACL, review SSH grants, change mesh trust policy]
surfaces: [page]
operations: [policy]
data: ["policy:/configured", "policy:/updatedAt"]
---

<style>
  .mesh-policy { padding:var(--spacing-md); border-block:1px solid var(--color-border); background:var(--color-surface); }
  .mesh-policy h2 { margin-top:0; }
  .mesh-policy code { color:var(--color-warn); }
</style>
<section class="mesh-policy">
  <h2>Review the trust boundary</h2>
  <p>Read the control server policy with <code>policy get</code>. Review who can reach each destination before replacing a policy.</p>
  <p>The Boundary view presents policy and secret grants as separate observations.</p>
</section>

---
type: ui-chunk:chunk
title: Mesh credential readiness
description: Check whether Auth has the shared mesh credential, and use Auth to manage its value.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: credential-readiness
intents: [is mesh key configured, check mesh token status, save shared mesh credential, refresh Headscale auth]
surfaces: [page, right]
operations: [token-status, token]
data: ["token-status:/present", "token:/present"]
---

<style>
  .mesh-auth { padding:var(--spacing-md); background:var(--color-surface); border-radius:var(--radius-md); }
  .mesh-auth h2 { margin:.25em 0; }
  .mesh-auth small { color:var(--color-accent); font-weight:600; }
</style>
<section class="mesh-auth">
  <small>Total Recall Auth</small>
  <h2>Read credential presence</h2>
  <p>Mesh Home reports whether the shared credential is saved. Check control verification separately. Use the credential setup panel to manage the value through Auth.</p>
</section>

---
type: ui-chunk:chunk
title: This machine's mesh enrollment
description: Inspect local enrollment and backend state and determine whether unattended enrollment is enabled.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: local-enrollment
intents: [check mesh enrollment, join private mesh, re-enroll local machine, inspect mesh backend]
surfaces: [page, right]
operations: [enroll]
data: ["enroll:/state", "enroll:/backend_state", "enroll:/auto_enroll_enabled"]
---

<style>
  .mesh-join { padding:var(--spacing-md); background:var(--color-surface); border-inline-start:3px solid var(--color-warn); }
  .mesh-join h2 { margin-top:0; }
  .mesh-join small { color:var(--color-muted); }
</style>
<section class="mesh-join">
  <h2>Check how this machine joined</h2>
  <p>Read <code>enroll --status</code> for the local enrollment state, backend state, and unattended enrollment setting.</p>
  <small>Re-enrollment can interrupt this machine’s connection. Confirm the target before changing it.</small>
</section>

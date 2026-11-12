---
type: ui-chunk:chunk
title: Mesh secret grants
description: Review the selected node, user, or tag scope and verify the outcome of an explicit grant change.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: secret-grants
intents: [list mesh secret grants, revoke mesh credential access, allow named keys on node, review Auth trust boundary]
surfaces: [page]
operations: [grants]
data: ["grants:/ok"]
---

<style>
  .mesh-grants { padding:var(--spacing-md); border-inline-start:3px solid var(--color-warn); background:var(--color-surface); }
  .mesh-grants h2 { margin-top:0; }
  .mesh-grants dt { color:var(--color-accent); }
  .mesh-grants dd { margin:0 0 .45em; }
</style>
<section class="mesh-grants">
  <h2>Review machine access to secrets</h2>
  <dl>
    <dt>Inspect</dt><dd>Read the grant inventory in Boundary.</dd>
    <dt>Change</dt><dd>Select a node, tag, or user and confirm the permitted key names before adding or removing a grant.</dd>
  </dl>
</section>

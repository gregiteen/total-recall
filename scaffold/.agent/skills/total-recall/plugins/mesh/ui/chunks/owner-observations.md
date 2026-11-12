---
type: ui-chunk:chunk
title: Mesh owner observations
description: Read the selected fleet view and inspect its source evidence and observation time.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: owner-observations
intents: [read mesh view, mesh flows evidence, placement source observations, inspect boundary sources]
surfaces: [page, right]
operations: [view]
data: ["view:/screen", "view:/observed_at", "view:/sources/status/ok"]
---

<style>
  .mesh-sources { padding:var(--spacing-md); background:var(--color-surface); }
  .mesh-sources h2 { margin-top:0; }
  .mesh-sources small { color:var(--color-muted); }
</style>
<section class="mesh-sources">
  <h2>Trace a fleet observation</h2>
  <p>Select Machines, Flows, Placement, Boundary, or Join. Each view reports when its owner commands ran and whether each source answered.</p>
  <small>A source can fail while the other observations remain available.</small>
</section>

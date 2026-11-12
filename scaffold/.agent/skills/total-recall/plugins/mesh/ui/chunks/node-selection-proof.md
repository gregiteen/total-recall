---
type: ui-chunk:chunk
plugin: mesh
id: node-selection-proof
title: Choose a mesh node with verified capabilities
description: Use current reachability and installed harness observations to narrow the list of candidate execution nodes.
timestamp: "2026-11-08T23:12:00Z"
intents: [choose a mesh node for work, check which peer has a harness, verify a node can run the required runtime]
surfaces: [page]
panel: network
operations: [nodes, doctor]
data: ["doctor:/0/reachable", "doctor:/0/runtimes", "doctor:/0/harnesses"]
---
<section>
  <h2>Check a node against the work it needs to run</h2>
  <p>Start with the enrolled roster, then inspect the fleet execution probe. Filter to reachable nodes with the required runtime and harness. Recheck the selected peer before dispatch.</p>
</section>

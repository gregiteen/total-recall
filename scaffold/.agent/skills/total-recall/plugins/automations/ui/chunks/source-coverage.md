---
type: ui-chunk:chunk
plugin: automations
id: source-coverage
title: Mesh automation source coverage
description: Inspect node reachability, per-source coverage and observed state counts before relying on an inventory.
timestamp: "2026-11-08T10:14:00Z"
intents: [automation node coverage, offline or unauthorized automation source, observed automation state counts]
surfaces: [page]
operations: [list, status]
data:
  - status:/schema_version
  - status:/checked_at
  - status:/complete
  - status:/nodes/0/node_id
  - status:/nodes/0/hostname
  - status:/nodes/0/ip
  - status:/nodes/0/self
  - status:/nodes/0/online
  - status:/nodes/0/checked_at
  - status:/nodes/0/status
  - status:/nodes/0/error
  - status:/nodes/0/counts
  - status:/nodes/0/coverage/0/source
  - status:/nodes/0/coverage/0/status
  - status:/nodes/0/coverage/0/checked_at
  - status:/nodes/0/coverage/0/error
  - list:/nodes/0/node_id
  - list:/nodes/0/hostname
  - list:/nodes/0/ip
  - list:/nodes/0/self
  - list:/nodes/0/online
  - list:/nodes/0/checked_at
  - list:/nodes/0/status
  - list:/nodes/0/error
---
<section data-design-component="ledger-note" aria-label="Mesh automation source coverage">
  <p data-design-component="ledger-label">Coverage</p>
  <h2>Mesh automation source coverage</h2>
  <p>Review the node check time and each source outcome. A count is meaningful only beside its coverage, including unsupported sources and offline nodes.</p>
</section>

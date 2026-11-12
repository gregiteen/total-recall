---
type: ui-chunk:chunk
plugin: meta-harness
id: fleet-maintenance
title: Maintain the harness registry
description: Review upstream versions, register supported adapters and explicitly maintain integrations.
timestamp: "2026-11-08T09:34:00Z"
intents: [check harness updates, inspect changelog, configure a custom harness, maintain fleet integrations]
surfaces: [page]
operations: [upstream, changelog, adapter, setup, maintenance]
data: ["adapter:/active/0/id"]
---

<section>
  <h2>Maintain the harness registry</h2>
  <dl>
    <dt><strong>Release evidence</strong></dt><dd>Check <code>upstream</code> and request <code>changelog</code> where an adapter supports it.</dd>
    <dt><strong>Adapter declarations</strong></dt><dd>Inspect the active registry with <code>adapter list</code>. Register a reviewed definition through the same owner command.</dd>
    <dt><strong>Integration work</strong></dt><dd>Choose a host before using <code>setup</code> or <code>maintenance</code> and review the resulting receipts.</dd>
  </dl>
</section>

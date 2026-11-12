---
type: ui-chunk:chunk
plugin: meta-harness
id: harness-inventory
title: Inspect harness availability
description: Compare registered adapters, selected nodes, observed installations and adoption evidence.
timestamp: "2026-11-08T09:34:00Z"
intents: [inspect harness inventory, check local agents, compare mesh harness availability, verify managed adoption]
surfaces: [page, right]
operations: [catalog, status, nodes, inspect, adoption]
data: ["catalog:/permissions"]
---

<section style="border-inline-start:2px solid var(--color-signal,#38bdf8);padding-inline-start:1rem">
  <h2>Inspect harness availability</h2>
  <dl>
    <dt><strong>Registry</strong></dt><dd><code>catalog</code> lists the configured adapters and supported command effects.</dd>
    <dt><strong>Selected host</strong></dt><dd><code>nodes</code> lists execution targets. Use <code>inspect</code> or <code>status</code> for observed binary and login state on a specific node.</dd>
    <dt><strong>Managed adoption</strong></dt><dd><code>adoption</code> brings native gate activity and actual managed run receipts together.</dd>
  </dl>
</section>

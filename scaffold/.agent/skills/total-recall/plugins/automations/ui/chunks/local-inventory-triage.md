---
type: ui-chunk:chunk
plugin: automations
id: local-inventory-triage
title: Triage missing automations in local inventory
description: Inspect this machine's source coverage before treating an absent record as a missing automation.
timestamp: "2026-11-08T23:12:00Z"
intents: [why is an automation missing locally, check local automation inventory completeness, narrow fleet automation inventory to this host]
surfaces: [page]
panel: automations
operations: [list, status]
data: ["list:/complete", "list:/nodes/0/self", "list:/nodes/0/coverage/0/source", "list:/nodes/0/coverage/0/status"]
---
<section data-design-component="ledger-note">
  <h2>Start with local source coverage</h2>
  <p>Switch the ledger to this machine. Check whether the automation's source was read before looking elsewhere or deciding that its record is absent.</p>
</section>

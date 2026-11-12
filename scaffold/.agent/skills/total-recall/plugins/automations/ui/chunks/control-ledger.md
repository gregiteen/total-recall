---
type: ui-chunk:chunk
plugin: automations
id: control-ledger
title: Automation control ledger
description: Browse observed automation records, filter by trigger and state, and distinguish declarations from an actual run.
timestamp: "2026-11-08T10:14:00Z"
intents: [automation inventory, scheduled work control ledger, filter automation trigger state and source]
surfaces: [page]
panel: automations
operations: [list]
data:
  - list:/schema_version
  - list:/checked_at
  - list:/complete
  - list:/nodes/0/automations/0/id
  - list:/nodes/0/automations/0/node_id
  - list:/nodes/0/automations/0/source
  - list:/nodes/0/automations/0/name
  - list:/nodes/0/automations/0/intent
  - list:/nodes/0/automations/0/origin
  - list:/nodes/0/automations/0/trigger/kind
  - list:/nodes/0/automations/0/trigger/summary
  - list:/nodes/0/automations/0/trigger/timezone
  - list:/nodes/0/automations/0/enabled
  - list:/nodes/0/automations/0/state
  - list:/nodes/0/automations/0/runner_available
  - list:/nodes/0/automations/0/placement
  - list:/nodes/0/automations/0/plugin_id
  - list:/nodes/0/automations/0/plugin_name
  - list:/nodes/0/automations/0/schedule
  - list:/nodes/0/automations/0/valid
  - list:/nodes/0/automations/0/last_handled_slot
  - list:/nodes/0/automations/0/last_run/at
  - list:/nodes/0/automations/0/last_run/state
  - list:/nodes/0/automations/0/last_run/exit_code
---
<section data-design-component="ledger-note" aria-label="Automation control ledger">
  <p data-design-component="ledger-label">Triggers · sources · outcomes</p>
  <h2>Automation control ledger</h2>
  <p>Filter the inventory by node, source, trigger or observed state. Start with this node and scan the mesh when you need remote coverage.</p>
</section>

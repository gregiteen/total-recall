---
type: ui-chunk:chunk
plugin: automations
id: pending-control
title: Confirm pending task cancellation
description: Review the local source-owned control, confirm the pending task target, and verify its final cancellation receipt.
timestamp: "2026-11-08T10:14:00Z"
intents: [cancel pending local durable automation, source owned task cancellation receipt, pending task safety controls]
surfaces: [page]
operations: [list, show, cancel]
data:
  - list:/nodes/0/coverage/0/source
  - list:/nodes/0/coverage/0/status
  - list:/nodes/0/coverage/0/checked_at
  - list:/nodes/0/coverage/0/error
  - list:/nodes/0/automations/0/last_exit_code
  - list:/nodes/0/automations/0/command
  - list:/nodes/0/automations/0/actions/0/command
  - list:/nodes/0/automations/0/actions/0/label
  - list:/nodes/0/automations/0/actions/0/args/0
  - list:/nodes/0/automations/0/actions/0/effect
  - list:/nodes/0/automations/0/owner_ref/layer
  - list:/nodes/0/automations/0/owner_ref/slug
  - show:/automation/actions/0/command
  - show:/automation/actions/0/label
  - show:/automation/actions/0/args/0
  - show:/automation/actions/0/effect
  - show:/automation/owner_ref/layer
  - show:/automation/owner_ref/slug
  - show:/automation/last_exit_code
  - cancel:/success
  - cancel:/id
  - cancel:/state
---
<section data-design-component="ledger-note" aria-label="Confirm pending task cancellation">
  <p data-design-component="ledger-label">Local controls</p>
  <h2>Confirm pending task cancellation</h2>
  <p>Choose a pending record with an advertised cancellation action. Review its source and stable ID before confirming. The owner must report the final cancelled state.</p>
</section>

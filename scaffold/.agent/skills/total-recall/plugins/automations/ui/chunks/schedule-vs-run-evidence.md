---
type: ui-chunk:chunk
plugin: automations
id: schedule-vs-run-evidence
title: Verify that a scheduled automation actually ran
description: Compare the declared schedule and last handled slot with the observed run time and exit state for an automation.
timestamp: "2026-11-08T23:12:00Z"
intents: [verify scheduled automation actually ran, investigate missed schedule slot, compare schedule with observed automation outcome]
surfaces: [page]
panel: automations
operations: [list, show]
data: ["show:/automation/schedule", "show:/automation/last_handled_slot", "show:/automation/last_run/at", "show:/automation/last_run/state", "show:/automation/last_run/exit_code"]
---
<section data-design-component="ledger-note">
  <h2>Find observed run evidence</h2>
  <p>Open the automation in the ledger. Compare the schedule and last handled slot with the observed run time and exit state. A schedule identifies when work should run.</p>
</section>

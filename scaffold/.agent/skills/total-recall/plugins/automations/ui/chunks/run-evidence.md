---
type: ui-chunk:chunk
plugin: automations
id: run-evidence
title: Automation run evidence
description: Inspect the source-owned automation record, schedule, last handled slot and actual outcome by stable ID.
timestamp: "2026-11-08T10:14:00Z"
intents: [inspect automation run outcome, audit handled slot and exit code, show automation by stable ID]
surfaces: [page]
operations: [show]
data:
  - show:/schema_version
  - show:/checked_at
  - show:/automation/id
  - show:/automation/node_id
  - show:/automation/source
  - show:/automation/name
  - show:/automation/intent
  - show:/automation/command
  - show:/automation/origin
  - show:/automation/trigger/kind
  - show:/automation/trigger/summary
  - show:/automation/trigger/timezone
  - show:/automation/enabled
  - show:/automation/state
  - show:/automation/runner_available
  - show:/automation/last_run/at
  - show:/automation/last_run/state
  - show:/automation/last_run/exit_code
  - show:/automation/placement
  - show:/automation/plugin_id
  - show:/automation/plugin_name
  - show:/automation/schedule
  - show:/automation/valid
  - show:/automation/last_handled_slot
---
<section data-design-component="ledger-note" aria-label="Automation run evidence">
  <p data-design-component="ledger-label">Observed runs</p>
  <h2>Automation run evidence</h2>
  <p>Read the record by stable ID. A handled slot records scheduler activity. The run timestamp, state and exit code describe execution when the owner reports them.</p>
</section>

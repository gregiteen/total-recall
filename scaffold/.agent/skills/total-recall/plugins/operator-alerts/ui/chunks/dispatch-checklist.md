---
type: ui-chunk:chunk
plugin: operator-alerts
id: dispatch-checklist
title: Deliberate alert dispatch
description: Prepare a real operator notification and identify the evidence to collect after sending.
timestamp: "2026-11-08T10:00:00Z"
intents: [prepare an operator alert, send incident notification, review dispatch before sending]
surfaces: [page, right]
operations: [send]
---
<section data-design-component="dispatch-note" aria-label="Operator alert dispatch checklist">
  <p data-design-component="dispatch-marker">Intentional delivery</p>
  <h2>Before sending an alert</h2>
  <ol>
    <li>Confirm the intended route and recipient.</li>
    <li>Review severity and quiet hours, then prepare the title and message.</li>
    <li>Run <code>total-recall alerts send</code> in the operator terminal and check the recorded receipt.</li>
  </ol>
</section>

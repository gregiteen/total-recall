---
type: ui-chunk:chunk
plugin: operator-alerts
id: route-policy
title: Alert routing policy
description: Identify the configured channels and the Auth owner for private route references.
timestamp: "2026-11-08T10:00:00Z"
intents: [list configured alert channels, review alert routing settings, manage notification credential references]
surfaces: [page, right]
operations: [config, status]
data: ["status:/authOwner", "status:/configuredChannels"]
---
<section data-design-component="dispatch-note" aria-label="Alert routing policy">
  <p data-design-component="dispatch-marker">Routing configuration</p>
  <h2>Configured routes</h2>
  <p>Route names come from merged settings. Use <code>total-recall alerts config</code> in the operator terminal for the complete settings.</p>
  <p>Keep private destinations and provider credentials in Auth and reference them from the selected route.</p>
</section>

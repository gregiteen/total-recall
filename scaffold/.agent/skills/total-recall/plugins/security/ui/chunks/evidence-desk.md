---
type: ui-chunk:chunk
plugin: security
id: evidence-desk
title: Security evidence desk
description: Local runtime platform, assessment modes and bundled Auth session ownership.
timestamp: "2026-11-08T09:30:00Z"
intents: [security home, local security tools, security assessment capabilities]
surfaces: [page]
panel: home
operations: [status, platforms]
data: ["status:/host_platform", "status:/auth_integration", "status:/device_coverage/platforms", "platforms:/platforms"]
---
<section data-design-component="evidence-note" aria-label="Security assessment scope">
  <p data-design-component="section-marker">Scope first</p>
  <h2>Security evidence desk</h2>
  <p>Check the current runtime and available assessment modes. Start a machine, mesh, source or device review when you have chosen a target.</p>
</section>

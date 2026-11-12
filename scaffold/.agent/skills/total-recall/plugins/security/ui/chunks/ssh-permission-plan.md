---
type: ui-chunk:chunk
plugin: security
id: ssh-permission-plan
title: SSH permission plan
description: Review the observed local hardening plan before deliberately applying verified repairs.
timestamp: "2026-11-08T09:30:00Z"
intents: [preview SSH hardening, repair local SSH file permissions, check applied permission changes]
surfaces: [page, right]
operations: [harden, machine]
data: ["harden:/status", "harden:/applied_count", "machine:/remediation/changed"]
---
<section data-design-component="evidence-note" aria-label="SSH permission plan">
  <p data-design-component="section-marker">Local change</p>
  <h2>Review, then repair</h2>
  <p>The preview describes the observed state and reports zero applied changes. Confirm the separate repair action to change recognized local SSH file modes and verify the outcome.</p>
</section>

---
type: ui-chunk:chunk
plugin: operator-alerts
id: channel-readiness
title: Dry-run route readiness
description: Check the configured alert routes using the local dry-run path.
timestamp: "2026-11-08T10:00:00Z"
intents: [test notification setup, dry run alert channels, diagnose configured alert routes]
surfaces: [page, right]
operations: [test, status]
data: ["status:/configuredChannels", "status:/channelChecks", "status:/channelChecks/0/channel", "status:/channelChecks/0/status"]
---
<section data-design-component="dispatch-note" aria-label="Notification route readiness">
  <p data-design-component="dispatch-marker">Local dry run</p>
  <h2>Check alert routes</h2>
  <p>Choose Run dry check in Dispatch Watch to review the authored settings for each configured route. The check sends no notification.</p>
  <p>Review failed routes before dispatch. Verify recipient delivery separately.</p>
</section>

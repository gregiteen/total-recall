---
type: ui-chunk:chunk
plugin: operator-alerts
id: channel-check-scope
title: Check one alert channel
description: Choose a configured alert channel and run a local dry check without dispatching an alert.
timestamp: "2026-11-08T23:15:00Z"
intents: [dry run an individual alert channel, diagnose one alert route without sending]
surfaces: [page, right]
operations: [status, test]
data: ["status:/configuredChannels", "status:/channelChecks/0/channel", "status:/channelChecks/0/status"]
---

<section><h2>Check one alert channel</h2><p>Choose a channel from the redacted status and pass its ID to the dry-run test. Treat route readiness separately from external delivery.</p></section>

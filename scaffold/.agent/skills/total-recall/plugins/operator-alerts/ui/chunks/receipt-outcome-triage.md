---
type: ui-chunk:chunk
plugin: operator-alerts
id: receipt-outcome-triage
title: Alert receipt outcome triage
description: Compare recent redacted alert receipt status and outcome across channels.
timestamp: "2026-11-08T23:15:00Z"
intents: [find recently failed alerts, distinguish suppressed and accepted alert receipts]
surfaces: [page, right]
operations: [status]
data: ["status:/recentReceipts/0/channel", "status:/recentReceipts/0/status", "status:/recentReceipts/0/at", "status:/recentReceipts/0/outcome"]
---

<section><h2>Alert receipt outcome triage</h2><p>Compare the latest channel, status, and outcome. An accepted submission can still require separate delivery evidence.</p></section>

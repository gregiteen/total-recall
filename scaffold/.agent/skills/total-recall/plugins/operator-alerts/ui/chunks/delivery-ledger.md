---
type: ui-chunk:chunk
plugin: operator-alerts
id: delivery-ledger
title: Recent alert receipts
description: Review recorded notification outcomes and spot submissions requiring follow-up.
timestamp: "2026-11-08T10:00:00Z"
intents: [show alert history, inspect recent notification outcomes, find failed or unknown alert submissions]
surfaces: [page, right]
panel: home
operations: [log, status]
data: ["status:/recentReceipts", "status:/recentReceipts/0/channel", "status:/recentReceipts/0/status", "status:/recentReceipts/0/at", "status:/recentReceipts/0/outcome"]
---
<section data-design-component="dispatch-note" aria-label="Alert receipt ledger">
  <p data-design-component="dispatch-marker">Recorded evidence</p>
  <h2>Recent alert receipts</h2>
  <p>The watch shows each recorded route, submission state and time. An unknown outcome needs reconciliation before retrying.</p>
  <p>Use the terminal ledger when you need a private receipt reference. Acceptance and recipient delivery are separate checks.</p>
</section>

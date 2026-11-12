---
type: ui-chunk:chunk
plugin: security
id: device-evidence
title: Guided and measured device evidence
description: Separate user-attested review counts from limited authorized Android property readings.
timestamp: "2026-11-08T09:30:00Z"
intents: [review phone or tablet security, Chromebook or Windows device checklist, inspect authorized Android properties]
surfaces: [page, right]
operations: [device, android]
data: ["device:/verification", "device:/coverage/reviewed", "device:/coverage/total", "android:/status", "android:/coverage/observed", "android:/coverage/total"]
---
<section data-design-component="evidence-note" aria-label="Device evidence modes">
  <p data-design-component="section-marker">Device scope</p>
  <h2>Guided review and property reads</h2>
  <ul>
    <li>Guided review records fresh observations you made on the named device.</li>
    <li>Android property checks use an existing authorized connection and cover a limited set of properties.</li>
  </ul>
  <p>Use an ordinary label and check outcomes for manual review. Keep PINs, tokens and recovery keys in their owning systems.</p>
</section>

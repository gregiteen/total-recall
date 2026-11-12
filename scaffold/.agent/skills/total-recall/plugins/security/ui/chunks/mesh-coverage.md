---
type: ui-chunk:chunk
plugin: security
id: mesh-coverage
title: Mesh assessment coverage
description: Selected and observed fleet targets with incomplete coverage identified explicitly.
timestamp: "2026-11-08T09:30:00Z"
intents: [fleet security audit, security assessment across mesh, find unobserved machines]
surfaces: [page, right]
operations: [fleet, secure-all]
data: ["fleet:/status", "fleet:/coverage/discovered", "fleet:/coverage/selected", "fleet:/coverage/observed", "secure-all:/status", "secure-all:/coverage/selected", "secure-all:/coverage/observed"]
---
<section data-design-component="evidence-note" aria-label="Mesh assessment coverage">
  <p data-design-component="section-marker">Mesh scope</p>
  <h2>Account for each target</h2>
  <p>Compare the number of selected machines with the number that returned observations. An offline or unsupported peer keeps the assessment incomplete.</p>
  <p>Use a discovered machine name to inspect a single authorized target. Fleet-wide assessment returns evidence for review.</p>
</section>

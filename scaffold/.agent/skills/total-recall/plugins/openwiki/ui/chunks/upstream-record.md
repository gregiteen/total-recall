---
type: ui-chunk:chunk
plugin: openwiki
id: upstream-record
title: Recorded generator status
description: Read the bundled generator version and its last recorded upstream check.
timestamp: "2026-11-08T09:14:38Z"
intents: [show OpenWiki status, check recorded generator version, inspect last upstream observation]
surfaces: [page, right]
operations: [status]
data: ["status:/generatorVersion", "status:/upstream/lastChecked"]
---

<section>
  <h2>Recorded generator status</h2>
  <p>The atlas reads the shipped generator version from its build receipt. It displays the latest saved upstream observation and its date when available.</p>
  <p>Use <code>total-recall openwiki status --json</code> to inspect the complete record.</p>
</section>

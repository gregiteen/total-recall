---
type: ui-chunk:chunk
plugin: openwiki
id: refresh-report
title: Review wiki freshness
description: Report which registered projects' wiki pages are current or due for regeneration.
timestamp: "2026-11-08T09:14:38Z"
intents: [report stale wiki pages, check wiki freshness, plan documentation refresh]
surfaces: [page, right]
operations: [refresh]
data: ["refresh:/counts/due", "refresh:/counts/current"]
---

<section>
  <h2>Review wiki freshness</h2>
  <p>Run <code>total-recall openwiki refresh --json</code> to inspect due and current projects. Limit the report to a registered repository with <code>--repo</code>.</p>
  <p>Use <code>--apply</code> only after approving the report's scope and model-backed regeneration.</p>
</section>

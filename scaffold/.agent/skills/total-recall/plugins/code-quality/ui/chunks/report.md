---
type: ui-chunk:chunk
plugin: code-quality
id: report
title: Latest gate report
description: Read the cached report and compare its coverage and findings with the current repository revision.
timestamp: '2026-11-08T08:04:00Z'
intents: [read the latest gate report, find failing gates, check report freshness, review skipped checks]
surfaces: [page]
operations: [report]
data: ['report:/status', 'report:/reasons', 'report:/tier', 'report:/gitHead', 'report:/currentHead', 'report:/finishedAt', 'report:/ageMs', 'report:/durationMs', 'report:/changedSinceRun', 'report:/sourceFileCount', 'report:/ranChecks', 'report:/skippedChecks', 'report:/gates', 'report:/totalFindings', 'report:/blockingFindings', 'report:/findings', 'report:/findingsTruncated']
panel: code-quality-home
---
<section data-design-component="report">
  <h2>Read the latest gate evidence</h2>
  <p>Start with freshness, then check skipped gates and blocking findings. Reload the stored report if a check has just finished.</p>
</section>

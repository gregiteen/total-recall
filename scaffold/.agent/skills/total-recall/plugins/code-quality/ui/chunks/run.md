---
type: ui-chunk:chunk
plugin: code-quality
id: run
title: Run repository gates
description: Start the selected repository's fast or full quality gate run and review the fresh report.
timestamp: '2026-11-08T23:25:00Z'
intents: [run fast quality gates, run the full repository checks, rerun gates after fixing findings]
surfaces: [page]
operations: [run, report]
data: ['report:/status', 'report:/finishedAt', 'report:/ranChecks', 'report:/blockingFindings']
panel: code-quality-report
---
<section data-design-component="report">
  <h2>Run repository gates</h2>
  <p>Choose the fast or full tier. The owner locks the selected repository for one run, then the panel reads the completed report with its timestamp and gate coverage.</p>
</section>

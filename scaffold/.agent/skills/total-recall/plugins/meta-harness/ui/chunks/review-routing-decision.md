---
type: ui-chunk:chunk
plugin: meta-harness
id: review-routing-decision
title: Explain why a harness was selected
description: Review the selected adapter, classifier source and surrounding routing evidence before committing a managed run.
timestamp: "2026-11-08T23:12:00Z"
intents: [explain a harness routing choice, review selected adapter before execution, compare route evidence with task needs]
surfaces: [page]
operations: [route, benchmarks, learn]
data: ["route:/selected", "route:/classifier/source", "benchmarks:/synced", "learn:/totalHistoryRuns"]
---
<section>
  <h2>Review the route decision</h2>
  <p>Compare the chosen adapter with the classifier source and available history. A route receipt records the decision. Inspect run evidence separately after execution.</p>
</section>

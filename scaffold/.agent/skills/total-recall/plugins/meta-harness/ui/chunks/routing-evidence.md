---
type: ui-chunk:chunk
plugin: meta-harness
id: routing-evidence
title: Review routing evidence
description: Compare sourced benchmark metadata with observed local run history and alert outcomes.
timestamp: "2026-11-08T09:34:00Z"
intents: [review harness benchmarks, inspect routing scorecard, check quota alerts, inspect run history]
surfaces: [page, right]
operations: [benchmarks, learn, alerts]
data: ["benchmarks:/synced", "learn:/totalHistoryRuns"]
---

<section style="border-inline-start:2px solid var(--color-signal,#38bdf8);padding-inline-start:1rem">
  <h2>Review routing evidence</h2>
  <p><code>benchmarks</code> separates sourced figures from the pass rates measured on this machine. <code>learn</code> summarizes the managed run receipts and identifies recurring limits.</p>
  <p>Use <code>alerts</code> for an explicit check of the operator alert path. Review delivery evidence through the owning alert plugin.</p>
</section>

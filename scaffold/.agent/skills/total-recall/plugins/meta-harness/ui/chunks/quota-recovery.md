---
type: ui-chunk:chunk
plugin: meta-harness
id: quota-recovery
title: Inspect queued work and quota
description: Review observed usage and decide whether to retry or cancel a queued job.
timestamp: "2026-11-08T09:34:00Z"
intents: [show quota wait queue, inspect harness limits, retry after quota resets, cancel queued job]
surfaces: [page, right]
operations: [quota, usage-queue, usage-retry, usage-cancel]
data: ["usage-queue:/ok"]
---

<section>
  <h2>Inspect queued work and quota</h2>
  <ol>
    <li>Use <code>quota</code> for observed limits on the selected host.</li>
    <li>Use <code>usage-queue</code> to find jobs waiting for included capacity.</li>
    <li>After reviewing the selected job, use <code>usage-retry</code> for an explicit retry or <code>usage-cancel</code> to stop waiting.</li>
  </ol>
</section>

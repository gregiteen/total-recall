---
type: ui-chunk:chunk
plugin: openwiki
id: host-probe
title: Probe the Total Recall host
description: Check the configured host's health endpoint and observe response latency.
timestamp: "2026-11-08T09:14:38Z"
intents: [probe Total Recall host, inspect wiki host availability, check health response]
surfaces: [page, right]
operations: [probe]
data: ["probe:/ok", "probe:/status", "probe:/latency_ms"]
---

<section>
  <h2>Probe the Total Recall host</h2>
  <p>Run <code>total-recall openwiki probe --json</code> to observe the HTTP status and response time for the configured host's health endpoint.</p>
  <p>Use the wiki index or evidence search to check documentation coverage.</p>
</section>

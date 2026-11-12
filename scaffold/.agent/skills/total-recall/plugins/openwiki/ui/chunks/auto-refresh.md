---
type: ui-chunk:chunk
plugin: openwiki
id: auto-refresh
title: Scheduled wiki refresh
description: Understand the daemon operation that applies regeneration to due registered repositories.
timestamp: "2026-11-08T09:14:38Z"
intents: [inspect scheduled wiki refresh, understand automatic regeneration, review daemon wiki refresh]
surfaces: [page]
operations: [auto-refresh]
data: ["auto-refresh:/counts/current", "auto-refresh:/counts/refreshed"]
---

<section style="border-inline-start:3px solid var(--color-primary,#8d3e10);padding-inline-start:1rem">
  <h2>Scheduled wiki refresh</h2>
  <p><code>auto-refresh</code> is the daemon's applying operation. It checks the selected registered repositories and regenerates due pages.</p>
  <p>Use <code>total-recall openwiki refresh --json</code> for an operator preview. Review the scheduled run receipt to see what the daemon refreshed.</p>
</section>

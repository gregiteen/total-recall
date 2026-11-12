---
type: ui-chunk:chunk
plugin: openwiki
id: watch-upstream
title: Check for an upstream release
description: Record an upstream observation and inspect whether a newer generator is available.
timestamp: "2026-11-08T09:14:38Z"
intents: [check OpenWiki upstream release, inspect newer generator version, review upstream watch result]
surfaces: [page]
operations: [watch]
data: ["watch:/status/updateAvailable"]
---

<section>
  <h2>Check for an upstream release</h2>
  <p>Run <code>total-recall openwiki watch --check-only --json</code> to check upstream and save the latest observation. Alerts and propagation are separate actions.</p>
  <p>Review the reported version and release notes before deciding whether to update registered repositories.</p>
</section>

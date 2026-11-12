---
type: ui-chunk:chunk
plugin: openwiki
id: generator-settings
title: Inspect generator configuration
description: Review the configured provider, model routing, token bound and timeout.
timestamp: "2026-11-08T09:14:38Z"
intents: [inspect OpenWiki configuration, review generation limits, change wiki generator settings]
surfaces: [page, right]
operations: [config]
data: ["config:/config/provider", "config:/config/max_tokens", "config:/config/timeout_ms"]
---

<section>
  <h2>Inspect generator configuration</h2>
  <p>Run <code>total-recall openwiki config show --json</code> to inspect the active provider, routing, token bound and timeout.</p>
  <p>Use <code>config get</code> for an individual setting. An explicit <code>config set</code> changes the chosen setting for future generation.</p>
</section>

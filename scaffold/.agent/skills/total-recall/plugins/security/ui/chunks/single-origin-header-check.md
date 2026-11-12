---
type: ui-chunk:chunk
plugin: security
id: single-origin-header-check
title: Check HTTPS headers for one authorized URL
description: Check an authorized HTTPS response and distinguish reachable endpoints from responses missing expected headers.
timestamp: "2026-11-08T23:12:00Z"
intents: [check response headers for one authorized HTTPS URL, verify expected security headers, diagnose missing response headers]
surfaces: [page]
panel: home
operations: [probe]
data: ["probe:/status", "probe:/ok", "probe:/latency_ms", "probe:/security_headers"]
---
<section>
  <h2>Inspect one response</h2>
  <p>Open Website headers and enter the authorized HTTPS URL without credentials or a query. Read the HTTP result and the observed header coverage before deciding what to change.</p>
</section>

---
type: ui-chunk:chunk
plugin: security
id: https-headers
title: HTTPS response evidence
description: Observed response status, header coverage and middleware snippet installation state.
timestamp: "2026-11-08T09:30:00Z"
intents: [audit authorized website headers, verify HTTPS response status, review header middleware coverage]
surfaces: [page, right]
operations: [probe, site-audit, site-shield]
data: ["probe:/status", "probe:/ok", "probe:/latency_ms", "probe:/security_headers", "site-audit:/status", "site-audit:/grade", "site-audit:/score", "site-audit:/checks_count", "site-shield:/installed", "site-shield:/coverage"]
---
<section data-design-component="evidence-note" aria-label="HTTPS header evidence">
  <p data-design-component="section-marker">Website scope</p>
  <h2>Observe the HTTPS response</h2>
  <p>For an authorized HTTPS URL, inspect the response and header presence. The site audit grades observed headers. Read the middleware snippet’s coverage before integrating and testing it in your application.</p>
</section>

---
type: ui-chunk:chunk
plugin: security
id: source-review
title: Source and plugin review
description: Count static findings, inspection scope and installed plugin coverage.
timestamp: "2026-11-08T09:30:00Z"
intents: [scan source for security findings, inspect installed plugin security, baseline security review]
surfaces: [page, right]
operations: [scan, audit, plugins]
data: ["scan:/total_findings", "scan:/critical", "scan:/high", "audit:/passed", "audit:/findings_count", "audit:/plugins_audited", "plugins:/status", "plugins:/total_plugins", "plugins:/total_findings"]
---
<section data-design-component="evidence-note" aria-label="Source review scope">
  <p data-design-component="section-marker">Source scope</p>
  <h2>Review findings by scope</h2>
  <dl>
    <dt>Source scan</dt><dd>Review high and critical findings in an authorized directory.</dd>
    <dt>Plugin review</dt><dd>Compare findings and inspected packages across the installed registry.</dd>
    <dt>Baseline audit</dt><dd>Read permission checks and source review together.</dd>
  </dl>
</section>

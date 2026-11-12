---
type: ui-chunk:chunk
plugin: code-quality
id: detect
title: Detect candidate gates
description: Propose checks based on existing repository scripts and optionally apply the proposal.
timestamp: '2026-11-08T08:04:00Z'
intents: [suggest quality gates, detect package checks, review detected gates]
surfaces: [page]
operations: [detect]
---
<section data-design-component="workflow">
  <h2>Review detected checks</h2>
  <p>Run detection to see which checks the repository already exposes. Use <code>--apply</code> after reviewing the proposed configuration.</p>
</section>

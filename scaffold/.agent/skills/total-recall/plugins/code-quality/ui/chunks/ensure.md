---
type: ui-chunk:chunk
plugin: code-quality
id: ensure
title: Set up missing gates
description: Give a repository its gate list from what it really contains, without replacing one it already has.
timestamp: '2026-11-25T01:45:00Z'
intents: [set up quality gates, give a repository gates, fix a repository with no gates, record a gate list]
surfaces: [page]
operations: [ensure, gate-status]
---
<section data-design-component="workflow">
  <h2>Set up gates where there are none</h2>
  <p>Run <code>ensure</code> in a repository with a Total Recall project brain. It detects the checks the repository already declares and records them. A repository that already has a list is left exactly as it is.</p>
  <p>Preview first with <code>ensure --dry-run</code>. To cover every active registered project, run it with the all option from any repository.</p>
</section>

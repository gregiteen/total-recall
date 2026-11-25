---
type: ui-chunk:chunk
plugin: code-quality
id: coverage
title: Gate coverage
description: See which registered repositories have gates, whether their lists are recorded and how old each last report is.
timestamp: '2026-11-25T01:45:00Z'
intents: [show gate coverage, find repositories without gates, check stale gate reports, list gate lists]
surfaces: [page]
operations: [coverage, ensure]
---
<section data-design-component="report">
  <h2>Gate coverage across your repositories</h2>
  <p>Each row shows a registered project, its gate state and the age of its last report. Active repositories without gates are listed first to fix. Fix them with <code>ensure</code>.</p>
</section>

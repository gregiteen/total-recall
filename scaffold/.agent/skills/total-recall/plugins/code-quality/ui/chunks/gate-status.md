---
type: ui-chunk:chunk
plugin: code-quality
id: gate-status
title: Gate status at a glance
description: One line on whether this repository has gates and whether the last run passed, shown when a session starts.
timestamp: '2026-11-25T01:45:00Z'
intents: [check gate status, does this repository have gates, session start quality check]
surfaces: [page]
operations: [gate-status, ensure]
---
<section data-design-component="report">
  <h2>Does this repository have gates?</h2>
  <p>The answer is read from the recorded gate list and the last report. A repository with no list, or one whose last run failed, asks for attention. Set up missing gates with <code>ensure</code>.</p>
</section>

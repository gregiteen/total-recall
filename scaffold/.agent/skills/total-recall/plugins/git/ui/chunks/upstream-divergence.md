---
type: ui-chunk:chunk
plugin: git
id: upstream-divergence
title: Check branch divergence before integration
description: Review upstream state and local ahead or behind counts before choosing a branch integration action.
timestamp: "2026-11-08T23:12:00Z"
intents: [check commits ahead and behind, inspect missing upstream, prepare branch integration]
surfaces: [page]
panel: repository
operations: [audit]
data: ["audit:/headState", "audit:/upstreamStatus", "audit:/unpushedCommits", "audit:/behindCommits"]
---
<section>
  <h2>Read branch divergence</h2>
  <p>Check whether this checkout has an upstream. On a tracked branch, compare commits ahead and behind, then check the working tree before selecting an integration action.</p>
</section>

---
type: ui-chunk:chunk
plugin: meta-harness
id: adapter-docs-freshness
title: Check harness documentation freshness
description: Distinguish an absent documentation cache from an outdated snapshot, then inspect the official source that governs the adapter.
timestamp: "2026-11-08T23:12:00Z"
intents: [check harness docs freshness, find the official source for a harness, verify adapter behavior against current docs]
surfaces: [page]
operations: [docs-status, docs-sources, docs-search, docs-read]
data: ["docs-status:/ok", "docs-sources:/sources"]
---
<section>
  <h2>Check the documentation cache before using it</h2>
  <p>Read documentation status and identify the official source. Search the current snapshot for the behavior you need. Refresh stale or missing documentation through the owner before relying on it.</p>
</section>

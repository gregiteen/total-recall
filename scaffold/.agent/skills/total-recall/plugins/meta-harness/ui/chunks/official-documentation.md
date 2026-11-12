---
type: ui-chunk:chunk
plugin: meta-harness
id: official-documentation
title: Read verified harness documentation
description: Find approved sources and inspect cached documentation integrity and freshness.
timestamp: "2026-11-08T09:34:00Z"
intents: [find harness documentation, search official command docs, inspect documentation cache freshness]
surfaces: [page, right]
operations: [docs-status, docs-sources, docs-read, docs-search, docs-refresh, docs-ensure]
data: ["docs-status:/ok", "docs-sources:/sources"]
---

<article>
  <h2>Read verified harness documentation</h2>
  <p>Start with <code>docs-sources</code> for the approved official sources. Use <code>docs-status</code> to check the local copy, then <code>docs-search</code> and <code>docs-read</code> to locate the relevant section.</p>
  <p>Use <code>docs-ensure</code> to refresh missing or stale pages, or <code>docs-refresh</code> to request a refresh. Verify the result through the cache status.</p>
</article>

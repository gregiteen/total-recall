---
type: ui-chunk:chunk
title: Git change comparison
description: Compare unstaged, staged, or base-relative changes using the owner diff operation.
timestamp: "2026-11-08T09:20:00Z"
plugin: git
id: change-comparison
intents: [review git diff, check staged files, compare branch to base, read diff stats, show a patch]
surfaces: [page, right]
operations: [diff]
data: ["diff:/ok", "diff:/cached", "diff:/diffStat", "diff:/timestamp"]
---

<style>
  .sentinel-diff { padding:var(--spacing-md); border-block:1px solid var(--color-border); background:var(--color-surface); }
  .sentinel-diff h2 { margin-top:0; }
  .sentinel-diff dt { color:var(--color-accent); }
  .sentinel-diff dd { margin:0 0 .45em; }
</style>
<section class="sentinel-diff">
  <h2>Choose a comparison</h2>
  <dl>
    <dt>Working tree</dt><dd>Read the current changes against the index.</dd>
    <dt>Staged</dt><dd>Review the index against the selected base.</dd>
    <dt>Patch</dt><dd>Use <code>--patch</code> for line changes. The Home displays file statistics.</dd>
  </dl>
</section>

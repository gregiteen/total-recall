---
type: ui-chunk:chunk
title: Git Sentinel repository ledger
description: Read the active checkout, local upstream comparison, dirty files, conflicts, and stashes.
timestamp: "2026-11-08T09:20:00Z"
plugin: git-sentinel
id: repository-ledger
intents: [audit git repository, check working tree, git branch and upstream, count unpushed commits, show conflicts and stashes]
surfaces: [page, right]
panel: repository
operations: [audit]
data: ["audit:/headState", "audit:/upstreamStatus", "audit:/isClean", "audit:/unpushedCommits", "audit:/conflictedFiles", "audit:/totalDirty", "audit:/stashCount", "audit:/timestamp"]
---

<style>
  .sentinel-ledger { padding:var(--spacing-md); border-inline-start:3px solid var(--color-accent); color:var(--color-text); background:var(--color-surface); }
  .sentinel-ledger h2 { margin:.3rem 0; font:600 clamp(1.55rem,5vw,2.2rem) var(--typography-heading-font-family,Georgia,serif); }
  .sentinel-ledger p { margin:0; }
  .sentinel-ledger small { text-transform:uppercase; letter-spacing:.11em; color:var(--color-accent); }
</style>
<header class="sentinel-ledger">
  <small>Git Sentinel</small>
  <h2>Read the current checkout</h2>
  <p>Review repository state and its registered worktrees. Ahead and behind come from the local tracking ref.</p>
</header>

---
type: ui-chunk:chunk
title: Registered Git worktrees
description: List the repository's main and linked worktrees and inspect their checked-out revisions.
timestamp: "2026-11-08T09:20:00Z"
plugin: git-sentinel
id: registered-worktrees
intents: [list git worktrees, inspect linked worktrees, find detached worktree, show active checkouts]
surfaces: [page, right]
operations: [worktree-list]
data: ["worktree-list:/ok", "worktree-list:/worktrees/0/head"]
---

<style>
  .sentinel-index { padding:var(--spacing-md); border:1px solid var(--color-border); background:var(--color-surface); }
  .sentinel-index h2 { margin-top:0; }
  .sentinel-index b { color:var(--color-accent); }
</style>
<section class="sentinel-index">
  <h2>Read the worktree register</h2>
  <p>Compare the revision and branch of each registered checkout. The Home labels <b>Main</b> and <b>Current</b> separately.</p>
</section>

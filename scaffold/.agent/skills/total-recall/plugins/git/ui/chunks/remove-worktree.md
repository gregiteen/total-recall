---
type: ui-chunk:chunk
title: Remove a linked worktree
description: Review a registered linked worktree, confirm its target, and read the removal result.
timestamp: "2026-11-08T09:20:00Z"
plugin: git
id: remove-worktree
intents: [remove linked git worktree, clean up isolated checkout, review worktree removal, dirty worktree refused]
surfaces: [page]
operations: [worktree-remove]
data: ["worktree-remove:/ok", "worktree-remove:/removed"]
---

<style>
  .sentinel-remove { padding:var(--spacing-md); border-inline-start:3px solid var(--color-danger); background:var(--color-surface); }
  .sentinel-remove h2 { margin-top:0; }
  .sentinel-remove small { color:var(--color-muted); }
</style>
<section class="sentinel-remove">
  <h2>Confirm the linked checkout</h2>
  <p>Select the worktree by path. The Home checks Git’s removal receipt before refreshing the register.</p>
  <small>Git refuses ordinary removal when the worktree contains local changes.</small>
</section>

---
type: ui-chunk:chunk
title: Create a detached worktree
description: Create a linked Git worktree from an explicit base ref and verify its resulting revision.
timestamp: "2026-11-08T09:20:00Z"
plugin: git
id: create-worktree
intents: [create git worktree, isolate git checkout, add detached worktree, choose worktree base]
surfaces: [page]
operations: [worktree-create]
data: ["worktree-create:/ok", "worktree-create:/head", "worktree-create:/detached"]
---

<style>
  .sentinel-create { padding:var(--spacing-md); background:var(--color-surface); border-radius:var(--radius-md); }
  .sentinel-create h2 { margin-top:0; }
  .sentinel-create li::marker { color:var(--color-accent); }
</style>
<section class="sentinel-create">
  <h2>Prepare an isolated checkout</h2>
  <ol>
    <li>Choose a destination and a base ref.</li>
    <li>Confirm the destination before creation, then verify the detached revision.</li>
  </ol>
</section>

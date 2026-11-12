---
type: ui-chunk:chunk
title: Work not in the default branch
description: Find branches with commits the default branch lacks, worktrees with uncommitted changes and detached worktrees holding commits on no branch.
timestamp: "2026-11-12T21:30:00Z"
plugin: git
id: unmerged-work
intents: [find unmerged branches, find unfinished worktrees, check for work that never landed, see what is not merged into main]
surfaces: [page, right]
operations: [unmerged]
data: ["unmerged:/outstanding", "unmerged:/summary", "unmerged:/repositories/0/branches", "unmerged:/repositories/0/worktrees", "unmerged:/repositories/0/kept"]
---

<style>
  .sentinel-unmerged { padding:var(--spacing-md); border:1px solid var(--color-border); background:var(--color-surface); }
  .sentinel-unmerged h2 { margin-top:0; }
  .sentinel-unmerged b { color:var(--color-accent); }
</style>
<section class="sentinel-unmerged">
  <h2>Land what is still outside the default branch</h2>
  <p>Each branch shows its commits the default branch lacks and whether they are pushed. Each worktree shows its <b>uncommitted</b> files and any commits on no branch, which removing the worktree would lose. Merge or report every item before ending the work.</p>
</section>

---
type: ui-chunk:chunk
title: Worktree compatibility commands
description: Use the owner compatibility command in the terminal to list, create, or remove linked worktrees.
timestamp: "2026-11-08T09:20:00Z"
plugin: git-sentinel
id: worktree-terminal
intents: [git sentinel worktree command, worktree compatibility syntax, terminal git worktree list, worktree create remove alias]
surfaces: [page]
operations: [worktree]
data: ["worktree:/ok", "worktree:/worktrees/0/head", "worktree:/removed"]
---

<style>
  .sentinel-terminal { padding:var(--spacing-md); border:1px dashed var(--color-border); background:var(--color-surface); }
  .sentinel-terminal h2 { margin-top:0; }
  .sentinel-terminal code { color:var(--color-accent); overflow-wrap:anywhere; }
</style>
<section class="sentinel-terminal">
  <h2>Use the compatibility command</h2>
  <p><code>total-recall git-sentinel worktree list</code> reads the register. Select <code>create</code> or <code>remove</code> with the required path for an explicit change.</p>
</section>

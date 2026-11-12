---
type: ui-chunk:chunk
plugin: git
id: worktree-conflict-triage
title: Triage conflicts in a linked checkout
description: Find unresolved conflicts and distinguish them from staged, unstaged and untracked work before opening a diff.
timestamp: "2026-11-08T23:12:00Z"
intents: [triage merge conflicts, compare staged and unstaged work during a conflict, inspect dirty worktree before cleanup]
surfaces: [page]
panel: repository
operations: [audit, diff]
data: ["audit:/conflictedFiles", "audit:/stagedFiles", "audit:/unstagedFiles", "audit:/untrackedFiles", "diff:/diffStat"]
---
<section>
  <h2>Separate conflicts from other local changes</h2>
  <p>Read the conflict count first. Then open diff statistics for the relevant working or staged changes. Preserve the linked checkout until its local work is resolved.</p>
</section>

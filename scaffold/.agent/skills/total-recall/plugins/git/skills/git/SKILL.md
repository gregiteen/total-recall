---
name: git
description: "The whole git CLI through Total Recall: sign-in from the auth store, guarded commits and pushes, undo, fleet state, and the intent behind every change."
version: 2.3.0
repo_scoped: false
---

# Git

The whole git CLI through Total Recall: sign-in from the auth store, guarded commits and pushes, undo, fleet state, and the intent behind every change.

## When to Use

Use the `git` Total Recall plugin (`total-recall git`) instead of ad-hoc scripts or raw commands whenever working on git tasks.

## Commands

```bash
total-recall git --help
total-recall git audit  # Summarise branch, worktree, upstream and stash state (--json for machine output)
total-recall git diff  # Read a stat or patch for unstaged, staged or base-relative changes
total-recall git commit  # Check identity, conflicts, HEAD, secrets and repository rules, then run git's own commit with your arguments
total-recall git push  # Check outgoing commits for secrets and rules, turn --force into --force-with-lease, then run git's own push
total-recall git credential-helper  # Git credential helper: give git the mapped auth-store credential (get); store and erase do nothing
total-recall git auth  # Sign-in: status (live check, no secret shown), map <host> <KEY>, setup (helper entries for this machine)
total-recall git cli  # Git CLI metadata (version, path, install source, upstream, release notes); --all-nodes for the mesh; cli update updates git through its installer
total-recall git undo  # Restore refs, index and files from the snapshot taken before a destructive git command; --list shows snapshots
total-recall git fleet  # Dirty, unpushed, behind, diverged, stale stashes and abandoned worktrees across registered repositories; --all-nodes for the mesh
total-recall git unmerged  # Branches with commits not in the default branch, worktrees with uncommitted changes and detached worktrees holding commits on no branch; --registered for every registered repository
total-recall git where  # Machines and checkouts that contain a commit
total-recall git why  # Blame one line plus the session, tracker item, decision and rules recorded when it was committed
```

## Owned Raw Commands

This plugin owns: `(^|[;&|(]\s*)git(\s+-C\s+\S+)?\s+[a-z]`.

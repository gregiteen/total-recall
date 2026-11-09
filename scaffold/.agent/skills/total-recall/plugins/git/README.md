# Git

The whole git CLI through Total Recall. Every git command works: anything that is not a plugin
operation runs git itself, with your arguments, git's hooks, output and exit status. On top of git,
the plugin signs git in from the auth store, checks commits and pushes, takes a snapshot before
destructive commands, and records the intent behind each change.

```bash
total-recall git status
total-recall git pull --rebase
total-recall git help rebase        # git's own help for a command
total-recall git --help             # the plugin's operations
total-recall git commit --help      # one plugin operation's help (-h is git's usage)
```

## Install

```bash
npx total-recall plugin install git
```

## Commit and push

- `commit [git commit arguments]` refuses a missing or machine-derived identity, unresolved
  conflicts and a detached HEAD, then runs git's own `commit` with your arguments unchanged.
- Before `commit` and `push`, guards run:
  - **Secret firewall:** the staged content and outgoing commits are compared with fingerprints of
    every value in the auth store. A match refuses the command and names the key, never the value.
  - **Rules:** workflow files (`.github/workflows`), internal project records in public
    repositories, and machine-derived identities are refused.
  - **Force-push guard:** `--force` becomes `--force-with-lease`. Deleting a remote branch needs
    `--reason <text>`, which is recorded.

## Undo

Before a destructive command (`reset --hard`, `checkout -- <paths>`, `restore`, `clean`,
`branch -D`, `stash drop|clear`, `rebase`, `filter-branch`, `update-ref -d`) the plugin records a
snapshot of refs, the index and files.

```bash
total-recall git undo --list
total-recall git undo <event>
```

## Sign-in

```bash
total-recall git auth status          # live check against the remote; no secret is shown
total-recall git auth map <host> <KEY>
total-recall git auth setup           # helper entries for this machine
```

git asks the auth store through `credential-helper`; the credential goes only to git.

## The git CLI on every node

```bash
total-recall git cli --json           # version, path, install source, upstream, release notes
total-recall git cli --all-nodes
total-recall git cli update           # update git through its installer
```

The task `cli update --scheduled` runs daily on every node.

## Across the mesh

```bash
total-recall git fleet --all-nodes    # dirty, unpushed, behind, diverged, stale stashes, abandoned worktrees
total-recall git where <commit>       # machines and checkouts that contain a commit
```

## Intent

```bash
total-recall git why <file>:<line>    # blame plus the session, tracker item and rules recorded at commit time
total-recall git message              # draft a commit message from the diff, tracker and action log
total-recall git group [--apply]      # split a dirty tree into commits by agent session
total-recall git resolve [--apply]    # propose conflict resolutions from both sides' intent
total-recall git bisect-agent <good> <bad>   # first bad commit, with the quality gate as the test
total-recall git handoff <branch> [--out <file>]   # branch, tracker and memory as one SSSS bundle
```

Successful commits are recorded with their session and tracker items. A commit message that names
a decision is saved to memory.

## Repository state

```bash
total-recall git audit [--json]       # branch, worktree, upstream and stash state
total-recall git identity [--json]    # commit identity and the identities history publishes
total-recall git diff --json [--patch] [--cached] [--base <ref>]
```

An unknown upstream is never reported as zero unpushed commits.

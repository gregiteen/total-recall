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
total-recall git fleet --all-nodes    # dirty, unpushed, behind, diverged, stale stashes, abandoned worktrees, unmerged
total-recall git where <commit>       # machines and checkouts that contain a commit
```

## Unmerged work

```bash
total-recall git unmerged [--json]    # this repository
total-recall git unmerged --registered   # every registered repository
```

Lists local branches with commits the default branch lacks, linked worktrees with uncommitted
changes, and detached worktrees holding commits that no branch contains (removing such a worktree
loses them). A commit counts as landed when the default branch, local or origin, reaches it or holds
an equivalent patch, so rebased and cherry-picked work is not listed; a squash merge is a different
patch, so delete the branch once it has landed. Stale worktree records and branches kept on purpose
(`git config --add totalrecall.keepBranch <name>`) are shown but not counted. Registered brains
that are not git repositories are skipped.

The plugin declares this report as its `startup_check`, so `total-recall startup check` and
`brief` show the outstanding count and where it is whenever a session starts.

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

## Using this from an agent

Send every git command here: `total-recall git <git command and arguments>` runs git itself, with
the same output and exit status, plus sign-in from the auth store and the guards above. Push your
finished, tested work yourself; never push unfinished work.

```bash
total-recall git status --short
total-recall git add -A
total-recall git commit -m "<message>"
total-recall git push
total-recall git fleet --json
total-recall git unmerged
total-recall git undo --list
```

Finish what you start: land a branch or worktree once its work is done, then remove it. `unmerged`
shows what is still outside the default branch.

A refused commit or push names the rule or the auth key that matched; fix the cause, never bypass
the guard. Raw commands this plugin owns: `git <command>`.

# Git Hygiene

Reports the state of the git repository you run it in: current branch, staged / unstaged / untracked / conflicted files, commits not yet pushed to upstream, and stashes.

**Reporting accuracy, verified 2026-10-23.** Two defects reported in the September 30 review are fixed and covered by testing:

- **Porcelain columns are preserved.** `git status --porcelain` output is never trimmed, so a file whose name begins with a space parses correctly. Verified against a file literally named `" leading-space.txt"`, which reports as `A   leading-space.txt`.
- **An unknown upstream is never reported as zero unpushed commits.** `upstreamStatus` distinguishes `tracking`, `none`, `gone`, `detached`, `unborn`, `unknown` and `error`; where no comparison exists, `unpushedCommits` is `null` rather than `0`. Verified in a repository with no remote configured.

**Use cases:** software-development

The native Home opens with an audit and registered worktrees. It reads diff statistics on request and confirms the exact destination or target before a worktree change. Its [design](DESIGN.md) and SSSS blocks under `ui/chunks/` ship with the plugin.

## Install

```bash
npx total-recall plugin install git-sentinel
```

## Use

```bash
npx total-recall git-sentinel audit          # human summary
npx total-recall git-sentinel audit --json   # machine output for agents
npx total-recall git-sentinel diff           # diffstat of unstaged changes
npx total-recall git-sentinel identity --json # current commit identity and local history audit
```

## Share with your other nodes

```bash
npx total-recall plugin share git-sentinel
# on another node on the mesh:
npx total-recall plugin install peer:<this-node>/git-sentinel
```

## Capability scope

The plugin runs against the Git worktree selected by the installed Total Recall CLI. Use `diff --patch`, `--cached` and `--base <ref>` for actual Git comparisons. Worktree listing is read-only, creation makes a detached worktree, and removal requires a registered linked worktree. Dirty removal requires `--force`. See the [Git Sentinel project tracker](docs/projects/in-progress/GIT_SENTINEL_CARD/GIT_SENTINEL_CARD_PROJECT_TRACKER.md).

## Using this from an agent

Use the read operations for worktree state, changes, upstream comparison, stashes and commit identity. Worktree creation and removal have separate operation effects.

```bash
total-recall git-sentinel audit --json
total-recall git-sentinel diff --json
total-recall git-sentinel diff --patch --cached --json
total-recall git-sentinel identity --json
total-recall git-sentinel worktree-list --json
total-recall git-sentinel worktree-create <path> --base <ref> --json
total-recall git-sentinel worktree-remove <path> --json
```

Raw commands this plugin owns: `git status`, `git stash list`, `git diff --stat`, `git config user.*` and author lookups through `git log`.

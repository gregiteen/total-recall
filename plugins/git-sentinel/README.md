# Git Sentinel

September 30 review: The audit reproduced two reporting bugs: trimming porcelain output corrupts its first leading status column; missing upstream/error can become zero unpushed commits. PIC-018 requires column-preserving parsing and explicit unknown/no-upstream/error states. These fields remain unreliable until repaired. See the [correction tracker](../../docs/projects/in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

Reports the state of the git repository you run it in: current branch, staged / unstaged / untracked files, commits not yet pushed to upstream, and stashes.

**Use cases:** software-development

## Install

```bash
npx total-recall plugin install git-sentinel
```

## Use

```bash
npx total-recall git-sentinel audit          # human summary
npx total-recall git-sentinel audit --json   # machine output for agents
npx total-recall git-sentinel diff           # diffstat of unstaged changes
```

## Share with your other nodes

```bash
npx total-recall plugin share git-sentinel
# on another node on the mesh:
npx total-recall plugin install peer:<this-node>/git-sentinel
```

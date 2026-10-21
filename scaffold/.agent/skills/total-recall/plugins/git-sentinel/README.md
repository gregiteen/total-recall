# Git Hygiene

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

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-git-sentinel.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/git-sentinel` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-git-sentinel.git` and run `total-recall git-sentinel`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.

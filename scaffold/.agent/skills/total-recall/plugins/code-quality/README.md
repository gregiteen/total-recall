# Code Quality — a Total Recall plugin

One-shot, fail-closed code-quality gates for any repository. The plugin ships a shared **core** (gate runner, report reader, repo detector, config contract). Each repository keeps its own **gate list**, customized through the Total Recall CLI instead of hand-edited files.

## What it does

- Runs each configured gate once, as a background job, and writes `reports/latest.json`. There is no daemon.
- Gate kinds: a command (typecheck, lint, tests, conformance suites) with an output parser (`tsc`, `eslint-stylish`, `eslint-compact`, `biome`, `flake8`, `mypy`, `black`, `generic`), or `grep-forbid`, which turns a written repository invariant into a failing gate.
- Tiers (`fast`, `full`, `remote`) keep heavy work off small machines. A bounded run lists the gates it skipped.
- Locking is fail-closed and machine-wide, so only one check runs per host. `--steal-lock` recovers a dead or unverifiable lock and refuses to take one from a verified running check.
- Reports record coverage, the git head and source freshness. A gate that scans zero files, or a tool that fails without parseable output, is never reported as clean.

## Install into a repository

Requires Total Recall and a project brain in the target repository (`total-recall init --project`). There is no skill to deploy: the runner stays in this plugin and the repository keeps only its state.

```bash
total-recall plugin install https://github.com/gregiteen/tr-plugin-code-quality
total-recall code-quality detect            # review the proposal
total-recall code-quality detect --apply    # or: init (prompts for missing fields)
total-recall code-quality gate add id=types tier=fast cmd='["npx","tsc","--noEmit"]' parser=tsc
total-recall code-quality config check      # contract, drift, and gate-command checks
```

```bash
total-recall code-quality gate list
total-recall code-quality-check --tier fast # run the gates once; background job
total-recall code-quality report            # latest report; never starts a check
total-recall code-quality report file src/  # findings for one path
```

## Running on a test node

```bash
total-recall code-quality config set remoteNode build-box
total-recall code-quality snapshot --node build-box --name my-repo --install
```

`snapshot` copies the exact source (git file lists of the repo and its linked plugins, secrets refused) plus the gate config, with a SHA-256 manifest. `--install` runs `npm ci` beside it. On the node, run `node .agent/skills/total-recall/plugins/code-quality/core/check.mjs`.

## Where things live

| Path | Owner |
|:--|:--|
| `core/` (runner, report reader, detector, config contract) | this plugin |
| `.agent/skills/code-quality/config.json`, `reports/`, lock | the repository (state only, no skill content) |

The canonical gate list is a `skill_config` record in the repository's Total Recall project vault. `config.json` is regenerated from it, and hand edits are reported as drift.

## Data and network access

The core runs only the commands in the repository's own config, with the repository as working directory. It reads tracked source files for `grep-forbid` gates and writes only `reports/` and lock files. It makes no network requests. Commands you configure may.

## Development

```bash
npm test
```

MIT licensed.


## Readiness reconciliation — 2026-09-30

[Canonical correction plan](docs/projects/completed/CODE_QUALITY_PLUGIN/CODE_QUALITY_PLUGIN_PROJECT_TRACKER.md). No fresh suite was run against this external repository HEAD during the documentation review. Run `npm test` and configured gates on the Mac mini in a bounded background job. The Total Recall central preview is unwired static UI and is not an operational demonstration of this plugin.

- **PIC-040:** The Total Recall host CodeQualityPreview.tsx:81 fabricates 42/42 tests and fixed passing gates; it is unwired, and is not proof of this plugin runner.
- **PIC-041:** Existing architecture names core/config.schema.json, but the tracked file is skills/code-quality/core/config.schema.json; cli.mjs uses host skill-config support, not a self-contained gate configuration store.

Durable capability state must use validated SSSS operations. Delivery requires a real clean-install command/UI walkthrough, explicit unavailable/error states and actual result provenance. Tests may use synthetic fixtures; shipped capability behavior may not.

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-code-quality.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/code-quality` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-code-quality.git` and run `total-recall code-quality`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.

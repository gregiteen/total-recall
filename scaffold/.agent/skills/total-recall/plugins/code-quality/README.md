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

## Verify on the Mac mini

Run development gates in the local isolated checkout on the Mac mini. Start the one-shot check in a background job and read its final report and exit. The plugin's `snapshot` command is an optional transfer mechanism for installations that configure a separate test node. The owner workflow runs directly on the Mac mini.

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


## Current readiness

The [Code Quality tracker](docs/projects/in-progress/CODE_QUALITY_CARD/CODE_QUALITY_CARD_PROJECT_TRACKER.md) owns the current runner/report fixes and the card. The old extraction project and September correction findings are historical. In current source the schema and detector live in `core/`, while gate configuration uses the installed host's native writer.

## Install in Total Recall

The plugin uses the installed Total Recall runtime for gate configuration. The standalone `core/check.mjs` runner reads a supplied repository state directory. This manifest does not declare an independently vendorable application brick.

For structured output, use `total-recall code-quality report --json`. The existing positional `report json` is equivalent. Use `report --review-diagnostics --json` for cached failed gates, locations and observed snippets. Missing, stale and non-clean reports exit nonzero. See the [Code Quality project tracker](docs/projects/in-progress/CODE_QUALITY_CARD/CODE_QUALITY_CARD_PROJECT_TRACKER.md).

## Using this from an agent

Send work here to run a repository's quality gates, read the last report, or set gates up. Each check is one run with a machine-wide lock, so run it in the background and read the report.

```bash
total-recall code-quality-check --tier fast
total-recall code-quality report
total-recall code-quality detect
total-recall code-quality config check
```

This plugin owns no raw commands. A repository's own lint and test commands stay its own.

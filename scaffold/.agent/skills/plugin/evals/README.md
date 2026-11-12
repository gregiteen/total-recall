# Evals

Proof that the recipe and its checks work.

The positive fixture has a native Home, an SSSS page block, root `DESIGN.md`, bundled Auth and a standalone capability. Each defect case changes the files that produce its expected failure.

```
node evals/run.mjs                 # every case
node evals/run.mjs --case <name>
node evals/run.mjs --json
node evals/run.mjs --keep          # keep the temp fixture for inspection
```

Use an installed Total Recall and Auth catalog, or set `TOTAL_RECALL_BIN` to the candidate binary and `AGENT_DIR` to its plugin registry. The suite exits nonzero when a case fails.

## How a case is judged

A case declares the exact set of failed check names it expects. The positive case expects zero failures and requires the checks that prove Auth, native Home, design, block validation, coverage and capability portability.

## The cases

| Case | Defect it encodes | Expected |
| --- | --- | --- |
| [`fabricated-seed`](cases/01-fabricated-seed.mjs) | Home displays a seeded memory reading before any command runs | `no seeded values` |
| [`reassuring-default`](cases/02-reassuring-default.mjs) | Home displays "Healthy" when the response lacks a health reading | `no reassuring default` |
| [`declared-template`](cases/03-declared-template.mjs) | a native Home package retains a `card_layout` declaration and an orphaned card module | `contract`, `native presentation only` |
| [`home-collects-credential`](cases/04-home-collects-credential.mjs) | Home collects a service key in a password input and dispatches the raw value outside the declared credential interface | `credential interface` |
| [`host-leak-in-scaffold`](cases/05-host-leak-in-scaffold.mjs) | a capability calls the `total-recall` binary for credentials and uses a placeholder endpoint | `no Total Recall dependency`, `no placeholder values` |
| [`correct-plugin`](cases/06-correct-plugin.mjs) | native Home with a verified operation and binding, a bundled Auth session, an Auth-owned service key and a host-free capability | zero failures and all declared passes |
| [`missing-reuse`](cases/07-missing-reuse.mjs) | an otherwise valid plugin without a reuse decision | `reuse declared` |
| [`unresolved-owner-command`](cases/08-unresolved-owner-command.mjs) | a reference to an operation absent from its installed owner | `owner commands resolve` |
| [`missing-brick`](cases/09-missing-brick.mjs) | a declared brick without a project-owned copy | `required bricks present` |

## Adding a case

A case exports `{ name, why, files, expect }`. Use optional `flags` to isolate a recorder section when an intentionally invalid manifest prevents later sections from running independently.

```js
export default {
  name: 'kebab-case-name',
  why: 'the failure mode this encodes, and what it costs',
  files: { 'plugin.json': '…', 'cli.mjs': '…', 'ui/home.js': '…' },
  expect: { fail: ['the check name record.mjs must report'] },
}
```

Rules:

- Use `why` to state what can go wrong for the operator.
- List the exact recorder check names in `expect.fail`. An empty list requires acceptance. Put any required successful check names in `expect.pass`.
- Base each defect on an observed failure and isolate the behavior that the check is meant to catch.

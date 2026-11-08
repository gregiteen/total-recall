---
name: plugin
description: Author, review or fix a Total Recall plugin (tr-plugin-*). Declare real operations and data, author its bespoke Home and SSSS UI blocks, and compose pages through Decision.
repo_scoped: false
metadata:
  version: "1.1.0"
  source: total-recall-brain
---

# The plugin creator

A recipe for agents: prompts with exact specifications, executed in order. Each prompt says what to produce and what "correct" means, and each has a runnable check.

A plugin adds **one capability** to Total Recall. Core holds portable memory and generic loading; everything else is a plugin.

## Reuse the ecosystem first

Before designing or writing a plugin, inventory `total-recall plugin library --json`, `total-recall plugin available --json` and `total-recall plugin bricks --json`. Match each dependency to an existing owner. Call installed plugins for shared services and vendor existing bricks for code the project needs to own. Document the verified gaps that need new code. Run `record.mjs --reuse` after drafting the manifest and before implementing the capability.

**A plugin is not one shape.** It declares the surfaces its capability needs, and a capability can need almost any combination — memory, context, a CLI, skills, scheduled work, runtime behaviour, a face, deployment, distribution, composition. Some plugins are only a memory category. Some are only a generator. Some are a CLI. Some are several at once. What it is, is decided by what it does.

```
references/   every field, every rule, and the failure catalogue
prompts/      the recipe, one prompt per step
scripts/      the checks, runnable at any point
subagents/    delegatable reviews and extractions
evals/        proof that the recipe produces correct plugins
```

---

## The invariants

True of every plugin, whatever it turns out to be. Check every one before calling it done.

1. **Everything is declared.** If the plugin can do it, the manifest says so. Record its reused operations and brick dependencies as well.
2. **Every executable operation declares an effect** — `read`, `write`, `destructive`, `send`. The host uses it to decide what may run read-only; an agent uses it to know what needs confirmation.
3. **Machine-facing output is structured.** A command emits JSON under `--json` and exits non-zero on failure, so an agent acts on a result instead of scraping prose.
4. **Credentials are declared, never held.** Resolved only through `total-recall auth secret`. Never a second store, never `argv`, never an ambient environment variable, never a log.
5. **Real data only.** Every value traces to something that actually returned it. No seeded readings, no placeholders, no example defaults, no reassuring badges. A failure is reported as a failure, with the time of the last attempt.
6. **Owner design.** Every plugin ships a bespoke root `DESIGN.md` and a Home centered on its main workflows, live status and next actions. Author the interface in the owner repository.
7. **Composable coverage.** Every user-facing function and meaningful data point has an SSSS block with a stable owner ID. Jev selects from validated candidates through Decision. Track coverage of actual owner bindings and verify the rendered workflow.
8. **Fail closed.** A missing credential, a failed provider or an unreachable peer is an explicit error, never a success state.
9. **Copy.** No filler words, and no sentence ends with a preposition.

---

## The recipe

| # | Prompt | Produce | Check |
| --- | --- | --- | --- |
| 1 | [Establish the function](prompts/01-function.md) | the users, the tasks, the reused plugins and bricks | owner interfaces and gaps are identified |
| 2 | [Choose the surfaces](prompts/02-surfaces.md) | the manifest's surface set | each declared surface is used |
| 3 | [Scaffold, then stop generating](prompts/03-scaffold.md) | repository skeleton | it exists, tests run |
| 4 | [Write the CLI as an agent interface](prompts/04-cli.md) | operations, args, effects, JSON | `record.mjs` passes |
| 5 | [Declare credentials and settings](prompts/05-credentials.md) | `secrets[]`, `configuration` | one credential path, auth |
| 6 | [Design the Home and blocks](references/generative-home.md) | `DESIGN.md`, native panels, SSSS blocks | validate every block and check coverage |
| 7 | [Extract the scaffold](prompts/07-scaffold.md) | the capability for another app | runs with Total Recall absent |
| 8 | [Verify and report](prompts/08-verify.md) | a truthful report | `record.mjs` passes every check |

Read [surfaces](references/surfaces.md) before Prompt 2 and [generative Home](references/generative-home.md) before Step 6. The card reference applies to maintenance of older packages.

---

## Scripts

Run from the plugin repository.

```
node <skill>/scripts/record.mjs .              # every check
node <skill>/scripts/record.mjs . --manifest   # manifest only
node <skill>/scripts/record.mjs . --home       # Home, design and operation coverage
node <skill>/scripts/record.mjs . --card       # legacy card only
node <skill>/scripts/record.mjs . --secrets    # credential safety only
node <skill>/scripts/record.mjs . --scaffold   # standalone scaffold only
node <skill>/scripts/record.mjs . --reuse      # installed owner commands and required bricks
node <skill>/scripts/record.mjs . --json       # machine-readable result
```

`record.mjs` exits non-zero on any failure and prints the real reason. It is the same battery Prompt 8 asks you to run, so there is nothing to remember.

---

## Subagents

Delegate when the work is separable. Each is a prompt file, disposable and repeatable.

| Subagent | Use when | Returns |
| --- | --- | --- |
| [plugin-reviewer](subagents/plugin-reviewer.md) | a plugin is claimed finished | violations against the invariants, with evidence, or "clean" |
| [Home design procedure](references/generative-home.md) | the plugin's work is known and its Home is missing | a useful owner Home, verified bindings and bespoke design |
| [scaffold-extractor](subagents/scaffold-extractor.md) | a plugin holds a capability another app could use | capability module design, or "not separable, because…" |

The reviewer is adversarial by construction: it looks for fabricated values, host leaks, and a face that would suit any other plugin.

---

## Evals

`evals/` proves the recipe works, using plugins whose correct outcome is already known — including the real defects found in this ecosystem.

```
node evals/run.mjs          # run every case
node evals/run.mjs --case <name>
```

See [evals](evals/README.md).

---

## References

- [Surfaces](references/surfaces.md) — every surface and its exact manifest fields.
- [Generative Home](references/generative-home.md) — owner Home, SSSS chunks, Decision and evidence.
- [Legacy card](references/card.md) — maintenance of older packages.
- [Scaffold](references/scaffold.md) — the capability for another application, and distribution.
- [Anti-patterns](references/anti-patterns.md) — the failure catalogue, every entry observed in a real plugin.

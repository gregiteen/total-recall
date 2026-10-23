---
name: plugin
description: Author, review or fix a Total Recall plugin (tr-plugin-*). A recipe of exact specifications an agent executes, so the plugin declares the surfaces its function needs, serves agents through its CLI, scaffolds its capability into other applications, and renders a bespoke card face.
repo_scoped: false
metadata:
  version: "1.0.0"
  source: total-recall-brain
---

# The plugin creator

A recipe for agents: prompts with exact specifications, executed in order. Each prompt says what to produce and what "correct" means, and each has a runnable check.

A plugin adds **one capability** to Total Recall. Core holds portable memory and generic loading; everything else is a plugin.

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

1. **Everything is declared.** If the plugin can do it, the manifest says so. An undeclared operation does not exist to the host or to an agent.
2. **Every executable operation declares an effect** — `read`, `write`, `destructive`, `send`. The host uses it to decide what may run read-only; an agent uses it to know what needs confirmation.
3. **Machine-facing output is structured.** A command emits JSON under `--json` and exits non-zero on failure, so an agent acts on a result instead of scraping prose.
4. **Credentials are declared, never held.** Resolved only through `total-recall auth secret`. Never a second store, never `argv`, never an ambient environment variable, never a log.
5. **Real data only.** Every value traces to something that actually returned it. No seeded readings, no placeholders, no example defaults, no reassuring badges. A failure is reported as a failure, with the time of the last attempt.
6. **No templates.** Not for the face, and not for the plugin's shape. A face that could be dropped onto a different plugin is a failed face.
7. **Every plugin has a card face**, authored by hand from its own function.
8. **Fail closed.** A missing credential, a failed provider or an unreachable peer is an explicit error, never a success state.
9. **Copy.** No filler words, and no sentence ends with a preposition.

---

## The recipe

| # | Prompt | Produce | Check |
| --- | --- | --- | --- |
| 1 | [Establish the function](prompts/01-function.md) | the users, the tasks, the dependencies | you can name them |
| 2 | [Choose the surfaces](prompts/02-surfaces.md) | the manifest's surface set | each declared surface is used |
| 3 | [Scaffold, then stop generating](prompts/03-scaffold.md) | repository skeleton | it exists, tests run |
| 4 | [Write the CLI as an agent interface](prompts/04-cli.md) | operations, args, effects, JSON | `record.mjs` passes |
| 5 | [Declare credentials and settings](prompts/05-credentials.md) | `secrets[]`, `configuration` | one credential path, auth |
| 6 | [Design the card face by hand](prompts/06-card.md) | `ui/DESIGN.md`, `ui/card.js` | `record.mjs --card` passes |
| 7 | [Extract the scaffold](prompts/07-scaffold.md) | the capability for another app | runs with Total Recall absent |
| 8 | [Verify and report](prompts/08-verify.md) | a truthful report | `record.mjs` passes every check |

Read [surfaces](references/surfaces.md) before Prompt 2, and [card](references/card.md) before Prompt 6.

---

## Scripts

Run from the plugin repository.

```
node <skill>/scripts/record.mjs .              # every check
node <skill>/scripts/record.mjs . --manifest   # manifest only
node <skill>/scripts/record.mjs . --card       # face only
node <skill>/scripts/record.mjs . --secrets    # credential safety only
node <skill>/scripts/record.mjs . --scaffold   # standalone scaffold only
node <skill>/scripts/record.mjs . --json       # machine-readable result
```

`record.mjs` exits non-zero on any failure and prints the real reason. It is the same battery Prompt 8 asks you to run, so there is nothing to remember.

---

## Subagents

Delegate when the work is separable. Each is a prompt file, disposable and repeatable.

| Subagent | Use when | Returns |
| --- | --- | --- |
| [plugin-reviewer](subagents/plugin-reviewer.md) | a plugin is claimed finished | violations against the invariants, with evidence, or "clean" |
| [card-designer](subagents/card-designer.md) | the function is known and the face is not written | `ui/DESIGN.md` reasoning and a first `ui/card.js`, or the questions it cannot answer |
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
- [Card](references/card.md) — designing a bespoke face, and what it must never do.
- [Scaffold](references/scaffold.md) — the capability for another application, and distribution.
- [Anti-patterns](references/anti-patterns.md) — the failure catalogue, every entry observed in a real plugin.

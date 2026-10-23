# Prompt 2 — Choose the surfaces

A plugin declares the surfaces its capability needs. **It is not one shape.**

## The prompt

Read [surfaces](../references/surfaces.md) and select only what this function needs.

| Surface | Use when the capability… |
| --- | --- |
| Memory | adds a new kind of knowledge to the vault |
| Context | must change what agents read at the start of a task |
| CLI | offers operations an operator or an agent invokes |
| Skills | ships instruction an agent loads on demand |
| Tasks | must run on a schedule without being asked |
| Runtime | provides live behaviour rather than a command |
| UI | always — every plugin has a face |
| Deploy | is deployed into other applications |
| Distribution | is shared, sold, or operated as a service |
| Composition | builds on other bricks rather than starting from zero |

A plugin might be only a memory category. Only a generator. Only a router. Only a skill pack. A CLI with no UI beyond its card. Several at once.

## Correct means

- Every declared surface is **used**. An unused surface is noise and a maintenance cost.
- Every surface the function needs is **declared**. A missing one makes the capability invisible to the host and to agents.
- The set is justified by Prompt 1's answers, not by what other plugins do.

## Common wrong answers

- Declaring a CLI out of habit for a capability that is purely a memory contribution.
- Skipping `status` for a plugin whose state a user must be able to check at a glance.
- Declaring `tasks` when nothing needs to run unasked.
- Declaring `requires` to pull in a brick that is not actually needed.

## Check

```
node <skill>/scripts/record.mjs . --manifest
```

Reports each declared surface and whether a stated function supports it.

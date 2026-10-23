# Prompt 4 — Write the CLI as an agent interface

The CLI is used by two audiences: an operator at a terminal, and **an agent** that discovers the plugin, calls it, and parses the result. Write for both.

## The prompt

In `plugin.json`, for every operation:

- a **name** in lowercase kebab-case, unique
- a **description** of what it does
- an **effect**: `read`, `write`, `destructive` or `send`
- **typed arguments**, each with a label — `string`, `number`, `boolean`, `choice` with options. Mark positionals, mark requireds.
- a **secret argument** is marked `secret = true`, and its value travels over stdin, never `argv`. One per command, a string, no flag.
- `output: "json"` unless the result is genuinely prose
- `timeout_ms` for anything slow

In `cli.mjs`:

- `--json` emits structured output on **every** subcommand, including those that default to text
- a failure prints the real error to **stderr** and exits **non-zero**
- `--help` answers **without resolving credentials**, so it works before setup
- no secret value reaches `argv`, stdout, stderr or a log

## Correct means

An agent can:

1. run `total-recall plugin library --json` and see this plugin's operations, their arguments and their effects;
2. choose an operation without reading prose;
3. call `total-recall <id> <op> <args> --json`;
4. parse the JSON;
5. tell success from failure from the exit code.

## Common wrong answers

- `--json` that only some subcommands honour.
- Resolving a credential at the top of `run()` so `--help` fails without a key.
- Printing a success message on a failed HTTP call.
- Taking an API key as `--key <value>`, which puts it in `argv`, in shell history and in the process list.
- Declaring an effect of `read` for an operation that mutates.

## Check

```
node <skill>/scripts/record.mjs . --manifest
node <skill>/scripts/record.mjs . --secrets
```

Then run `--help` and one `--json` call by hand and read the real output.

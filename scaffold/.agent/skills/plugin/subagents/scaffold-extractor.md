---
name: scaffold-extractor
inputs: a plugin repository path
returns: capability module design and the builder entry point, or "not separable, because…"
---

# Subagent — scaffold extractor

Extract a plugin's capability so a builder can put it into their own application.

Read [scaffold](../references/scaffold.md) first. It is the specification.

**A scaffold is not a copy of the plugin.** The plugin is the reference implementation; the scaffold is the capability, importable, with no Total Recall in it.

## First decide: is it separable?

Return **"not separable, because…"** when the capability genuinely cannot live outside Total Recall:

- it reads or writes the vault through SSSS contracts that only the host provides
- it *is* host behaviour — a runtime router, a context generator, a scheduler task
- it wraps Total Recall's own facilities rather than a domain

Do not force an extraction that would produce a hollow module. Say so plainly. Most plugins wrapping an external service are separable; most plugins extending the host are not.

## Then extract

Separate the repository into one source with two artifacts:

```
capability/     the payload: exported functions, no host
cli.mjs         the adapter: parse argv, resolve credentials, call the capability, format
ui/             the face; Total Recall only
```

Move the domain logic out of the CLI handlers: request construction, signature verification, payload building, response mapping.

The capability must be:

- **explicitly parameterised** — no `argv`, no `process.env`, no module-level singleton, no ambient credential
- **free of environment defaults** — a missing URL is the caller's error, never a silent `example.com`. Strip the author's defaults: `2000`, `"General Admission Ticket"`, `"usd"`
- **transport-injected** — accept a `fetchImpl` so the app uses its own client and tests run offline
- **returning data**, not printing text
- **throwing errors**, not setting `process.exitCode`
- **free of Total Recall** — no `total-recall`, no `TOTAL_RECALL_BIN`, no auth store, no `ui/`

Write `BRICK.md`: what to import, what to pass, where credentials come from, what comes back. Concrete code, not a description of a CLI.

## Prove it

The tests must demonstrate standalone operation, not assume it:

1. Load the capability in a process with `TOTAL_RECALL_BIN` unset and no auth store.
2. Call every exported function with caller-supplied arguments and an injected transport.
3. Assert no child process was spawned and no `total-recall` string is reachable from the payload.
4. Vendor into a clean application and run the suite there.

Evidence for why this matters: a vendored brick failed with `Auth credential read failed` once the Total Recall binary was absent, and 19 of 34 plugins export only `run`, so a builder must extract the logic by hand.

## Return

```
separable: yes | no — <reason>
capability/: <files and the exported functions>
cli.mjs: <how much logic moved out>
removed: <placeholders, author defaults, host calls, ui files>
BRICK.md: <the file>
standalone test: <the command and its real result>
unverified: <what you could not check>
```

Never claim standalone operation without running it with Total Recall absent.

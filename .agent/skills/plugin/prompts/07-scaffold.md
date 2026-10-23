# Prompt 7 — Extract the scaffold, if another application wants the capability

Only when Prompt 1 answered yes. Full specification: [scaffold](../references/scaffold.md).

## The prompt

A **scaffold** is the capability extracted so a builder can put it into their own application. It is **not a copy of the plugin**. The plugin is the reference implementation.

Structure the repository as one source with two artifacts:

```
tr-plugin-<id>/
  capability/     ← the scaffold payload: exported functions, no host
    index.mjs
  cli.mjs         ← the Total Recall entry: parse argv, resolve credentials, call capability/
  ui/             ← the face; Total Recall only
  test/
```

Declare it:

```json
"capability": { "entry": "capability/index.mjs", "exports": ["…"] }
```

Move the domain logic — request construction, signature verification, payload building, response mapping — out of the CLI handler and into `capability/`. `cli.mjs` becomes a thin adapter.

The capability must be:

- **explicitly parameterised** — no `argv`, no `process.env`, no module-level singleton
- **free of environment defaults** — a missing `successUrl` is the caller's error, never a silent `example.com`
- **transport-injected**, so the app uses its own HTTP client and tests run offline
- **returning data**, not printing text
- **throwing errors**, not setting `process.exitCode`
- **free of Total Recall** — no `total-recall`, no `TOTAL_RECALL_BIN`, no auth store
- **free of UI** — no card, no `DESIGN.md`, no logo

Write `BRICK.md`: what to import, what to pass, where credentials come from, what comes back.

## Correct means

A builder can lay the capability into their application and use it **without rewriting it**, with no Total Recall present, every environment value supplied by them.

The test is not "does it run". It is **"can a builder use this as it stands?"** Evidence: 19 of 34 plugins currently export only `run`, so a builder must extract the logic by hand — exactly the work a scaffold exists to remove.

## Check

```
node <skill>/scripts/record.mjs . --scaffold
```

Asserts the capability loads with `TOTAL_RECALL_BIN` unset and no auth store, that no Total Recall string is reachable from it, that no placeholder value ships, and that its tests fail if it spawns a process.

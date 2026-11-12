# Developer invoke API

Remote clients use `POST /v1/invoke` with `{ "operation": "vault.hash", "params": {} }`.
`GET /v1/invoke/capabilities` and the `capabilities` operation list the operations the caller can run.
SSSS resource reads and `POST /api/v1/ssss` remain available.

A named PAT must carry an explicit invoke grant. A wildcard alone does not grant an invoke mode.
Every operation also checks its required scope against the key and its issuer chain.
The server checks authority again during execution. Revocation stops an active child.

| Operation | Required scope | Capability |
| --- | --- | --- |
| `capabilities` | None beyond the invoke grant | List allowed operations, targets and limits. |
| `cli.run` | `sandbox:run` | Run a registered core, plugin or composed CLI verb with literal arguments. |
| `ssss.read` | `ssss:read` | Search memory through the recall owner. |
| `ssss.write` | `ssss:write` | Write memory through the remember owner. |
| `composable.list` | `config:read` | List executable composed commands for the selected working directory. |
| `composable.run` | `sandbox:run` | Run a composed command that a built-in or active plugin does not shadow. |
| `decision.run` | `memory:read` | Submit typed questions through the installed decision owner. |
| `decision.predict` | `memory:read` | Predict a next action through the decision owner. |
| `context.preview` | `memory:read` | List context candidates, scores and token estimates. |
| `context.stream` | `memory:read` | Score and pack context through the parallel context owner. |
| `context.flash.health` | `memory:read` | Check the context provider. An unhealthy result remains explicit. |
| `brains.sync` | `memory:write` | Sync all projects in the server's project registry. Fail if a project reports errors. |
| `tasks.cleanup` | `tasks:write` | Delete completed task files from the selected brain's queue. |
| `tasks.failed` | `tasks:read` | List failed task envelopes from the selected brain's queue. |
| `vault.hash` | `memory:read` | Read the selected brain's compiled vault hash. Return null if no hash exists. |

Full mode requires `invoke:full`. It grants host execution under the required operation scopes.
`target` selects an absolute working directory. Core, plugin and composed commands come from the live command inventory in that directory.
`cli.run` uses `verb` and a string array `args`. It exposes every command in that inventory; this list can change when plugins or composed commands change.

Restricted mode requires `invoke:restricted`. It supports `capabilities`, confined `ssss.read` and fact-only `ssss.write`.
It also requires `brain:server` or an available registered project grant.
It denies the other operations even when the key has a wildcard scope.
Restricted execution has no provider spending authority.

The seven operations added for REMOTE-01 run in bounded full-mode children.
They share invoke's timeout, output and concurrency limits.
Their parameters accept `timeoutMs` and `target`.
Except for `brains.sync` and `context.flash.health`, they also accept `brainId`: `server`, `global` (the serving brain), or `project:<name-or-UUID>` from the server registry.
An unavailable project fails. It never falls back to the serving brain.
`context.stream` requires `query`. It accepts `budget_tokens` (1–65536), `concurrency` (1–4), and `min_score` (0–100).
Provider credentials resolve through the existing Auth owner. Owner diagnostics are not returned.

These routes were replaced by the seven named operations:

| Removed route | Invoke operation |
| --- | --- |
| `GET /api/context/preview` | `context.preview` |
| `POST /api/context/stream` | `context.stream` |
| `GET /api/context/flash/health` | `context.flash.health` |
| `POST /api/brains/sync` | `brains.sync` |
| `DELETE /api/tasks/cleanup` | `tasks.cleanup` |
| `GET /api/tasks/failed` | `tasks.failed` |
| `GET /api/vault/hash` | `vault.hash` |

The dashboard's context, task, vault status and compile routes remain.
`GET /api/vault/status` includes `rule_length.rejections`, a counter for rejected rule writes in that server process.
The counter contains no rule text and resets when the process exits.
All shared validated writers warn above 300 characters and reject above 800 characters.
The explicit `context:policy` tag and the trusted writer option behind `remember --allow-long` retain their exceptions.

References checked for this change: [Express routing](https://expressjs.com/en/guide/routing/), [Node child processes](https://nodejs.org/api/child_process.html), and [content generation API](https://ai.google.dev/api/generate-content).

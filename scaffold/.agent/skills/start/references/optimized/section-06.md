## Rules

- Do not fix warnings during /start unless the user asks; list them. A warning
  that blocks the work the user asked for gets fixed as part of that work.
- Data freshness: say when something the brief reports is old (for example
  openwiki last updated months ago, surfaces not compiled recently).
- Everything here goes through the Total Recall CLI. If a step is repeated in
  every session, update the builtin `src/cli/brief.mjs` through the owning repository project plan. `brief` is a builtin, so `command update brief` cannot replace its implementation.

---
type: ui-chunk:chunk
title: Budget and key caps
description: Compare daily and weekly metered spend with the budget caps, list cap breaches, and review OpenRouter per-key limits, remaining credit and keys missing from the store.
timestamp: "2026-11-16T00:00:00Z"
plugin: auth
panel: home
id: budget-key-caps
intents: [check daily spend against cap, check weekly spend against cap, review openrouter key limits, find openrouter keys not in store]
surfaces: [page]
operations: [secret]
data: ["secret:/daily/cost_usd", "secret:/weekly/cost_usd", "secret:/budget/daily_cap_usd", "secret:/budget/weekly_cap_usd", "secret:/breaches", "secret:/keys"]
---

<section>
  <h2>Budget and key caps</h2>
  <dl>
    <dt><code>total-recall auth secret budget-check --json</code></dt>
    <dd>Read daily and weekly spend, the caps from config/budget.yml, and every global or per-key cap breach.</dd>
    <dt><code>total-recall auth secret provider-keys openrouter --json</code></dt>
    <dd>Read each OpenRouter key's limit, reset period, remaining credit, usage and the stored credential that holds it.</dd>
  </dl>
  <p>A key marked Not in store exists at OpenRouter but no stored credential holds it. Revoke it or disable it from the terminal after checking where it is used.</p>
</section>

# Prompt 5 — Declare credentials and settings

There is exactly **one** credential path in the whole system, and it belongs to the auth plugin.

## The prompt

**Credentials.** Every key the plugin reads goes in `secrets[]`:

```json
"secrets": [ { "key": "SERVICE_API_KEY", "description": "Reads and creates charges", "required": true } ]
```

Resolve it only through `total-recall auth secret`. The plugin has no store of its own, reads no ambient environment variable as a fallback, and accepts no key on `argv`.

**Settings.** Every setting goes in `configuration.fields` with its type and default. Field keys are camelCase and may not contain `password`, `secret`, `apiKey` or `token` — those belong in `secrets`.

**The card** reports a credential as *present* or *missing*. It never renders a value, and never renders an input that accepts one. To set a key, the card hands over the command:

```
total-recall auth secret set SERVICE_API_KEY --stdin
```

## Correct means

- Exactly one credential path exists, and it is auth.
- The card has no code path that can receive a key value, so it cannot leak one.
- A setting a user must change is declared, so it is visible rather than buried in code.

## Why the card must not collect keys

The rule is not bureaucracy: one store means one rotation path and one audit trail. A per-plugin key screen violates it even when it writes to the same store, because it makes the plugin the place an operator thinks of when a key must change. It also creates a receive path for the secret inside plugin code, which is a leak surface that would otherwise not exist.

Evidence: a scaffolded panel rendered `<input type="password">` and dispatched the raw value to the host; a real card built three such screens.

## Check

```
node <skill>/scripts/record.mjs . --secrets
```

Fails if a secret is reachable in `argv`, in stdout, in a log, or in the rendered card.

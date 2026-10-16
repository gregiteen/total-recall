## Mutation Contract

Agent-generated mutations flow through the Operation Contract:

```text
validate envelope
  -> verify safe workspace/idempotency/actor identifiers
  -> resolve and contain the target path
  -> replay or reject the idempotency key + request hash
  -> authorize with verified actor identity (fail closed)
  -> validate any active lease (fail closed)
  -> validate universal + primitive-specific content
  -> commit atomically
  -> append the audit event
```

The mutation envelopes are:

- `operation` — create or fully replace a replace-type document.
- `patch` — merge an existing replace-type document without changing `type`.
- `event` — append an immutable event record.
- `delete` — remove a replace-type document and emit an audit event; reject
  append-type targets.

Use `dry_run: true` for model-generated preflight. Idempotency is scoped by the
effective request, not the key alone: the same request replays, while the same
workspace/key with a different request hash is a conflict.


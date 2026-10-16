## REST API

- Auth is **PAT-based**: `total-recall generate-pat --name <n> [--scope …] [--expires 30d]`
  or `total-recall key create|list|revoke <id>|rotate <id>`. Only the SHA-256
  hash is stored (`<global brain>/config/keys.jsonl`); clients keep the token
  in `config/brain.json` (0600).
- **A PAT is never printed.** `connect` shows a prefix only (`maskToken`).
  A token that reached a transcript or log is burned: find it by hashing the
  token and matching `token_hash` in keys.jsonl on every host, `key revoke` it,
  and write the replacement straight into brain.json without printing it.
- Every route requires auth plus an explicit scope: `config:read` for reads,
  `config:write` for anything mutating.

> **Mount auth with a path prefix, never pathless.**
> ```js
> router.use('/api/embeddings', requireAuth);   // correct
> router.use(requireAuth);                      // WRONG
> ```
> A pathless `router.use(requireAuth)` in a sub-router mounted at the app root
> runs on **every** request path — it 401-gates the static frontend, favicon,
> and the login page itself, producing an auth catch-22 where nobody can log in
> to fix it.

- Routes that mutate `process.env` change **global process state** — it affects
  every concurrent request, is not persisted, and is lost on restart. Acceptable
  only for operator-scoped, `config:write`-gated toggles. Prefer persisted config.
- Validate operator input against a **server-reported allowlist** before storing
  it. Never store an arbitrary string that later becomes a request target.

---


---
name: security
description: >-
  Use this skill when auditing Total Recall for security issues, handling
  secrets, adding REST routes, touching the credential-rotation subsystem,
  driving the automation browser, or changing anything that leaves the host
  (embeddings, mesh discovery, outbound fetch). Trigger on: 'security audit',
  'secrets', 'rotation', 'SSRF', 'auth', 'scopes', 'leak', 'exfiltration',
  'before publish'. MANDATORY: read this file fully before executing.
repo_scoped: true
---

## Total Recall — Security Architecture

Total Recall is not a typical app. It is a **credential store, an authenticated
browser, and a full-text memory of its operator's working life**, running on a
private mesh. The blast radius of a bug here is the operator's entire digital
identity — not one product's user table.

Rank findings by that reality, not by CVSS instinct.

### The three crown jewels

| Asset | Location | Why it matters |
| --- | --- | --- |
| `secrets.enc` | `<brain>/config/secrets.enc` (a bare `.agent` dir uses `.agent/secrets.enc`) | AES-256-GCM. Every provider key the operator owns. |
| Browser profile | `<brainDir>/browser-profile/` | **Live, logged-in provider sessions.** Bypasses the API keys entirely — a stolen profile is a stolen Stripe/GitHub/cloud console. |
| Memory vault | `<brainDir>/memory-vault/` | Plaintext markdown. Business context, infrastructure, personal history. |

The browser profile is the **highest-value target in the repo** and the one
people forget. It is not a cache. Treat it as credential material.

---

## Secrets

- Encrypted at rest in `<brain>/config/secrets.enc` (AES-256-GCM), unlocked by
  the master password. `secretsPassword()` resolves it in this order:
  1. `TR_SECRETS_PASSWORD` / `TR_MASTER_PASSWORD` in the environment (a
     LaunchAgent plist injects it for launchd jobs);
  2. macOS only: the Keychain entry `total-recall-secrets` that `secret rekey`
     maintains (`TR_SECRETS_NO_KEYCHAIN=1` turns this off). An ssh/mesh session
     cannot read a locked login Keychain;
  3. the host env file `TR_ENV_FILE`, default `~/.agent/tr.env` — the file
     `auto-pull.sh` sources and `secret rekey --env-file` rotates. Honoured only
     if it is a regular file (not a symlink), mode 0600, owned by this user, in a
     directory this user owns that nobody else can write. Keep `~/.agent` at 0700.
  Without any of them every command fails with "Secrets file is not valid JSON"
  and mesh falls back to local discovery.
- **Do not export the password from a shell profile.** Every process started
  from that shell inherits it. The env-file fallback makes the export
  unnecessary; remove any `. ~/.agent/tr.env` line from `.bashrc`/`.profile`.
- The vitest suite sets `TR_SECRETS_NO_KEYCHAIN=1` and a nonexistent
  `TR_ENV_FILE` (vitest.config.ts), so no-password specs never read a
  machine's real password. Keep it that way.
- **Never** hardcode keys in `.env` or source. Resolve through the secrets
  store (`getSecret` / `loadSecrets`).
- **Never** print a secret value. Not to a log, not to stdout, not into an
  error message, not into a test snapshot.
- **Never** pass a secret as a shell argument. `argv` is world-readable via
  `ps`, and it lands in shell history and in the agent transcript. Do the work
  inside a Node process and keep the value in memory.

> **Real incident (2026-08-12):** a redaction regex covered only `sbp_` and
> `eyJ` prefixes while dumping a config file. It printed a live Stripe
> `sk_live_`, a GitHub PAT, and an OpenRouter key into the transcript in
> plaintext. **Lesson: never redact-on-output. Never route the value through a
> surface that needs redacting in the first place.**

---

## Credential rotation subsystem

`src/core/rotation-capability.mjs`, `provider-rotation-recipes.mjs`,
`browser-session.mjs`, `secrets-rotate.mjs`.

Every key resolves to exactly one rotation class:

| Class | Meaning |
| --- | --- |
| `self_generated` | TR mints the new value itself. No provider, no human. |
| `provider_api` | Provider exposes a rotation API. |
| `provider_browser` | Requires the console. TR drives or supervises a browser. |
| `manual` | Key material, recovery codes, OAuth secrets — human only, with a stated reason. |
| `non_secret` | Internal bookkeeping. Never rotated. |

### Invariants — do not relax these

1. **Only `verified: true` recipes may auto-click.** An unverified recipe
   opens the console and instructs the human. Blind-clicking guessed selectors
   on a live payments dashboard is how you refund a stranger or delete a
   production key. Enforced by a spec — keep it that way.
2. **Order is: capture → shape-check → API-verify → store+export → only then
   revoke the old key.** Revoking before the new value is proven working is a
   self-inflicted outage.
3. **Shape-check before storing.** A captured "Copy to clipboard" string that
   overwrites a working credential is worse than a failed rotation.
4. **High-risk providers are flagged** (`high_risk: true`, e.g. Stripe) and
   roll with an expiry window rather than instant invalidation.

### Provider attribution is a security control

`providerForKeyName()` decides *which console a rotation prompt points at*.

> **Real bug:** the pattern `TR_TOKEN` reduced to the 2-char stem `TR`, which
> matched as a bare substring inside `S-TR-IPE_SECRET_KEY`. A live payments key
> was attributed to `total-recall`. Fixed with token-boundary matching and
> `MIN_FUZZY_STEM = 4`. **A mis-attributed key sends the operator to the wrong
> console to rotate a credential that is still live.** Regression test exists —
> do not delete it.

### Browser profile handling

- Created `0700`, README `0600`. Verify on any change to `browser-session.mjs`.
- Never commit it, never sync it, never include it in a bundle or export.
- `secret browser-logout` / `clearProfile()` must actually remove it.
- Persistent-profile mode is a deliberate choice: it keeps provider sessions
  out of the transcript and out of env vars. That tradeoff only holds while the
  directory permissions hold.

---

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

## Egress: what leaves this host

This is TR's most under-audited surface. The vault is plaintext and the
embedding path ships it off-box.

- **Embedding content is vault content.** Whatever endpoint serves embeddings
  receives the operator's memory in cleartext. Endpoint selection is therefore
  a confidentiality decision, not a performance one.
- **Discovery trusts any mesh peer that answers.** `resolveOllamaEndpoint()`
  probes online peers on the Ollama port and uses the first responder. A hostile
  device admitted to the tailnet could impersonate that service and harvest
  vault text. Mitigations: explicit config wins over discovery (already ordered
  that way), and **headscale membership is the real trust boundary** — audit
  `/api/v1/node` for nodes you do not recognise.
- **Prefer local/mesh embeddings over hosted.** It is both cheaper and
  strictly better for confidentiality: nothing leaves the operator's network.
- **URL construction from env** (`TR_OLLAMA_URL`, `OLLAMA_HOST`) is
  operator-controlled and therefore trusted — but it must never become
  request-controlled. If a route ever accepts a URL, add a private-network
  blocklist first (localhost, 10/8, 172.16/12, 192.168/16, 169.254/16 metadata,
  `file://`).
- Outbound fetch is governed by the throttled-fetch network policy. Local mesh
  calls deliberately bypass throttling — that exemption must stay scoped to
  local infrastructure, never widened to arbitrary hosts.

---

## Mesh / headscale

- Self-hosted headscale is the control plane. Node registration = trust grant.
- Audit registered nodes periodically; a stale or unrecognised node has mesh
  reach to every service bound on the tailnet.
- Services bound to a mesh IP are **not** private by default — they are exposed
  to every node on the tailnet.
- Never hardcode a hostname, mesh IP, or personal machine name in product code.
  Bind to live discovery plus vault entity fields. Hardcoding leaks one
  operator's topology into every install.

### ACL policy (`total-recall mesh policy`)

- **Networking is not authorisation.** A control server with no policy still
  routes packets, but every host falls back to its own sshd and per-machine
  `authorized_keys`. The policy is what lets the control server authorise SSH.
- Policy management over the API **requires `policy.mode: database`** on the
  control server. In `file` mode the policy lives on the server's disk and the
  API cannot manage it — the client raises `POLICY_MODE_FILE` with the fix.
- A control server in database mode with an empty policy table answers **500,
  not 404**, on read. That is the expected first-run state, so
  `getHeadscalePolicy()` normalises it to `{configured: false, unset: true}`.
  Treating it as an error makes bootstrapping a first policy impossible.
- `mesh policy init-ssh` generates the **single-operator** shape: every member
  reaches every member. Mesh membership is the trust boundary, so any node
  admitted inherits it. Narrow `src`/`dst` before admitting a node you do not
  control. root is excluded by default (`autogroup:nonroot`) so mesh SSH keeps
  a per-user audit trail.

### Tailscale SSH platform limits (verified 2026-08-14)

Enabling the policy is necessary but **not sufficient** — the destination node
must also run an SSH-capable Tailscale build:

- **Linux**: supported.
- **macOS**: only the open-source `tailscale`/`tailscaled` CLI build (Homebrew
  formula) can act as an SSH *server*. The GUI App Store and standalone builds
  cannot — they are sandboxed. Any Mac with `/Applications/Tailscale.app` and
  no `tailscaled` binary will never accept Tailscale SSH, whatever the policy
  says, and must use ordinary key auth.
- Client-side connections work from any platform.

So on a Mac-to-Mac pair running the GUI build, `authorized_keys` remains the
only path. Do not chase policy configuration to fix that.

---

## Audit commands

```bash
npm audit --omit=dev
```

```bash
git grep -nIE "(sk-or-v1-[a-f0-9]{20}|sk_live_[A-Za-z0-9]{20}|ghp_[A-Za-z0-9]{30}|sbp_[a-f0-9]{30}|dop_v1_[a-f0-9]{30}|AIza[A-Za-z0-9_-]{30}|npm_[A-Za-z0-9]{30})"
```

```bash
git ls-files | grep -iE "^\.env$|\.env\.|secrets\.enc|\.pem$|id_rsa|id_ed25519"
```

```bash
npx total-recall secret rotation-status
```

Check for pathless auth mounts before shipping a route:

```bash
grep -rn "router.use(requireAuth)" src/server/routes/
```

---

## Pre-publish checklist

1. `npm audit --omit=dev` → 0 vulnerabilities.
2. Secret-pattern grep over tracked files → no matches.
3. No `.env`, `secrets.enc`, key material, or `browser-profile/` tracked or in
   the `files` whitelist.
4. Every new route: auth + explicit scope, mounted **with a path prefix**.
5. No secret values in logs, errors, tests, or fixtures.
6. Unverified rotation recipes still have no `create()`.
7. Full test suite green (run it on the mesh test host, not the production box).
8. Server boots natively before tagging a release — on the test host, with an
   isolated home so the host's running brain does not win the PID lock (the
   new server otherwise logs "already running" to its log file and exits
   silently after the banner):
   `H=$(mktemp -d); HOME=$H TR_SECRETS_NO_KEYCHAIN=1 node bin/total-recall.mjs start --port 3977`
   then `curl -s 127.0.0.1:3977/health` must report the new version.

---

## Known gaps

| Gap | Risk | Note |
| --- | --- | --- |
| Repo skills are not in the npm package | `.agent/skills/` is tracked in git (fixed; it used to be ignored) but only `scaffold/` ships in the `files` whitelist | Installs get the scaffold copies; this repo's skills reach other machines through git |
| Vault stored in plaintext | Disk-level compromise reads everything | Encryption at rest is `secrets.enc` only |
| Mesh discovery trusts first responder | Vault text to a hostile peer | Set an explicit endpoint to bypass discovery |
| No egress allowlist on embeddings | Misconfigured host silently exfiltrates | Prefer local/mesh |
| Stale credentials retained | Unused live keys are pure attack surface | Audit for providers no longer in use and revoke |

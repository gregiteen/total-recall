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


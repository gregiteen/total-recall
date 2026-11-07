# Auth plugin

Noninteractive agents use the existing host password carriers in this order: process environment, macOS Keychain, the private TR environment file, then the private `com.totalrecall.brain` LaunchAgent. The LaunchAgent must be an owned regular file at mode 0600 in an owned directory without group/other write permission. `TR_SECRETS_LAUNCH_AGENT` selects an explicit carrier; `TR_SECRETS_NO_HOST_CARRIER=1` disables it. Auth captures the password internally and never copies it into argv, logs or another machine. Missing carriers and decryption failures remain errors.

Auth owns encrypted provider credentials, dashboard and collaboration passwords, purpose-bound session signing, passkey storage, and scoped API-key lifecycle. Core adapters require its manifest exports and have no credential implementation fallback.

## Operations

- `total-recall auth status --json`: local configuration inventory; does not certify provider availability.
- `total-recall auth password set --stdin`: commits the dashboard bcrypt hash and a new signing key to encrypted auth storage; invalidates prior dashboard sessions.
- `total-recall auth rotate [--collaboration] --json`: explicitly rotates the selected signing key.
- `total-recall auth secret --help`: credential inventory, verified setup, rekey and deployment projections.
- `total-recall auth passkey list --json`: registered public credential inventory.
- `total-recall auth probe --json`: actual endpoint response statuses, not a security certification.


Dashboard/step-up/collaboration tokens use HS256 with issuer, purpose-specific audience, bounded expiry and independent collaboration key. Keys remain inside auth. Password mutation does not write security.yml. API keys persist only token hashes; passkey storage contains public authenticator material, not private keys.

Before uninstall, auth verifies and preserves encrypted ciphertext outside the brain. Locked, corrupt, plaintext, conflicting or unmigrated legacy credentials abort teardown. No live credential migration is performed by source changes.

The card displays requested results only. The panel performs browser credential creation plus server verification before reporting registration success. Hardware attestation, provider availability and rotation schedules are never fabricated.

Integration and whole-ecosystem migration remain in progress. Fixture tests do not prove a physical passkey, OAuth provider login or fleet deployment.

## Install in Total Recall

Install the source through `total-recall plugin install ./tr-plugin-auth`. Use `total-recall auth --help` to discover the supported command groups. Auth uses the Total Recall host's native state and request contracts. The manifest does not declare a standalone application brick.

Current integration work and its evidence are tracked in the [Auth project tracker](docs/projects/in-progress/AUTH_CARD/AUTH_CARD_PROJECT_TRACKER.md).

### Google connections and scoped access keys

Google OAuth credentials use the host Auth store. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a registered `GOOGLE_REDIRECT_URI` ending in `/auth/google/callback`, and a non-empty `GOOGLE_ALLOWED_EMAILS` dashboard allowlist through `auth secret set --stdin`. The CLI opens the server initiation endpoint so the browser receives an HttpOnly state cookie. Callbacks require browser-bound one-use state, PKCE and a verified identity on the current allowlist. Discovery reports local configuration only. A signed dashboard session is required for dashboard password changes.

`auth google accounts --json` returns secret-free connection metadata. `auth google refresh <subject> --json` refreshes expired access while preserving an existing refresh token when Google omits it; revoked grants require reconnection. `auth google disconnect <subject> --json` confirms provider revocation before dropping credentials. Transient failures retain the connection. OAuth API tokens and signed dashboard sessions have separate lifetimes; refreshing Google access does not extend the dashboard login session.

`auth key issue <name> --scopes memory:read --role reader --kind api_key --expires <ISO-date> --json` issues a token once. `auth key list`, `revoke <id>`, `usage <id>`, `roles`, and `role-set <name> --scopes <csv>` manage its lifecycle. Empty permissions grant nothing; malformed scopes fail explicitly. Role policies bound scopes on every request. HTTP issuance cannot exceed its issuer's permissions or expiry, and only administrators can edit role policies. Metadata retains hashes, prefixes and usage; raw tokens never enter canonical SSSS records. The `pat` and `api_key` kinds share the Bearer authentication protocol for this application's API; they do not manufacture third-party provider keys.

Google lifecycle metadata, role policies, key registries and request audit ledgers use the native host SSSS state contract. Ciphertext remains in the auth-owned opaque resource adapter. This source requires the updated native host contract; older published hosts need an explicit compatible update. Fixture tests do not certify live Google consent or deployed CRM consumer adapters.

Native-only state: new installations use validated SSSS records and the shared auth owner. Legacy imports and compatibility fallback formats are not supported.

### Host credential-store binding

Runtime consumers that need the host's credential authority use the declared
`host-secrets-store` module and its `hostSecretsBrainDir()` export. The auth CLI
uses the same selector. A caller's project `AGENT_DIR`, `TR_BRAIN` or working
directory never selects a second store. `TR_SECRETS_BRAIN` is the operational
override; `_TR_TEST_BRAIN_DIR` and `_TR_TEST_AGENT_DIR` preserve disposable test
isolation. Resolving this path performs no credential read or initialization.
Explicit low-level store APIs retain their existing selected-store semantics.

## Changing `gh` scopes

`gh` signs in from `github_token` on every machine that receives it, so a rotated token lands everywhere. A login changed on the machine itself stays, and the sync reports it once.

- One machine: `gh auth refresh -h github.com -s <scope>`. Remove it with `--remove-scopes <scope>`, and the next sync returns `gh` to the store's token.
- Every machine: refresh on one, then `total-recall auth secret gh-login adopt`. It shows the scope change and writes nothing until `--yes`. `--revoke-old` also ends the previous token at GitHub.
- Compare or go back: `total-recall auth secret gh-login status` and `use-store`.

## Using this from an agent

Send anything involving a credential here: reading, storing or rotating a secret, issuing API keys, passkeys, passwords and sign-in sessions. There is one store per machine, so search it before asking anyone for a key, and never print a value.

```bash
total-recall auth secret list --json
total-recall auth secret get <KEY>
total-recall auth secret set <KEY> --stdin
total-recall auth secret rotate-auto <KEY>
total-recall auth secret revoke <KEY> --yes
```

`revoke` ends a key at its provider using the key itself, where the provider's catalog entry declares how. It removes the store entry only once the provider rejects the key, and refuses a value another store key shares. Without `--yes` it reports the plan and sends nothing.

Raw command this plugin owns: `security find-generic-password`.

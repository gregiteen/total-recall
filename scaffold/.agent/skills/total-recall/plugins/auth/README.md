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

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor ./tr-plugin-auth 
```

This copies the plugin's source, skills, tests and docs into `bricks/auth` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install ./tr-plugin-auth` and run `total-recall auth`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.
### Google connections and scoped access keys

Google OAuth credentials use the selected auth brain's encrypted store. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a registered `GOOGLE_REDIRECT_URI` ending in `/auth/google/callback`, and `GOOGLE_ALLOWED_EMAILS` (comma-separated dashboard account allowlist) through `auth secret set --stdin`. The CLI's connection link opens the server initiation endpoint so the browser receives an HttpOnly state cookie. Callbacks require browser-bound one-use state, PKCE and a verified authorized identity; failed profile lookup never creates a placeholder session.

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

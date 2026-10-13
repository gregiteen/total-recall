# Auth plugin

Auth owns encrypted provider credentials, dashboard and collaboration passwords, purpose-bound session signing, passkey storage, and scoped API-key lifecycle. Core adapters require its manifest exports and have no credential implementation fallback.

## Operations

- `total-recall auth status --json`: local configuration inventory; does not certify provider availability.
- `total-recall auth password set --stdin`: commits the dashboard bcrypt hash and a new signing key to encrypted auth storage; invalidates prior dashboard sessions.
- `total-recall auth rotate [--collaboration] --json`: explicitly rotates the selected signing key.
- `total-recall auth migrate-credentials --legacy-brain <path> [--remove-legacy]`: explicitly imports validated legacy password/signing credentials, verifies the encrypted commit, then optionally removes source credential fields/files. Conflicts preserve existing values and fail.
- `total-recall auth secret --help`: credential inventory, verified setup, rekey and deployment projections.
- `total-recall auth passkey list --json`: registered public credential inventory.
- `total-recall auth probe --json`: actual endpoint response statuses, not a security certification.

Select the auth store through `TR_SECRETS_BRAIN` or the configured brain. Runtime reads reject plaintext stores, missing signing keys and decryption failures. Legacy plaintext encryption is an explicit owner migration operation; core never silently migrates another brain at startup.

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

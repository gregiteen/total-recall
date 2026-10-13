# CRM

CRM lives in its own plugin repository. Start with `total-recall crm status` to identify the selected instance, then `total-recall crm menu` for the authenticated command catalog. Use `crm client <command>` for catalog operations. Read the plugin's own `skills/crm/SKILL.md` and README for complete setup and command semantics; do not invent endpoints, permissions or business records.

Each instance has its own client identity and canonical business vault. Client onboarding uses `crm client login --code <single-use-setup-code>`. Provider and operator secrets belong to auth; exported CRM data must exclude them. Never substitute another instance's credentials or an ambient project brain. Preserve parent company, brand/alias, location and buyer as separate entities. Store verified research as notes with source and observation date. External messages and signatures require user authorization.

Inspect `crm settings` before `settings set --data JSON`; configured host branding overrides saved instance settings. Any runtime restart/deployment follows the owning service's zero-downtime procedure.

For portability, inspect `crm vault status`, then `vault export /absolute/file.json`. Import into a new absolute destination with `vault import FILE --destination DIR`; review the dry run before `--commit`. Never merge into an existing directory. Supported export contains canonical business Markdown and attachments, excluding provider/auth credentials, private client state, caches, event/idempotency history and personal TR brains. Reinitialize authentication and provider connections; schedules remain disabled until explicitly configured and verified.

CRM credential routing now requires an explicit absolute selected auth brain and CRM instance. User/operator secrets use structured auth get, stdin writes, exact readback and verified deletion; ambient CRM_API_KEY/DABBER_API_KEY, automatic privileged key issuance, production isolated-memory storage and stale-cache success are removed.

Local integration settings now route credential fields through instance-scoped CONFIG_<FIELD> auth refs. The settings file and CRM peer sync carry no credential values. Corrupt/nested settings and normal reads of legacy plaintext credentials fail explicitly. Run `total-recall crm credentials migrate-local` only for explicit local_config migration: preflight conflicts, verify every readback, retain original source on errors, refuse cleanup if the source changes, then atomically replace the file. This does not migrate OAuth token files, CLI credential files or vault session/password records.

Session signing/shared password reads require configured auth values; normal startup generates nothing. Explicit `crm init` asks auth to provision its signing credential and validates readback without printing it. OAuth client ID/secret reads/writes use auth-backed settings; no OAuth client file or legacy-token client fallback. The integration summary reports Google linkage unchecked until its owning flow verifies it, never from file existence.

Verification: 31 isolated Python tests and one Node→Python→auth-port CLI migration test passed on the sanctioned mini, actual exit 0. OAuth client tests execute the actual function definitions without importing the whole Google/runtime stack. Full CRM runtime, OAuth token/session/client migration and native/provider acceptance remain required; no release or deployment certification.

The CRM remote-check transfer now uses an explicit tracked/new-source allowlist, excluding vault/private/credential files and symlinks. The final Node suite passes both CLI migration and archive sentinel tests (2 tests, exit 0); all 19 selected source files match the mini snapshot. This does not certify the whole remote-check pipeline or whole CRM runtime.

Generated CRM API transport now uses auth_headers exclusively, ignores ambient CRM/DABBER API keys, and never starts a local daemon. Its two actual-function boundary tests are included in the 31-test result.

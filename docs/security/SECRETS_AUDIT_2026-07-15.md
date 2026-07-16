# Secrets Audit Report - 2026-07-15

This audit report summarizes the live credential files and vulnerabilities found across the 17 tracked repositories in the workspace. The goal is to move all of these credentials into the centralized, encrypted Total Recall `secrets.enc` keychain.

## Findings

- **moogie_crm**: Found a raw SSH key inside `.env`. This must be extracted immediately into a secure vault or the Total Recall keychain.
- **Stripe Live Keys**: Found Stripe live mode keys (`sk_live_...`) scattered across 4 different repositories (`festech`, `moogie_crm`, `billing_service`, and `portal`). These should be centralized and properly rotated.
- **festech**: Found git-committed secrets in the repository history. These secrets are compromised and must be fully rotated on the vendor's side immediately.
- **Plaintext Secret Docs**: Found `.developer_secrets.local.md` and `SECRETS.md` containing plaintext production secrets in developer documentation. These must be removed and `.gitignore` updated.

## Action Plan
1. Centralize all keys into the Total Recall `secrets.enc` using `npx total-recall config --set-secret`.
2. Add all local environment and secret files to `.gitignore` across all 17 repos.
3. Remove the SSH key from `moogie_crm`.
4. Rotate the Stripe live keys.
5. Rotate the compromised keys in `festech`.

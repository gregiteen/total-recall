---
name: auth
description: "Encrypted credentials, repository bindings, dashboard sign-in and access across brains and machines."
version: 1.3.2
repo_scoped: false
---

# Auth & Secrets

Encrypted credentials, repository bindings, dashboard sign-in and access across brains and machines.

## When to Use

Use the `auth` Total Recall plugin (`total-recall auth`) instead of ad-hoc scripts or raw commands whenever working on auth & secrets tasks.

## Commands

```bash
total-recall auth --help
total-recall auth status  # Display auth system status and active providers
total-recall auth audit  # Audit permissions, session secrets, and credential integrity
total-recall auth rotate  # Generate and securely rotate SESSION_SECRET in store
total-recall auth passkey  # Manage FIDO2 WebAuthn passkeys
total-recall auth google  # Google OAuth status, connect, accounts, refresh and verified disconnect
total-recall auth probe  # Run HTTP 200 health verification probe
total-recall auth session  # Inspect active session tokens
total-recall auth agent  # Sign in an agent CLI that authenticates on its own terminal
total-recall auth secret  # Manage and inspect auth secrets in the Total Recall store
total-recall auth password  # Set dashboard password through encrypted auth store: set --stdin [--force-reset]
total-recall auth key  # Issue, list, revoke and audit scoped tokens; inspect and update role policy
```

## Owned Raw Commands

This plugin owns: `security\s+find-generic-password\b`.

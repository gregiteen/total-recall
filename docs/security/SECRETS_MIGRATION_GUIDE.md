# Secrets Migration Guide

This guide details the standard procedure for developers migrating plaintext environment variables and secret files into the encrypted Total Recall `secrets.enc` keychain.

## Why Migrate?
- To eliminate plaintext credentials resting on the filesystem or accidentally getting committed to version control.
- To enforce rotation schedules and centralized audit logging of API access.

## Migration Steps

1. **Locate Plaintext Secrets**
   Find all `.env`, `.env.local`, `.developer_secrets.local.md`, and any files ending in `.pem`, `.key`, or `.cert`.

2. **Add to Total Recall**
   Run the following command for each secret you find, replacing the category and values:
   ```bash
   npx total-recall config --set-secret [provider_name] [key_value]
   ```
   Example:
   ```bash
   npx total-recall config --set-secret stripe sk_live_...
   ```
   This will immediately encrypt and store the key in `secrets.enc` if `TR_SECRETS_PASSWORD` is configured.

3. **Verify Encryption**
   Run the following command to verify the file is no longer readable as plaintext JSON:
   ```bash
   cat .agent/skills/total-recall/config/secrets.enc
   ```
   It should display binary gibberish or encrypted ciphertext, not valid JSON.

4. **Delete Plaintext Artifacts**
   Once safely imported into the keychain, permanently delete the old `.env` files from your local disk.

5. **Rotation for Compromised Keys**
   If a key was ever committed to git (even if removed in a later commit):
   - Consider the key permanently compromised.
   - Go to the vendor's dashboard immediately and revoke the key.
   - Generate a new key and run `npx total-recall config --set-secret` to store it securely.

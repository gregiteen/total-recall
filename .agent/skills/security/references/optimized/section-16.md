## Known gaps

| Gap | Risk | Note |
| --- | --- | --- |
| Repo skills are not in the npm package | `.agent/skills/` is tracked in git (fixed; it used to be ignored) but only `scaffold/` ships in the `files` whitelist | Installs get the scaffold copies; this repo's skills reach other machines through git |
| Vault stored in plaintext | Disk-level compromise reads everything | Encryption at rest is `secrets.enc` only |
| Mesh discovery trusts first responder | Vault text to a hostile peer | Set an explicit endpoint to bypass discovery |
| No egress allowlist on embeddings | Misconfigured host silently exfiltrates | Prefer local/mesh |
| Stale credentials retained | Unused live keys are pure attack surface | Audit for providers no longer in use and revoke |

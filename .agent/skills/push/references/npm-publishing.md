# npm Publishing & Distribution Reference Guide

## 1. Directory Inclusion and Exclusions
The published package contents are explicitly restricted via the `files` array inside `package.json`. Only the following folders/files are packaged:
- `bin/` - CLI executable entrypoints
- `src/` - Core runtime logic
- `templates/` - Prompt templates
- `scaffold/` - Initial install files
- `docs/ARCHITECTURE.md`, `docs/IDE_INTEGRATION.md`
- `README.md`, `LICENSE`, `package.json`

All test files (`*.spec.mjs`, `*.test.mjs`) are ignored.

## 2. Dynamic Dry-Run Verification
Before executing the live `npm publish` command, you can perform a dry-run to inspect the package structure and verify exactly which files will be published:
```bash
npm publish --dry-run
```

## 3. npm Two-Factor Authentication (2FA)
If the publishing account is configured with 2FA, the live terminal will prompt for a one-time passcode. Always ensure you have access to your authenticator app during release.

# Secrets Consolidation PRD

## Problem Statement
The frontend interface splits secrets management across multiple redundant pages ("Keys & Usage", "Secrets Sync") and contains unused legacy files (`VaultPage.tsx`, `ModelsPage.tsx`, `ApiKeysPage.tsx`), leading to a poor developer experience.

## Scope
- **In-Scope**:
  - Consolidation of secrets creation, cataloging, personal access tokens, and mesh sync status into a single unified page: **`SecretsPage.tsx`** mapped to the `/secrets` route.
  - Addition of a new "Mesh Sync" tab in `SecretsPage.tsx` displaying node status and logs.
  - Integration of a "Create Secret" form/action in the catalog view of `SecretsPage.tsx`.
  - Removal of legacy, redundant files: `ApiKeysPage.tsx`, `ModelsPage.tsx`, and `VaultPage.tsx` (and their test files).
  - Renaming the navigation sidebar item to "Secrets & Keys".
- **Out-of-Scope**:
  - Modifications to the backend encryption/decryption keys or vault storage logic.
  - Adding new mesh replication transport protocols.

## Success Criteria
- A single consolidated "Secrets & Keys" interface `/secrets` handles PATs, credentials catalog, mesh sync, cost usage, and onboarding imports.
- Removal of redundant routes, sidebars, and unused legacy page files from the codebase.
- 100% passing tests for all frontend components and routes.

# Secrets Consolidation Audit

## Current State Analysis

We have multiple files, pages, and components in the frontend that manage secrets and keys, resulting in duplication and a confusing user experience.

### Involved Files & Modules
1. [ApiKeysPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/ApiKeysPage.tsx)
   - Route: `/keys` ("Keys & Usage")
   - Current role: Manages the **Secrets Catalog** (viewing provider metadata, auto-rotation, monthly caps, 30d usage, recording sample usage, rotating values, exporting `.env` projections) and **Personal Access Tokens (PATs)** for accessing the local TR REST API.
   - Status: Active, but has no form/action to add a brand new secret from scratch.
2. [SecretsPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/SecretsPage.tsx)
   - Route: `/secrets` ("Secrets Sync")
   - Current role: Manages mesh syncing status/nodes table and includes forms to add/edit/delete secret values.
   - Status: Duplicated. The editing and deleting functions duplicate what `ApiKeysPage` does, but it has the *only* UI form to add a completely new secret value from scratch.
3. [ModelsPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/ModelsPage.tsx)
   - Current role: Direct input forms for Google, OpenAI, Anthropic, and OpenRouter API keys.
   - Status: Legacy, unused, and completely superseded by the `cloud` tab in `ApiKeysPage.tsx`.
4. [UsagePage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/UsagePage.tsx)
   - Current role: Displays billing & token usage graphs.
   - Status: Embedded directly as a tab inside `ApiKeysPage.tsx` rather than being a top-level route.
5. [VaultPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/VaultPage.tsx)
   - Current role: Document database lists and tables.
   - Status: Legacy and unused. Completely superseded by `MemoryPage.tsx`.
6. [App.tsx](file:///Users/greg/Github/total-recall/frontend/src/App.tsx)
   - Contains nav items and route definitions for both `/keys` and `/secrets`.

### Duplication & Issues
- **Duplicated Forms**: Both pages support deleting and modifying secrets, but only `SecretsPage` allows adding a new one.
- **Confusing Split**: Users must go to "Keys & Usage" to edit metadata/limits/rotation, but "Secrets Sync" to force mesh synchronization.
- **Dead Code**: `VaultPage.tsx` and its spec file clutter the directory and are not routed.

### Safety & Compatibility
All backend routes in `/api/secrets/*` are clean, secure, and ready. We only need to consolidate the frontend views.

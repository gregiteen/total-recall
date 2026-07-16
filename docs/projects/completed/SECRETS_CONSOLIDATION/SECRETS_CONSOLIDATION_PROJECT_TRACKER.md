# Secrets Consolidation Project Tracker

## Project Progress Checklist

### Phase 1: Reorganize and Unify Page as SecretsPage.tsx
- [x] Rename `ApiKeysPage.tsx` and `ApiKeysPage.spec.tsx` to `SecretsPage.tsx` and `SecretsPage.spec.tsx` -> `[x]`
- [x] Add `sync` tab option to `SecretsPage.tsx` -> `[x]`
- [x] Wire up state variables (`syncNodes`, `syncLogs`, `syncing`, `localChecksum`) -> `[x]`
- [x] Implement sync render layout in `SecretsPage.tsx` -> `[x]`

### Phase 2: Add Secret Creation Action
- [x] Add `isCreating` state and "Create Secret" button -> `[x]`
- [x] Render Creation Panel in right sidebar -> `[x]`
- [x] Wire up key creation form submissions -> `[x]`

### Phase 3: Route Cleanup & Legacy Code Removal
- [x] Update `App.tsx` sidebar navigation routes and label -> `[x]`
- [x] Redirect `/keys` route to `/secrets` -> `[x]`
- [x] Delete legacy `ModelsPage.tsx` and `ModelsPage.spec.tsx` files -> `[x]`
- [x] Delete legacy `VaultPage.tsx` and `VaultPage.spec.tsx` files -> `[x]`

### Phase 4: Test Suite & Validation
- [x] Verify typescript compile -> `[x]`
- [x] Verify linter -> `[x]`
- [x] Run vitest suite -> `[x]`

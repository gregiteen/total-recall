# Secrets Consolidation Development Plan

## Implementation Phases

### Phase 1: Reorganize and Unify Page as SecretsPage.tsx
- [ ] Rename `ApiKeysPage.tsx` and `ApiKeysPage.spec.tsx` to `SecretsPage.tsx` and `SecretsPage.spec.tsx` (overwriting the old sync-only page).
- [ ] Add `sync` to `Tab` types in the new `SecretsPage.tsx`.
- [ ] Implement state management for mesh synchronization logs, sync nodes status, and loading/syncing states in `SecretsPage.tsx`.
- [ ] Import syncing endpoints (`triggerSync`, `getSyncStatus`) from the secrets API in `SecretsPage.tsx`.
- [ ] Render the `'sync'` tab containing the mesh nodes table, logs panel, and "Force Sync Mesh" button.

### Phase 2: Add Secret Creation Panel
- [ ] Add `isCreating` state boolean and "Create Secret" button to `SecretsPage.tsx`.
- [ ] Implement right side creation form panel taking key name, value, provider, scope, and repos.
- [ ] Wire panel submit action to `addSecret` api endpoint and trigger catalog reloading on completion.

### Phase 3: Route Cleanup & Legacy Code Removal
- [ ] Modify `App.tsx` sidebar navigation to rename `/secrets` to "Secrets & Keys" and map `/keys` route to redirect to `/secrets`.
- [ ] Remove unused legacy components `ModelsPage.tsx` and `VaultPage.tsx` (and their corresponding `.spec.tsx` files).

### Phase 4: Test Suite & Validation
- [ ] Verify typescript full compilation and linting.
- [ ] Update frontend test suite specs to test all tabs in `SecretsPage` (catalog, sync, import, cloud, pats).
- [ ] Run vitest to ensure all tests pass.

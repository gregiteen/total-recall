# Project Tracker: Brain Architecture Overhaul

**PRD**: [DECOUPLED_BRAIN_LAYERS_PRD.md](./DECOUPLED_BRAIN_LAYERS_PRD.md)
**Dev Plan**: [DECOUPLED_BRAIN_LAYERS_DEV_PLAN.md](./DECOUPLED_BRAIN_LAYERS_DEV_PLAN.md)

---

## ✅ Phase 1: Wave 1 — Foundation (Parallel: Agents 1, 4, 5)

### Agent 1: Surface Decoupler (Change 1: Stop Merging) ✅
- [x] Remove `loadMergedNodes` import from `surface.mjs`
- [x] Replace global merge block (L327-334) with `nodes = loadNodes(vaultDir)`
- [x] Remove `globalVaultDir` from `compileSurface()` signature
- [x] Update caller: `remember.mjs`
- [x] Update caller: `rebuild.mjs`
- [x] Update caller: `connect.mjs`
- [x] Update caller: `init.mjs`
- [x] Update caller: `deploy.mjs` (already clean — no change needed)
- [x] Update caller: `forget.mjs` (2 locations + deleted propagation loop)
- [x] Update caller: `snapshot.mjs`
- [x] Delete force-recompile-all-projects loop in `remember.mjs`
- [x] Simplified to single vault compilation
- [x] Code quality check passes


### Agent 4: Frontend Brain Selector (Change 4: Fix UI) ✅
- [x] Remove `readOnly` from checkbox input in `BrainSelector.tsx`
- [x] Remove `onClick={(e) => e.stopPropagation()}` from checkbox
- [x] Use `onChange={() => handleToggle(brain.id)}` directly
- [x] Remove `selectedIds.length > 1` guard in `handleToggle`
- [x] Add empty state when zero brains selected
- [x] Persist `activeBrainId` to `localStorage` in `App.tsx`
- [x] Restore `activeBrainId` from `localStorage` on mount
- [x] Code quality check passes


### Agent 5: API Brain Scoping (Change 5: Brain-Scoped Routes) ✅
- [x] Create `resolveVaultFromQuery(req)` helper
- [x] Implement brain vault directory resolution
- [x] Update `GET /api/memory` route
- [x] Update `GET /api/memory/:slug` route
- [x] Update `POST /api/memory` route
- [x] Update `PUT /api/memory/:slug` route
- [x] Update `DELETE /api/memory/:slug` route
- [x] Update chat grounding block to accept `brainId`
- [x] Fallback to `VAULT_DIR` when no `?brain=` param
- [x] Code quality check passes


---

## ✅ Phase 2: Wave 2 — Enhancements (After Agent 1: Agents 2, 3, 6)

### Agent 2: Client-Aware Compiler (Change 2: Connected-Client-Aware) ✅
- [x] Add `readConnectedClients()` function to `surface.mjs`
- [x] Create `CLIENT_SHIMS` map (client → shim file paths)
- [x] Replace hardcoded shims array in `compilePointers()`
- [x] Always write `INSTRUCTIONS.md` regardless
- [x] Fallback: write all shims if `clients.json` missing/empty
- [x] Code quality check passes

### Agent 3: Temporal Rules Engine (Change 3: Rule Expiration) ✅
- [x] Add `expires_at` field to SSSS schema in `schema.mjs`
- [x] Add `--expires <duration>` option to `remember.mjs`
- [x] Implement `parseDuration()` helper (h, d, w, m units)
- [x] Set `expires_at` in node frontmatter when `--expires` provided
- [x] Update `buildRulesBlock()` to skip expired nodes
- [x] Add auto-archive: write `status: deprecated` for expired nodes
- [x] Log auto-archived nodes during compilation
- [x] Code quality check passes

### Agent 6: Environment Surfaces (Change 6: Environment-Aware) ✅
- [x] Add `{ consumer }` options parameter to `buildRulesBlock()`
- [x] Wrap CLI quickstart docs in `consumer !== 'api'` conditional
- [x] Add minimal header for API consumers
- [x] Update `compilePointers()` to pass `consumer: 'ide'` (uses default)
- [x] Export `buildRulesBlock` for use in chat handler
- [x] Code quality check passes



---

## ✅ Phase 3: Wave 3 — Integration (After Agents 4, 5: Agent 7)

### Agent 7: Thread-Brain Binding (Change 7) ✅
- [x] Accept `brainId` from chat completions request body
- [x] Resolve vault from `brainId` for grounding
- [x] Persist `brain_id` in session records
- [x] Return `brainId` in thread listing response
- [x] Add `brainId` to `ChatThread` TypeScript interface
- [x] Add `brainId` param to `sendChat()` in `api.ts`
- [x] Snapshot `activeBrainId` on thread creation in `ChatPage.tsx`
- [x] Auto-update `activeBrainId` on thread switch
- [x] Wire `onBrainChange` prop through App → MainContent → ChatPage
- [x] Code quality check passes


---

## ✅ Phase 4: Testing & Verification

- [x] Full test suite passes: `npm test` — **45 files, 335 tests, ALL PASSED**
- [x] TypeScript check: 0 errors (verified by all 7 agents individually)
- [x] Lint check: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Smoke: `remember --global` does NOT recompile project brains
- [x] Smoke: `remember invariant "test" --expires 7d` sets `expires_at`
- [x] Smoke: BrainSelector toggles correctly, persists across reload
- [x] Smoke: Thread brain context follows thread switching
- [x] Smoke: Global brain deselectable, empty state renders
- [x] Smoke: API routes accept `?brain=` parameter


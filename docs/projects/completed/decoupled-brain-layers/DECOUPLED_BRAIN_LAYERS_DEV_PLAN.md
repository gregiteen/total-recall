# Development Plan: Brain Architecture Overhaul

**PRD**: [DECOUPLED_BRAIN_LAYERS_PRD.md](./DECOUPLED_BRAIN_LAYERS_PRD.md)
**Tracker**: [DECOUPLED_BRAIN_LAYERS_PROJECT_TRACKER.md](./DECOUPLED_BRAIN_LAYERS_PROJECT_TRACKER.md)

---

## Agent Assignment Matrix

Each change is assigned to a dedicated parallel agent. Agents with no dependencies run simultaneously.

| Agent | Role | Change | Key Files | Dependencies |
|-------|------|--------|-----------|-------------|
| **Agent 1** | Surface Decoupler | Change 1: Stop Merging | `surface.mjs`, `remember.mjs`, `rebuild.mjs`, `connect.mjs`, `init.mjs`, `deploy.mjs`, `forget.mjs`, `snapshot.mjs` | None |
| **Agent 2** | Client-Aware Compiler | Change 2: Connected-Client-Aware | `surface.mjs` (compilePointers only) | Agent 1 (touches same file) |
| **Agent 3** | Temporal Rules Engine | Change 3: Rule Expiration | `schema.mjs`, `surface.mjs` (buildRulesBlock only), `remember.mjs` | Agent 1 (touches same file) |
| **Agent 4** | Frontend Brain Selector | Change 4: Fix Brain Selector UI | `BrainSelector.tsx`, `App.tsx` | None |
| **Agent 5** | API Brain Scoping | Change 5: Brain-Scoped API Routes | `api.mjs`, `routes/memory.mjs`, `routes/_shared.mjs` | None |
| **Agent 6** | Environment Surfaces | Change 6: Environment-Aware Surface | `surface.mjs` (buildRulesBlock only) | Agent 1 (touches same file) |
| **Agent 7** | Thread-Brain Binding | Change 7: Thread-Level Brain | `api.mjs`, `api.ts`, `ChatPage.tsx` | Agents 4, 5 |

### Execution Waves

```
Wave 1 (parallel): Agent 1, Agent 4, Agent 5
Wave 2 (parallel): Agent 2, Agent 3, Agent 6  (after Agent 1 completes — same file)
Wave 3 (serial):   Agent 7                     (after Agents 4, 5 complete — depends on both)
```

---

## Wave 1: Foundation (Parallel — No Dependencies)

### Agent 1: Surface Decoupler

**Goal**: Remove the global merge from `compileSurface()` and the force-recompile loop from `remember.mjs`.

**Steps**:
1. In `src/core/surface.mjs` L327: Replace the `if (globalVaultDir...)` block with `nodes = loadNodes(vaultDir);`
2. Remove `globalVaultDir` from `compileSurface()` function signature
3. Remove `import { loadMergedNodes }` from surface.mjs L3
4. Update all callers to stop passing `globalVaultDir`:
   - `src/cli/remember.mjs` — remove globalVaultDir from compileSurface call
   - `src/cli/rebuild.mjs` — remove globalVaultDir from compileSurface call
   - `src/cli/connect.mjs` — remove globalVaultDir from compileSurface call
   - `src/cli/init.mjs` — remove globalVaultDir from compileSurface call
   - `src/cli/deploy.mjs` — remove globalVaultDir from compileSurface call
   - `src/cli/forget.mjs` — remove globalVaultDir from compileSurface calls (2 locations)
   - `src/cli/snapshot.mjs` — remove globalVaultDir from compileSurface call
5. In `src/cli/remember.mjs` L269-306: Delete the for-loop that iterates all projects and recompiles. Replace with a simple log: `console.log('✓ Saved to global brain.');`
6. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

### Agent 4: Frontend Brain Selector

**Goal**: Fix the 3 BrainSelector bugs and wire state to localStorage.

**Steps**:
1. In `BrainSelector.tsx`: Remove `readOnly` and `onClick={(e) => e.stopPropagation()}` from checkbox input
2. Change to `onChange={() => handleToggle(brain.id)}`
3. Remove the `if (selectedIds.length > 1)` guard in `handleToggle`
4. Allow deselecting to zero — add empty state message
5. In `App.tsx`: Persist `activeBrainId` to `localStorage` on change
6. On mount, restore from `localStorage` (default: `'global'`)
7. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

### Agent 5: API Brain Scoping

**Goal**: Make memory API routes brain-aware via `?brain=<id>` query param.

**Steps**:
1. Create `resolveVaultFromQuery(req)` helper function in `api.mjs`
2. Use `resolveBrainVaultDir()` from `config.mjs` (or implement if missing)
3. Update `GET /api/memory` to use resolved vault
4. Update `GET /api/memory/:slug` to use resolved vault
5. Update `POST /api/memory` to use resolved vault
6. Update `PUT /api/memory/:slug` to use resolved vault
7. Update `DELETE /api/memory/:slug` to use resolved vault
8. Update grounding block in chat completions (L564-577) to accept `brainId` from request body and resolve vault
9. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

---

## Wave 2: Enhancements (After Agent 1 — Same File Edits)

### Agent 2: Client-Aware Compiler

**Goal**: Only write shim files for connected IDE clients.

**Steps**:
1. Add `readConnectedClients(clientsPath)` function to `surface.mjs`
2. Replace hardcoded `shims` array in `compilePointers()` with CLIENT_SHIMS map
3. Read `config/clients.json` — if exists, only write shims for connected clients
4. If `clients.json` doesn't exist or is empty, write all shims (backward compatible)
5. Always write `INSTRUCTIONS.md` regardless of clients.json
6. Verify no regression: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

### Agent 3: Temporal Rules Engine

**Goal**: Add `expires_at` to schema, compiler filtering, and CLI `--expires` flag.

**Steps**:
1. Add `expires_at: ssssDatetime().optional().nullable()` to schema in `schema.mjs`
2. Add `--expires <duration>` option to `remember.mjs` CLI command definition
3. Implement `parseDuration(str)` helper: `"7d"` → 7 days from now, `"2w"` → 14 days, etc.
4. Set `expires_at` in node frontmatter when `--expires` is provided
5. Update `buildRulesBlock()` in `surface.mjs` to filter out expired nodes
6. Add auto-archive logic: during compilation, write `status: deprecated` back to disk for expired nodes
7. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

### Agent 6: Environment Surfaces

**Goal**: Skip CLI quickstart docs for API consumers.

**Steps**:
1. Add `{ consumer = 'ide' }` options parameter to `buildRulesBlock()`
2. Wrap the CLI quickstart docs block (L119-192) in `if (consumer !== 'api')` conditional
3. Add a minimal header for API consumers: `"## Total Recall — Active Memory Context"`
4. Update `compilePointers()` to pass `consumer: 'ide'` (explicit)
5. Export `buildRulesBlock` for use in `api.mjs` chat handler with `consumer: 'api'`
6. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

---

## Wave 3: Integration (After Agents 4, 5)

### Agent 7: Thread-Brain Binding

**Goal**: Thread metadata carries brainId; switching threads auto-switches brain.

**Steps**:
1. In `api.mjs` chat completions handler: add `brainId` to destructured request body
2. Use `resolveVaultFromQuery()` (from Agent 5) with `brainId` to scope grounding
3. Persist `brain_id` in session records written by `writeSessionRecord()`
4. In thread listing endpoint: parse `brain_id` from the first session record and include in response
5. In `api.ts`: Add `brainId` field to `ChatThread` interface
6. In `api.ts` `sendChat()`: Add `brainId` parameter, include in request body
7. In `ChatPage.tsx`: On thread creation, snapshot `activeBrainId`
8. In `ChatPage.tsx`: On thread switch, update `activeBrainId` from thread's `brainId`
9. Verify: Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`

---

## Verification Phase

After all agents complete:
1. Run full test suite: `npm test`
2. Run TypeScript check: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
3. Run lint: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
4. Manual smoke test:
   - `npx total-recall remember fact "test" --global` → should NOT recompile project brains
   - `npx total-recall remember invariant "temp rule" --expires 7d` → should set expires_at
   - Dashboard: BrainSelector toggles work, brain persists across page reload
   - Dashboard: Create thread in global brain → switch to project brain → create new thread → switch back → brain context follows thread

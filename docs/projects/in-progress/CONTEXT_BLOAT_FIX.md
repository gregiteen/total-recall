# Project Tracker: Context Bloat Fix

## ✅ Phase 1: Total Recall Compiler Optimization
- [x] Update `src/core/surface.mjs` to stop generating all client shims when `clients.json` is missing.
- [x] Remove the fallback loop that writes `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, etc. indiscriminately.
- [x] Prevent `writeShim` from destroying existing symlinks.
- [x] Ensure `npx total-recall connect` is the only way client-specific shims are generated.

## ✅ Phase 2: Testing & Verification
- [x] Run `vitest run` to ensure compiler tests pass.
- [x] Test `npx total-recall compile` on a fresh project to verify only `INSTRUCTIONS.md` is generated.
- [x] Connect a client via `npx total-recall connect` to verify it registers in `clients.json` and updates the correct shim.

## ⏳ Phase 3: Deployment
- [ ] Update version in `package.json`.
- [ ] Run typescript and lint checks.
- [ ] Publish the fix to npm.

# Bring Your Own Model (BYOM) Architecture Tracker

## ✅ Phase 1: Planning and Discovery
- [x] Identify requirements and scope.
- [x] Create PRD (`BYOM_ARCHITECTURE_PRD.md`).
- [x] Determine backend data structures required for the new page components. **Resolved 2026-08-01.** Two structures, both already shipped:
  - **Model catalogue** — `GeminiModelInfo { id: string; displayName: string }`, served per provider by `GET /api/{gemini,claude,openai,openrouter}-models` (`src/server/routes/models.mjs`) and consumed via `frontend/src/api/models.ts`. One shape across all four providers; no per-provider variant is needed.
  - **Provider credentials** — read from `configData.secrets` (the encrypted secrets store), never from `.env`.
  - Note: `ModelsPage.tsx` no longer exists. Its panels were folded into `SettingsPage.tsx` in a later refactor, so the "new page components" this item referred to are the Settings panels. Nothing further is required.

## ✅ Phase 2: Refactoring Frontend UI
- [x] In `frontend/src/App.tsx`, rename `Deployments` route to `Models & Agents` (path: `/models`).
- [x] Create `frontend/src/pages/ModelsPage.tsx`.
- [x] Migrate the CLI Reasoning Agents diagnostic panel from `DeploymentsPage.tsx` to `ModelsPage.tsx`.
- [x] Add an Ollama/Local Provider Connection configuration panel to `ModelsPage.tsx`.
- [x] Add a Cloud Models (API Keys) configuration panel to `ModelsPage.tsx` (linked to `configData.secrets`).
- [x] Delete `DeploymentsPage.tsx`.

## ✅ Phase 3: Testing & Verification
- [x] Ensure `npm run build` succeeds without TypeScript errors.
- [x] Verify the UI correctly updates config properties (e.g. `google_api_key`) and synchronizes with `SettingsPage` backend data structures.
- [x] Verify the CLI Agents diagnostic tool still functions flawlessly.

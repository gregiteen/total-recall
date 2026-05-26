# Dynamic Brain Graph Sync — Development Plan

## Phase 1: Dashboard Cleanup & Automatic Model Selection
- Purge `EmergencyAlertBanner` component definition and layout tag from the dashboard.
- Delete the custom submodel input text box and `'custom'` model selection options.
- Automatically initialize active model to the first returned dynamic Gemini model from `/api/gemini-models`.
- Fix any stale TypeScript/ESLint declaration errors.

## Phase 2: Multi-Brain Selection & Parallel Loader
- Update `listMemory` in `frontend/src/api.ts` to support comma-separated brain IDs.
- Execute parallel fetches across all selected brain layers, merge nodes, and apply Project-local precedence to deduplicate by slug.
- Refactor `BrainSelector.tsx` to handle checkboxes next to options, toggle selections without closing the dropdown, compute aggregated node counts and names, and display multi-layered gradient indicator dots.
- Implement click-outside listener to auto-close the dropdown.

## Phase 3: Dynamic 3D Constellations & Markdown Drawer Node Viewer
- Map `activeBrainId` state down to both `ChatPage` and `MemoryPage` to trigger dynamic reloading upon selection.
- Update `Graph3D.tsx` to import `renderMarkdown` from `MarkdownUtils.tsx`.
- Replace the short summary excerpt in the detail visual drawer with full visual markdown rendering of the node.
- Design a premium glassmorphic `Constellation Filters` overlay panel in `Graph3D` top-right, defaulting visible nodes to **Research Projects and Observations** (hiding rules and threads by default).
- Color-code Rules (Indigo) separately from Observations (Purple) inside the visual space.

## Phase 4: Testing & Verification
- Verify build success.
- Audit ESLint and TypeScript compilation gates.
- Execute entire Vitest unit test suite to verify 100% pass status.

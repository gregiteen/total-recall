# Dynamic Brain Graph Sync — Project Tracker

## ⏳ Phase 1: Dashboard Cleanup & Automatic Model Selection
- [x] Purge EmergencyAlertBanner component definition and layout tag from the dashboard
- [x] Delete custom submodel input text box and `'custom'` model selection options
- [x] Automatically initialize active model to the first returned dynamic Gemini model from `/api/gemini-models`
- [x] Fix stale TypeScript declaration errors in ChatPage.tsx

## ⏳ Phase 2: Multi-Brain Selection & Parallel Loader
- [x] Update `listMemory` in `frontend/src/api.ts` to support comma-separated brain IDs
- [x] Execute parallel fetches across all selected brain layers, merge nodes, and apply Project-local precedence to deduplicate by slug
- [x] Refactor `BrainSelector.tsx` to handle checkboxes next to options, toggle selections without closing the dropdown, compute node counts and names, and display multi-layered gradient indicator dots
- [x] Implement click-outside listener to auto-close the dropdown

## ⏳ Phase 3: Dynamic 3D Constellations & Markdown Drawer Node Viewer
- [x] Map `activeBrainId` state down to both `ChatPage` and `MemoryPage` to trigger dynamic reloading upon selection
- [x] Update `Graph3D.tsx` to import `renderMarkdown` from `MarkdownUtils.tsx`
- [x] Replace the short summary excerpt in the detail visual drawer with full visual markdown rendering of the node
- [x] Design a premium glassmorphic `Constellation Filters` overlay panel in `Graph3D` top-right, defaulting visible nodes to **Research Projects and Observations** (hiding rules and threads by default)
- [x] Color-code Rules (Indigo) separately from Observations (Purple) inside the visual space

## ⏳ Phase 4: Testing & Verification
- [x] Verify Vite production build success
- [x] Audit ESLint and TypeScript compilation gates
- [x] Execute entire Vitest unit test suite to verify 100% pass status

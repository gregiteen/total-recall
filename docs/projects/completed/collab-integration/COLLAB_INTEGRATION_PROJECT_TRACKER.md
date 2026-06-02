# Project Tracker: Collaborative Teams Platform & Glassmorphic Graph Overlay

## ✅ Phase 1: Core Backend Routes & WS Infrastructure
- [x] Create [collab.mjs](file:///Users/greg/Github/total-recall/src/server/routes/collab.mjs) helper routes for workspaces, groups, URL annotations, and WebSocket connections
- [x] Register routes on index server and mount them securely inside [index.mjs](file:///Users/greg/Github/total-recall/src/server/index.mjs) and [rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs)

## ✅ Phase 2: Frontend Components & App Routing
- [x] Implement [CollabPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/CollabPage.tsx) page with group management, workspace creation, and simulated browser note pinning
- [x] Implement [GraphPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/GraphPage.tsx) standalone 3D Graph layout view page
- [x] Create custom glassmorphic overlay for Chat dashboard on top of 3D Graph layout inside [ChatPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/ChatPage.tsx)
- [x] Wire all subpages into routing layout sidebar lists inside [App.tsx](file:///Users/greg/Github/total-recall/frontend/src/App.tsx)

## ✅ Phase 3: Help Documentation Updates
- [x] Create help document `docs/reference/collab.md` to document workspaces, groups, real-time WebSocket syncing, and note pinning features
- [x] Expose the collaboration topic `collab` from `/api/help` endpoint inside `src/server/rest.mjs`
- [x] Verify the collaboration topic renders properly inside `HelpPage.tsx`

## ✅ Phase 4: Testing & Verification
- [x] Run TypeScript quality checks using `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Run Lint checks using `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Run production Vite bundle builds
- [x] Conduct end-to-end WebSocket sync sandbox validation
